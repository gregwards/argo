"""Instructor dashboard API."""

from statistics import median

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import (
    get_db, Session as SessionModel, CompetencyProfile, Assessment, Course,
    ProfileScoreEdit, User,
)
from api.deps import get_current_user

router = APIRouter()


@router.get("/dashboard/assessments")
async def list_instructor_assessments(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all assessments for the authenticated instructor (D-09)."""
    result = await db.execute(
        select(Assessment)
        .join(Course, Assessment.course_id == Course.id)
        .where(Course.instructor_id == user.id)
        .order_by(Assessment.created_at.desc())
    )
    assessments = result.scalars().all()

    assessment_list = []
    for a in assessments:
        count_result = await db.execute(
            select(func.count(SessionModel.id)).where(SessionModel.assessment_id == a.id)
        )
        session_count = count_result.scalar() or 0
        assessment_list.append({
            "id": str(a.id),
            "title": a.title,
            "status": a.status,
            "slug": a.slug,
            "session_count": session_count,
            "duration_target_minutes": a.duration_target_minutes,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "published_at": a.published_at.isoformat() if a.published_at else None,
        })
    return {"assessments": assessment_list}


@router.get("/dashboard/assessments/{assessment_id}/summary")
async def get_assessment_summary(assessment_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SessionModel).where(
            SessionModel.assessment_id == assessment_id,
            SessionModel.status == "completed",
        )
    )
    sessions = result.scalars().all()
    return {
        "total_sessions": len(sessions),
        "avg_duration": sum(s.duration_seconds or 0 for s in sessions) / max(len(sessions), 1),
        "avg_turns": sum(s.turn_count or 0 for s in sessions) / max(len(sessions), 1),
    }


@router.get("/dashboard/assessments/{assessment_id}/sessions")
async def list_assessment_sessions(assessment_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """List sessions for an assessment, including student info and extraction attempt flags (D-12)."""
    result = await db.execute(
        select(SessionModel, User.email, User.name)
        .join(User, SessionModel.student_id == User.id)
        .where(SessionModel.assessment_id == assessment_id)
        .order_by(SessionModel.created_at.desc())
    )
    rows = result.all()
    sessions = []
    for s, email, name in rows:
        # Extraction attempt flags are a subset of session flags filtered by type
        extraction_flags = [f for f in (s.flags or []) if f.get("type") == "extraction_attempt"]
        sessions.append({
            "id": str(s.id),
            "student_email": email,
            "student_name": name,
            "status": s.status,
            "turn_count": s.turn_count,
            "duration_seconds": s.duration_seconds,
            "flags": s.flags or [],
            "extraction_flags": extraction_flags,
            "has_extraction_flags": len(extraction_flags) > 0,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })
    return {"sessions": sessions}


@router.get("/dashboard/assessments/{assessment_id}/score-distributions")
async def get_score_distributions(assessment_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Per-criterion score distributions for box plot visualization (D-11).

    Uses instructor_score when present (overridden), otherwise ai_score.
    """
    result = await db.execute(
        select(CompetencyProfile).where(CompetencyProfile.assessment_id == assessment_id)
    )
    profiles = result.scalars().all()

    # Collect scores per criterion across all student profiles
    criterion_scores: dict[str, list[int]] = {}
    criterion_info: dict[str, dict] = {}
    for profile in profiles:
        for crit in (profile.criteria_scores or []):
            cid = crit.get("criterion_id", "")
            # Prefer instructor_score (override) over ai_score
            score = crit.get("instructor_score") or crit.get("ai_score", 0)
            max_score = crit.get("max_score", 100)
            if cid not in criterion_scores:
                criterion_scores[cid] = []
                criterion_info[cid] = {"name": crit.get("criterion_name", cid), "max_score": max_score}
            criterion_scores[cid].append(score)

    distributions = []
    for cid, scores in criterion_scores.items():
        sorted_scores = sorted(scores)
        n = len(sorted_scores)
        if n == 0:
            continue
        q1_idx = n // 4
        q3_idx = (3 * n) // 4
        distributions.append({
            "criterion_id": cid,
            "criterion_name": criterion_info[cid]["name"],
            "max_score": criterion_info[cid]["max_score"],
            "min": sorted_scores[0],
            "q1": sorted_scores[q1_idx],
            "median": median(sorted_scores),
            "q3": sorted_scores[q3_idx],
            "max": sorted_scores[-1],
            "count": n,
        })
    return {"distributions": distributions}


class ScoreEditRequest(BaseModel):
    criterion_id: str
    new_score: int


@router.put("/dashboard/sessions/{session_id}/profile/scores")
async def edit_criterion_score(
    session_id: str,
    body: ScoreEditRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Instructor overrides an AI-generated criterion score. Records audit trail (D-03, D-04, T-04-07)."""
    if user.role != "instructor":
        raise HTTPException(status_code=403, detail="Only instructors can edit scores")

    result = await db.execute(
        select(CompetencyProfile).where(CompetencyProfile.session_id == session_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    scores = list(profile.criteria_scores or [])
    original_score = None
    for crit in scores:
        if crit["criterion_id"] == body.criterion_id:
            original_score = crit.get("ai_score", 0)
            crit["instructor_score"] = body.new_score
            break

    if original_score is None:
        raise HTTPException(status_code=404, detail="Criterion not found in profile")

    profile.criteria_scores = scores

    # Write audit row — preserves original AI score and editor identity
    edit = ProfileScoreEdit(
        profile_id=profile.id,
        criterion_id=body.criterion_id,
        original_score=original_score,
        new_score=body.new_score,
        edited_by=user.id,
    )
    db.add(edit)
    await db.commit()
    return {"status": "updated", "criterion_id": body.criterion_id, "new_score": body.new_score}

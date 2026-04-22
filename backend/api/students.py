"""Student-facing API — portal-authenticated endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db, Session as SessionModel, AssessmentEnrollment, Assessment, CompetencyProfile, User
from api.deps import get_portal_user

router = APIRouter()


@router.get("/student/assessments")
async def list_student_assessments(
    user: User = Depends(get_portal_user),
    db: AsyncSession = Depends(get_db),
):
    """List all assessments the authenticated student is enrolled in (D-16)."""
    result = await db.execute(
        select(Assessment)
        .join(AssessmentEnrollment, Assessment.id == AssessmentEnrollment.assessment_id)
        .where(AssessmentEnrollment.student_id == user.id)
    )
    assessments = result.scalars().all()
    return {"assessments": [{"id": str(a.id), "title": a.title, "status": a.status} for a in assessments]}


@router.get("/student/sessions")
async def list_student_sessions(
    user: User = Depends(get_portal_user),
    db: AsyncSession = Depends(get_db),
):
    """List all sessions for the authenticated student (D-16, T-04-09).

    Queries only by student_id == user.id — student sees only their own sessions.
    """
    result = await db.execute(
        select(SessionModel, Assessment.title)
        .join(Assessment, SessionModel.assessment_id == Assessment.id)
        .where(SessionModel.student_id == user.id)
        .order_by(SessionModel.created_at.desc())
    )
    rows = result.all()
    sessions = []
    for session_row, assessment_title in rows:
        # Check if profile exists — avoids loading full profile for listing
        profile_result = await db.execute(
            select(CompetencyProfile.id).where(CompetencyProfile.session_id == session_row.id)
        )
        has_profile = profile_result.scalar_one_or_none() is not None
        sessions.append({
            "id": str(session_row.id),
            "assessment_id": str(session_row.assessment_id),
            "assessment_title": assessment_title,
            "status": session_row.status,
            "turn_count": session_row.turn_count,
            "duration_seconds": session_row.duration_seconds,
            "has_profile": has_profile,
            "created_at": session_row.created_at.isoformat() if session_row.created_at else None,
        })
    return {"sessions": sessions}

"""Session management API."""

import os
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db, Session as SessionModel, Assessment, AssessmentEnrollment, CompetencyProfile, Course, User
from api.deps import get_current_user

router = APIRouter()


class CreateSessionRequest(BaseModel):
    assessment_id: str


@router.post("/sessions")
async def create_session(
    body: CreateSessionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new session. Called from lobby before WebRTC connect."""
    payload = user._jwt_payload

    # Verify assessment_id matches JWT (D-02)
    if payload.get("assessment_id") != body.assessment_id:
        raise HTTPException(status_code=403, detail="Assessment access denied")

    # Load assessment
    result = await db.execute(select(Assessment).where(Assessment.id == body.assessment_id))
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    if assessment.status == "closed":
        raise HTTPException(status_code=403, detail="Assessment is closed")

    # Check enrollment
    enrollment = await db.execute(
        select(AssessmentEnrollment).where(
            AssessmentEnrollment.assessment_id == assessment.id,
            AssessmentEnrollment.student_id == user.id,
        )
    )
    if not enrollment.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not enrolled")

    # Check attempt limits (D-03)
    attempt_count = await db.execute(
        select(func.count(SessionModel.id)).where(
            SessionModel.assessment_id == assessment.id,
            SessionModel.student_id == user.id,
            SessionModel.status.in_(["completed", "active"]),
        )
    )
    count = attempt_count.scalar()
    if count >= (assessment.max_attempts or 1):
        raise HTTPException(status_code=403, detail="Maximum attempts reached")

    # Create session record
    session = SessionModel(
        id=uuid4(),
        assessment_id=assessment.id,
        student_id=user.id,
        session_plan_version=assessment.session_plan_version or 0,
        status="pending",
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return {"session_id": str(session.id), "status": "pending"}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SessionModel).where(SessionModel.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "id": str(session.id), "status": session.status,
        "transcript": session.transcript, "turn_count": session.turn_count,
        "duration_seconds": session.duration_seconds,
        "started_at": session.started_at.isoformat() if session.started_at else None,
    }


@router.get("/sessions/{session_id}/profile")
async def get_session_profile(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CompetencyProfile).where(CompetencyProfile.session_id == session_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Fetch assessment title and course name for the report header
    assessment_title = None
    course_name = None
    assessment_result = await db.execute(
        select(Assessment).where(Assessment.id == profile.assessment_id)
    )
    assessment = assessment_result.scalar_one_or_none()
    if assessment:
        assessment_title = assessment.title
        course_result = await db.execute(
            select(Course).where(Course.id == assessment.course_id)
        )
        course = course_result.scalar_one_or_none()
        if course:
            course_name = course.name

    return {
        "id": str(profile.id),
        "criteria_scores": profile.criteria_scores or [],
        "narrative_assessment": profile.narrative_assessment,
        "strengths": profile.strengths or [],
        "growth_areas": profile.growth_areas or [],
        "belief_model_notes": profile.belief_model_notes or "",
        "generated_at": profile.generated_at.isoformat() if profile.generated_at else None,
        "assessment_title": assessment_title,
        "course_name": course_name,
        # Backward compat — competency_map kept until all callers migrate to criteria_scores
        "competency_map": profile.competency_map,
    }


@router.get("/sessions/{session_id}/recording")
async def get_session_recording(session_id: str, db: AsyncSession = Depends(get_db)):
    """Stream session recording audio file (T-04-10).

    recording_ref is a server-generated path stored in DB — not user-supplied input,
    so path traversal is not possible.
    """
    result = await db.execute(
        select(SessionModel).where(SessionModel.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session or not session.recording_ref:
        raise HTTPException(status_code=404, detail="Recording not found")

    file_path = session.recording_ref
    if not os.path.isabs(file_path):
        file_path = os.path.join(os.getcwd(), file_path)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Recording file not found")

    return FileResponse(file_path, media_type="audio/wav", filename=f"session-{session_id}.wav")


@router.get("/sessions/{session_id}/drill-down")
async def get_session_drilldown(session_id: str, db: AsyncSession = Depends(get_db)):
    """Full session data for instructor drill-down view (D-10).

    MVP: open to any authenticated user. Production: add instructor ownership check (T-04-08).
    """
    result = await db.execute(select(SessionModel).where(SessionModel.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Load profile
    profile_result = await db.execute(
        select(CompetencyProfile).where(CompetencyProfile.session_id == session_id)
    )
    profile = profile_result.scalar_one_or_none()

    # Load student info
    student_result = await db.execute(select(User).where(User.id == session.student_id))
    student = student_result.scalar_one_or_none()

    return {
        "session": {
            "id": str(session.id),
            "status": session.status,
            "transcript": session.transcript or [],
            "turn_count": session.turn_count,
            "duration_seconds": session.duration_seconds,
            "started_at": session.started_at.isoformat() if session.started_at else None,
            "completed_at": session.completed_at.isoformat() if session.completed_at else None,
            "flags": session.flags or [],
            "has_recording": bool(session.recording_ref),
        },
        "student": {
            "id": str(student.id) if student else None,
            "email": student.email if student else None,
            "name": student.name if student else None,
        },
        "profile": {
            "id": str(profile.id),
            "criteria_scores": profile.criteria_scores or [],
            "narrative_assessment": profile.narrative_assessment,
            "strengths": profile.strengths or [],
            "growth_areas": profile.growth_areas or [],
            "belief_model_notes": profile.belief_model_notes or "",
        } if profile else None,
    }

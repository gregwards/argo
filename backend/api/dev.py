"""Dev-only API endpoints — protected by site password cookie."""

from datetime import datetime, timedelta
from uuid import uuid4, UUID as PyUUID

import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import (
    get_db, User, Course, Assessment, Session as SessionModel,
    CompetencyProfile,
)

from api.deps import JWT_SECRET, JWT_ALGORITHM

router = APIRouter()


def require_site_auth(site_auth: str | None = Cookie(default=None)):
    """Verify the site_auth cookie is present (set by frontend password gate)."""
    if site_auth != "granted":
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.get("/dev/data")
async def dev_all_data(db: AsyncSession = Depends(get_db), _=Depends(require_site_auth)):
    """Return all assessments, sessions, and profiles for the dev console."""

    # Assessments with course name
    result = await db.execute(
        select(Assessment, Course.name.label("course_name"))
        .join(Course, Assessment.course_id == Course.id)
        .order_by(Assessment.created_at.desc())
    )
    assessments = []
    for row in result.all():
        a = row[0]
        course_name = row[1]
        # Count sessions
        count_result = await db.execute(
            select(func.count(SessionModel.id)).where(SessionModel.assessment_id == a.id)
        )
        session_count = count_result.scalar() or 0
        assessments.append({
            "id": str(a.id),
            "title": a.title,
            "slug": a.slug,
            "status": a.status,
            "course_name": course_name,
            "session_count": session_count,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        })

    # Sessions with student info and profile status
    result = await db.execute(
        select(SessionModel, User.email, User.name, Assessment.title.label("assessment_title"))
        .join(User, SessionModel.student_id == User.id)
        .join(Assessment, SessionModel.assessment_id == Assessment.id)
        .order_by(SessionModel.created_at.desc())
    )
    sessions = []
    for row in result.all():
        s = row[0]
        email = row[1]
        name = row[2]
        assessment_title = row[3]
        # Check profile existence
        profile_result = await db.execute(
            select(func.count(CompetencyProfile.id)).where(CompetencyProfile.session_id == s.id)
        )
        has_profile = (profile_result.scalar() or 0) > 0
        sessions.append({
            "id": str(s.id),
            "student_email": email,
            "student_name": name or "",
            "assessment_title": assessment_title,
            "assessment_id": str(s.assessment_id),
            "status": s.status,
            "turn_count": s.turn_count,
            "duration_seconds": s.duration_seconds,
            "has_profile": has_profile,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })

    # Users
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = [
        {"id": str(u.id), "email": u.email, "name": u.name}
        for u in result.scalars().all()
    ]

    return {"assessments": assessments, "sessions": sessions, "users": users}


@router.post("/dev/seed")
async def dev_seed(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_site_auth),
):
    """Create a default instructor user and course for fresh environments."""
    # Check if instructor already exists
    result = await db.execute(select(User).where(User.role == "instructor"))
    existing = result.scalar_one_or_none()
    if existing:
        return {"ok": True, "message": "Instructor already exists", "user_id": str(existing.id)}

    # Create instructor user
    instructor_id = uuid4()
    instructor = User(
        id=instructor_id,
        email="instructor@argo.education",
        name="Demo Instructor",
        role="instructor",
    )
    db.add(instructor)

    # Create course with the hardcoded ID used by the assessment creation flow
    course = Course(
        id=PyUUID("a0000000-0000-0000-0000-000000000001"),
        instructor_id=instructor_id,
        name="Demo Course",
    )
    db.add(course)
    await db.commit()

    return {
        "ok": True,
        "message": "Seeded instructor + course",
        "user_id": str(instructor_id),
        "course_id": "a0000000-0000-0000-0000-000000000001",
    }


@router.post("/dev/impersonate")
async def dev_impersonate(
    response: Response,
    user_id: str = "",
    assessment_id: str = "",
    role: str = "student",
    db: AsyncSession = Depends(get_db),
    _=Depends(require_site_auth),
):
    """Set session cookie to impersonate any user. Dev only."""
    # Find user
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return {"error": "User not found"}

    now = datetime.utcnow()
    payload = {
        "user_id": str(user.id),
        "email": user.email,
        "iat": now,
        "exp": now + timedelta(hours=12),
    }
    if assessment_id:
        payload["assessment_id"] = assessment_id
    if role == "instructor":
        payload["role"] = "instructor"

    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    response.set_cookie("session", token, httponly=True, samesite="lax", max_age=86400)

    # Also set portal cookie for student pages (no assessment_id)
    portal_payload = {
        "user_id": str(user.id),
        "email": user.email,
        "iat": now,
        "exp": now + timedelta(days=7),
    }
    portal_token = jwt.encode(portal_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    response.set_cookie("portal_session", portal_token, httponly=True, samesite="lax", max_age=86400 * 7, path="/")

    return {"ok": True, "impersonating": user.email, "role": role}

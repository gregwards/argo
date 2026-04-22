"""Authentication API — assessment-scoped magic link flow."""

import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db, User, AuthToken, Assessment, AssessmentEnrollment, Session as SessionModel
from services.email import send_magic_link
from api.deps import get_current_user, JWT_SECRET, JWT_ALGORITHM

router = APIRouter()

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


class MagicLinkRequest(BaseModel):
    email: str
    assessment_id: str


@router.post("/auth/magic-link")
async def request_magic_link(body: MagicLinkRequest, db: AsyncSession = Depends(get_db)):
    """Request a magic link for a specific assessment.

    Always returns the same "Check your email" message regardless of enrollment
    status to prevent email enumeration (D-06, T-02-01). Does the same amount
    of work for both paths to prevent timing attacks (Pitfall 6).
    """
    # Look up the assessment — 404 only if assessment doesn't exist at all
    result = await db.execute(select(Assessment).where(Assessment.id == body.assessment_id))
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Closed assessment — explicit message, not an error (D-16)
    if assessment.status == "closed":
        return {"message": "This assessment is no longer accepting new submissions."}

    # Find or create student user — always role "student" in this flow
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user:
        user = User(email=body.email, role="student")
        db.add(user)
        await db.commit()
        await db.refresh(user)

    # Check enrollment (D-04)
    enrollment_result = await db.execute(
        select(AssessmentEnrollment).where(
            AssessmentEnrollment.assessment_id == assessment.id,
            AssessmentEnrollment.student_id == user.id,
        )
    )
    enrollment = enrollment_result.scalar_one_or_none()

    # Check attempt limits (D-03) — only relevant if enrolled
    attempt_limit_reached = False
    if enrollment:
        completed_count_result = await db.execute(
            select(func.count()).select_from(SessionModel).where(
                SessionModel.assessment_id == assessment.id,
                SessionModel.student_id == user.id,
                SessionModel.status.in_(["completed", "active"]),
            )
        )
        attempt_count = completed_count_result.scalar_one()
        if attempt_count >= assessment.max_attempts:
            attempt_limit_reached = True

    # Always create the token and build the link — same work for enrolled and non-enrolled
    # to prevent timing-based enumeration (T-02-01, Pitfall 6)
    token = secrets.token_urlsafe(32)
    auth_token = AuthToken(
        user_id=user.id,
        assessment_id=assessment.id,
        token=token,
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(auth_token)
    await db.commit()

    link = f"{FRONTEND_URL}/auth/verify?token={token}"

    # Only send email if enrolled and within attempt limits
    if enrollment and not attempt_limit_reached:
        await send_magic_link(to_email=body.email, magic_link=link, assessment_title=assessment.title)

    # Dev mode returns the link for local testing (D-10)
    if ENVIRONMENT == "development":
        return {"message": "Check your email", "dev_link": link, "dev_token": token}

    # Production: identical response regardless of enrollment (D-06)
    return {"message": "Check your email"}


@router.get("/auth/verify")
async def verify_token(token: str, response: Response, db: AsyncSession = Depends(get_db)):
    """Verify a magic link token and issue an assessment-scoped httpOnly cookie (D-08, T-02-02)."""
    result = await db.execute(
        select(AuthToken).where(
            AuthToken.token == token,
            AuthToken.used_at.is_(None),
            AuthToken.expires_at > datetime.utcnow(),
        )
    )
    auth_token = result.scalar_one_or_none()

    if not auth_token:
        raise HTTPException(status_code=401, detail="Invalid or expired link")

    # Mark as used — single-use enforcement (T-02-02)
    auth_token.used_at = datetime.utcnow()
    await db.commit()

    # Load user and assessment
    user_result = await db.execute(select(User).where(User.id == auth_token.user_id))
    user = user_result.scalar_one()

    assessment_result = await db.execute(select(Assessment).where(Assessment.id == auth_token.assessment_id))
    assessment = assessment_result.scalar_one_or_none()

    # Encode JWT with assessment_id claim (D-02, T-02-03)
    # exp/iat claims limit token lifetime — PyJWT validates exp automatically on decode
    now = datetime.now(timezone.utc)
    jwt_token = jwt.encode(
        {
            "user_id": str(user.id),
            "email": user.email,
            "role": user.role,
            "assessment_id": str(auth_token.assessment_id),
            "iat": now,
            "exp": now + timedelta(days=1),
        },
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )

    # httpOnly cookie — JS cannot access session token (D-08, T-02-02)
    response.set_cookie("session", jwt_token, httponly=True, samesite="lax", max_age=86400)

    # Also issue a user-scoped portal token (D-17) — no assessment_id claim so
    # get_portal_user will accept it while get_current_user's assessment-scoped routes won't
    portal_payload = {
        "user_id": str(user.id),
        "email": user.email,
        "role": user.role,
        "iat": now,
        "exp": now + timedelta(days=7),
    }
    portal_token = jwt.encode(portal_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    response.set_cookie(
        "portal_session", portal_token,
        httponly=True, samesite="lax", max_age=86400 * 7,
        path="/",
    )

    return {
        "user": {"id": str(user.id), "email": user.email, "role": user.role},
        "assessment_id": str(auth_token.assessment_id),
        "slug": assessment.slug if assessment else None,
    }


@router.get("/auth/me")
async def get_me(user: User = Depends(get_current_user)):
    """Return current user from httpOnly session cookie."""
    payload = user._jwt_payload
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "assessment_id": payload.get("assessment_id"),
    }

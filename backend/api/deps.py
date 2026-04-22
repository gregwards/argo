"""Shared FastAPI dependencies."""

import os

import jwt
from fastapi import Cookie, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db, User

JWT_SECRET = os.getenv("JWT_SECRET", "")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET environment variable is required — set it in .env or container config")
JWT_ALGORITHM = "HS256"


async def get_current_user(
    session: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Validate httpOnly session cookie and return the authenticated User.

    Attaches _jwt_payload to the user object for downstream access to assessment_id.
    """
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(session, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        result = await db.execute(select(User).where(User.id == payload["user_id"]))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        # Attach payload so downstream handlers can read assessment_id without re-decoding
        user._jwt_payload = payload
        return user
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_portal_user(
    portal_session: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Validate user-scoped portal cookie (no assessment_id required).

    Used for /student portal routes that need access to all student's sessions.
    Rejects assessment-scoped tokens to prevent scope confusion (T-04-11, D-17, Pitfall 5).
    """
    if not portal_session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(portal_session, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        # Portal tokens must NOT have assessment_id — that's the scope signal
        if "assessment_id" in payload:
            raise HTTPException(
                status_code=403,
                detail="Assessment-scoped token cannot access portal",
            )
        result = await db.execute(select(User).where(User.id == payload["user_id"]))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user._jwt_payload = payload
        return user
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

"""Daily room management — creates rooms and spawns bot for voice sessions."""

import os
import time

import aiohttp
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pipecat.transports.daily.utils import (
    DailyRESTHelper,
    DailyRoomParams,
    DailyRoomProperties,
)

from db.database import get_db, Session as SessionModel, Assessment
from pipeline.session_runner import run_bot

router = APIRouter()

DAILY_API_KEY = os.getenv("DAILY_API_KEY", "")


def _short_title(text: str) -> str:
    """Generate a concise 3-4 word section title."""
    words = text.split()
    if len(words) <= 4:
        return text
    filler = {"the", "of", "on", "in", "a", "an", "and", "for", "to", "with"}
    significant = [w for w in words if w.lower() not in filler][:3]
    return " ".join(significant)


@router.post("/sessions/{session_id}/connect")
async def connect_session(
    session_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Create a Daily room and spawn the assessment bot.

    Returns room_url + student token so the frontend can join.
    """
    # Verify session exists
    result = await db.execute(
        select(SessionModel).where(SessionModel.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status not in ("pending",):
        # Only allow connect on pending sessions — prevents double bot spawn
        # if the frontend calls /connect twice (React StrictMode, double-click, etc.)
        raise HTTPException(status_code=400, detail="Session already connected")

    # Load assessment for session plan and TTS config
    assessment_result = await db.execute(
        select(Assessment).where(Assessment.id == session.assessment_id)
    )
    assessment = assessment_result.scalar_one_or_none()
    session_plan = assessment.session_plan if assessment else None
    tts_enabled = assessment.tts_enabled if assessment and assessment.tts_enabled is not None else True

    # Mark session as active
    from datetime import datetime
    session.status = "active"
    session.started_at = session.started_at or datetime.utcnow()
    await db.commit()

    # Create Daily room + tokens
    if not DAILY_API_KEY:
        raise HTTPException(status_code=500, detail="DAILY_API_KEY not configured")

    try:
        async with aiohttp.ClientSession() as http:
            helper = DailyRESTHelper(
                daily_api_key=DAILY_API_KEY,
                aiohttp_session=http,
            )

            room_expiry = int(time.time()) + 1500  # 25 minutes
            room = await helper.create_room(
                DailyRoomParams(
                    properties=DailyRoomProperties(
                        exp=room_expiry,
                        eject_at_room_exp=True,
                        max_participants=2,
                    )
                )
            )
            logger.info(f"Created Daily room {room.url} for session {session_id}")

            bot_token = await helper.get_token(room.url, expiry_time=1500, owner=True)
            student_token = await helper.get_token(room.url, expiry_time=1500, owner=False)
    except Exception as e:
        logger.error(f"Daily API failed for session {session_id}: {e}")
        raise HTTPException(
            status_code=503,
            detail="Voice service temporarily unavailable, please try again in a moment",
        )

    # Spawn bot as background task
    background_tasks.add_task(
        run_bot,
        room_url=room.url,
        bot_token=bot_token,
        session_id=str(session.id),
        session_plan=session_plan,
        tts_enabled=tts_enabled,
    )

    # Build section metadata: multiple LOs → sections = LOs; single LO → sections = criteria
    sections = []
    if assessment and assessment.learning_outcomes and session_plan:
        lo_map = {lo.get("id"): lo.get("text", "") for lo in assessment.learning_outcomes}
        nodes = session_plan.get("nodes", {})
        # Extract LO order from session plan nodes
        seen_los = []
        for key in sorted(nodes.keys(), key=lambda k: int(k.replace("node_", "")) if k.startswith("node_") else 0):
            lo_id = nodes[key].get("learning_outcome_id", "")
            if lo_id and lo_id not in seen_los:
                seen_los.append(lo_id)

        if len(seen_los) == 1:
            # Single LO: sections = criteria (from session plan nodes)
            seen_criteria = []
            for key in sorted(nodes.keys(), key=lambda k: int(k.replace("node_", "")) if k.startswith("node_") else 0):
                crit_name = nodes[key].get("criteria_name", "")
                if crit_name and crit_name not in seen_criteria:
                    seen_criteria.append(crit_name)
            for crit_name in seen_criteria:
                sections.append({"id": crit_name, "title": _short_title(crit_name)})
        else:
            # Multiple LOs: sections = LOs
            for lo_id in seen_los:
                full_title = lo_map.get(lo_id, f"Section {len(sections) + 1}")
                sections.append({"id": lo_id, "title": _short_title(full_title)})

    return {"room_url": room.url, "token": student_token, "sections": sections}

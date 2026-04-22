"""Assessment configuration API — create, configure, generate rubric, publish."""

import asyncio
import hashlib
import json
import re
from datetime import datetime
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db, async_session, Assessment
from api.deps import get_current_user
from compiler.compiler import generate_rubric, generate_rubric_streamed, compile_session_plan
from compiler.lo_extractor import extract_text_from_file, extract_los_from_text

router = APIRouter()


class LearningOutcome(BaseModel):
    id: str | None = None
    text: str


class CreateAssessmentRequest(BaseModel):
    course_id: str
    title: str
    scaffold_type: str  # 'competency_map' or 'socratic_exploration'
    duration_target_minutes: int = 15
    learning_outcomes: list[LearningOutcome]
    additional_instructions: str | None = None
    tts_enabled: bool = True


class UpdateRubricRequest(BaseModel):
    rubric: list[dict]


class RegenerateRowRequest(BaseModel):
    learning_outcome_id: str


@router.post("/assessments/extract-los")
async def extract_learning_outcomes(
    file: Optional[UploadFile] = File(None),
    pasted_text: Optional[str] = Form(None),
):
    """Extract learning outcomes from uploaded file and/or pasted text (COMP-01, COMP-02)."""
    if not file and not pasted_text:
        raise HTTPException(status_code=400, detail="Provide either a file or pasted text")

    text = ""
    if file:
        # Enforce 10MB file size limit (Pitfall 5)
        content = await file.read()
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File size exceeds 10MB limit")
        text = await extract_text_from_file(content, file.content_type or "", file.filename or "")

    if pasted_text:
        text += "\n" + pasted_text

    if not text.strip():
        raise HTTPException(status_code=400, detail="No text could be extracted from the provided materials")

    los = await extract_los_from_text(text)
    return {"learning_outcomes": los, "source_text_length": len(text)}


def _generate_slug(title: str, assessment_id: str) -> str:
    """Generate URL-safe slug from title + short hash of assessment ID."""
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:40]
    suffix = hashlib.md5(assessment_id.encode()).hexdigest()[:6]
    return f"{base}-{suffix}"


@router.post("/assessments")
async def create_assessment(body: CreateAssessmentRequest, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    """Create a new assessment with learning outcomes."""
    los = [
        {"id": lo.id or f"lo_{i+1}", "text": lo.text}
        for i, lo in enumerate(body.learning_outcomes)
    ]

    assessment = Assessment(
        id=uuid4(),
        course_id=body.course_id,
        title=body.title,
        scaffold_type=body.scaffold_type,
        duration_target_minutes=body.duration_target_minutes,
        learning_outcomes=los,
        additional_instructions=body.additional_instructions,
        tts_enabled=body.tts_enabled,
    )
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)

    return {"assessment": _serialize_assessment(assessment)}


@router.post("/assessments/{assessment_id}/generate-rubric")
async def generate_rubric_endpoint(assessment_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    """Generate rubric and coverage summary from confirmed learning outcomes."""
    result = await db.execute(select(Assessment).where(Assessment.id == assessment_id))
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Generate rubric using Claude Sonnet
    rubric_data = await generate_rubric(
        learning_outcomes=assessment.learning_outcomes,
        scaffold_type=assessment.scaffold_type,
        additional_instructions=assessment.additional_instructions or "",
    )

    assessment.rubric = rubric_data["rubric"]
    assessment.coverage_summary = rubric_data["coverage_summary"]
    await db.commit()

    return {
        "rubric": rubric_data["rubric"],
        "coverage_summary": rubric_data["coverage_summary"],
    }


@router.get("/assessments/{assessment_id}/generate-rubric-stream")
async def generate_rubric_stream_endpoint(assessment_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    """Generate rubric with SSE progress updates."""
    result = await db.execute(select(Assessment).where(Assessment.id == assessment_id))
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    async def event_stream():
        lo_count = len(assessment.learning_outcomes or [])
        msg = json.dumps({"type": "status", "message": f"Analyzing {lo_count} learning outcomes..."})
        yield f"data: {msg}\n\n"

        try:
            rubric_data = await generate_rubric_streamed(
                learning_outcomes=assessment.learning_outcomes,
                scaffold_type=assessment.scaffold_type,
                additional_instructions=assessment.additional_instructions or "",
            )

            rubric = rubric_data["rubric"]
            criteria_count = sum(len(r.get("criteria", [])) for r in rubric)
            row_count = len(rubric)
            msg = json.dumps({"type": "status", "message": f"Generated {criteria_count} criteria across {row_count} outcomes. Saving..."})
            yield f"data: {msg}\n\n"

            # Use a fresh DB session for the commit to avoid holding the
            # request-scoped session open for the entire LLM call duration (WR-02)
            async with async_session() as commit_db:
                result = await commit_db.execute(select(Assessment).where(Assessment.id == assessment_id))
                assessment_row = result.scalar_one_or_none()
                if assessment_row:
                    assessment_row.rubric = rubric
                    assessment_row.coverage_summary = rubric_data["coverage_summary"]
                    await commit_db.commit()

            msg = json.dumps({"type": "complete", "rubric": rubric, "coverage_summary": rubric_data["coverage_summary"]})
            yield f"data: {msg}\n\n"
        except Exception as e:
            msg = json.dumps({"type": "error", "message": str(e)})
            yield f"data: {msg}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.put("/assessments/{assessment_id}/rubric")
async def update_rubric(
    assessment_id: str, body: UpdateRubricRequest, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    """Save instructor's rubric edits."""
    result = await db.execute(select(Assessment).where(Assessment.id == assessment_id))
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    assessment.rubric = body.rubric
    assessment.updated_at = datetime.utcnow()
    await db.commit()

    return {"status": "ok"}


@router.post("/assessments/{assessment_id}/regenerate-rubric-row")
async def regenerate_rubric_row(
    assessment_id: str, body: RegenerateRowRequest, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    """Regenerate a single rubric row after LO edit."""
    result = await db.execute(select(Assessment).where(Assessment.id == assessment_id))
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Find the LO
    lo = next((lo for lo in assessment.learning_outcomes if lo["id"] == body.learning_outcome_id), None)
    if not lo:
        raise HTTPException(status_code=404, detail="Learning outcome not found")

    # Regenerate just this row
    row_data = await generate_rubric(
        learning_outcomes=[lo],
        scaffold_type=assessment.scaffold_type,
        additional_instructions=assessment.additional_instructions or "",
    )

    return {
        "rubric_row": row_data["rubric"][0] if row_data["rubric"] else {},
        "coverage_summary_item": row_data["coverage_summary"][0] if row_data["coverage_summary"] else {},
    }


@router.post("/assessments/{assessment_id}/publish")
async def publish_assessment(assessment_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    """Compile session plan and publish the assessment."""
    result = await db.execute(select(Assessment).where(Assessment.id == assessment_id))
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    if not assessment.rubric:
        raise HTTPException(status_code=400, detail="Rubric must be generated before publishing")

    # Compile session plan
    try:
        session_plan = await compile_session_plan(
            learning_outcomes=assessment.learning_outcomes,
            rubric=assessment.rubric,
            scaffold_type=assessment.scaffold_type,
            duration_target_minutes=assessment.duration_target_minutes,
            additional_instructions=assessment.additional_instructions or "",
        )
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not session_plan.get("nodes"):
        raise HTTPException(status_code=500, detail="Session plan compilation produced no nodes")

    assessment.session_plan = session_plan
    assessment.session_plan_version = (assessment.session_plan_version or 0) + 1
    assessment.status = "published"
    assessment.published_at = datetime.utcnow()
    assessment.slug = _generate_slug(assessment.title, str(assessment.id))
    await db.commit()

    share_link = f"/assess/{assessment.slug}"

    return {"assessment": _serialize_assessment(assessment), "share_link": share_link}


@router.get("/assessments/by-slug/{slug}")
async def get_assessment_by_slug(slug: str, db: AsyncSession = Depends(get_db)):
    """Public endpoint — returns assessment info for the entry page. No auth required."""
    result = await db.execute(select(Assessment).where(Assessment.slug == slug))
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return {
        "id": str(assessment.id),
        "title": assessment.title,
        "slug": assessment.slug,
        "status": assessment.status,
        "duration_target_minutes": assessment.duration_target_minutes,
        "scaffold_type": assessment.scaffold_type,
    }


@router.get("/assessments/{assessment_id}")
async def get_assessment(assessment_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Assessment).where(Assessment.id == assessment_id))
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return {"assessment": _serialize_assessment(assessment)}


def _serialize_assessment(a: Assessment) -> dict:
    return {
        "id": str(a.id),
        "course_id": str(a.course_id),
        "title": a.title,
        "slug": a.slug,
        "scaffold_type": a.scaffold_type,
        "duration_target_minutes": a.duration_target_minutes,
        "status": a.status,
        "learning_outcomes": a.learning_outcomes,
        "coverage_summary": a.coverage_summary,
        "rubric": a.rubric,
        "session_plan_version": a.session_plan_version,
        "additional_instructions": a.additional_instructions,
        "tts_enabled": a.tts_enabled if a.tts_enabled is not None else True,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "published_at": a.published_at.isoformat() if a.published_at else None,
    }

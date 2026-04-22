"""Database models and connection management."""

import os
from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    Column, String, Integer, Boolean, DateTime, Text, ForeignKey, UniqueConstraint, Index
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, relationship


# Railway provides postgresql://, SQLAlchemy async needs postgresql+asyncpg://
_raw_url = os.getenv("DATABASE_URL", "postgresql+asyncpg://aver:changeme@localhost:5432/aver")
DATABASE_URL = _raw_url.replace("postgresql://", "postgresql+asyncpg://", 1) if _raw_url.startswith("postgresql://") else _raw_url

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    email = Column(String(255), unique=True, nullable=False)
    name = Column(String(255))
    role = Column(String(20), nullable=False)  # 'instructor' or 'student'
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class AuthToken(Base):
    __tablename__ = "auth_tokens"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    assessment_id = Column(UUID(as_uuid=True), ForeignKey("assessments.id"), nullable=True)
    token = Column(String(255), unique=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class Course(Base):
    __tablename__ = "courses"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    instructor_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class Assessment(Base):
    __tablename__ = "assessments"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False)
    title = Column(String(255), nullable=False)
    # Human-readable URL slug (e.g. intro-to-bio-midterm-a3f2); generated at publish time
    slug = Column(String(255), unique=True, nullable=True)
    scaffold_type = Column(String(50), nullable=False)  # 'competency_map' or 'socratic_exploration'
    duration_target_minutes = Column(Integer, default=15)
    max_attempts = Column(Integer, default=1)
    status = Column(String(20), default="draft")  # 'draft', 'published', 'archived', 'closed'
    
    # Instructor inputs
    additional_instructions = Column(Text)
    tts_enabled = Column(Boolean, default=True)
    
    # AI-generated, instructor-reviewed
    learning_outcomes = Column(JSONB, nullable=False, default=list)
    coverage_summary = Column(JSONB, nullable=False, default=list)
    rubric = Column(JSONB, nullable=False, default=list)
    
    # Compiled session plan
    session_plan = Column(JSONB)
    session_plan_version = Column(Integer, default=0)
    
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    published_at = Column(DateTime(timezone=True))


class AssessmentEnrollment(Base):
    __tablename__ = "assessment_enrollments"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    assessment_id = Column(UUID(as_uuid=True), ForeignKey("assessments.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    enrolled_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    
    __table_args__ = (UniqueConstraint("assessment_id", "student_id"),)


class Session(Base):
    __tablename__ = "sessions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    assessment_id = Column(UUID(as_uuid=True), ForeignKey("assessments.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    session_plan_version = Column(Integer, nullable=False)
    status = Column(String(20), default="pending")  # 'pending', 'active', 'completed', 'abandoned'
    
    # Runtime state (serialized at session end)
    transcript = Column(JSONB, default=list)
    competency_state = Column(JSONB, default=dict)
    belief_model = Column(JSONB, default=dict)
    evaluation_log = Column(JSONB, default=list)
    key_moments = Column(JSONB, default=list)
    
    # Metadata
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    duration_seconds = Column(Integer)
    turn_count = Column(Integer, default=0)
    recording_ref = Column(String(500))
    
    # Flags
    flags = Column(JSONB, default=list)
    
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    
    __table_args__ = (
        Index("idx_sessions_assessment", "assessment_id"),
        Index("idx_sessions_student", "student_id"),
        Index("idx_sessions_status", "status"),
    )


class CompetencyProfile(Base):
    __tablename__ = "competency_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), unique=True, nullable=False)
    assessment_id = Column(UUID(as_uuid=True), ForeignKey("assessments.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    # Per-criterion scores aligned to the rubric — primary output of the profiler (Phase 4+)
    # Each entry: {criterion_id, criterion_name, max_score, ai_score, evidence_turns, finding}
    criteria_scores = Column(JSONB, nullable=False, default=list)

    # Kept nullable for backward compatibility; no longer populated by the profiler
    competency_map = Column(JSONB, nullable=True)
    knowledge_ceiling = Column(Integer)
    narrative_assessment = Column(Text, nullable=False)
    strengths = Column(JSONB, nullable=False, default=list)
    growth_areas = Column(JSONB, nullable=False, default=list)

    # Profiler's analysis of qualitative signals (e.g. anxiety vs. knowledge gap) from observation log
    belief_model_notes = Column(Text, nullable=True)

    generated_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    profiler_model = Column(String(100))

    __table_args__ = (
        Index("idx_profiles_assessment", "assessment_id"),
        Index("idx_profiles_student", "student_id"),
    )


class ProfileScoreEdit(Base):
    """Audit trail for instructor-overridden per-criterion scores.

    Every time an instructor adjusts an AI-generated score, a row is
    written here so the original score and editor identity are preserved.
    """

    __tablename__ = "profile_score_edits"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    profile_id = Column(UUID(as_uuid=True), ForeignKey("competency_profiles.id"), nullable=False)
    criterion_id = Column(String(100), nullable=False)
    original_score = Column(Integer, nullable=False)
    new_score = Column(Integer, nullable=False)
    edited_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    edited_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        Index("idx_profile_edits_profile", "profile_id"),
    )


async def init_db():
    """Create all tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncSession:
    """Dependency for getting a database session."""
    async with async_session() as session:
        yield session

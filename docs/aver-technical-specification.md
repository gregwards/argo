# Aver: Technical Specification

**Version:** 0.1
**Date:** April 2026
**Companion documents:** MVP Requirements Specification, Exemplar Conversations, Technical Spec Recommendations
**Audience:** Developer (sole full-stack developer building with Claude Code)

---

## 1. Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 14+ (React), Tailwind CSS, Pipecat JS SDK | Student session UI, instructor config + dashboard |
| Backend API | FastAPI (Python 3.11+) | Assessment config, dashboard, auth, session plan triggers |
| Voice Pipeline | Pipecat (Python) | Real-time STT → Rules Engine → LLM → Response pipeline |
| Transport (MVP) | Pipecat SmallWebRTCTransport (self-hosted, peer-to-peer) | Low-latency audio streaming browser ↔ server, zero cost |
| Transport (V2) | Daily.co (DailyTransport) | Server-side video+audio recording for verification. One-line transport swap. |
| STT | Deepgram Nova-2 (streaming) | Speech-to-text |
| TTS | Deprioritized for MVP. Deepgram Aura when implemented. AI responses displayed as text during MVP. |
| LLM (runtime) | Gemini 2.5 Flash | Conversational agent — latency-critical |
| LLM (compiler) | Claude Sonnet 4.6 | Session plan compilation — quality-critical |
| LLM (profiler) | Claude Sonnet 4.6 | Competency profile generation — quality-critical |
| Database | PostgreSQL 16 | Structured data, session plans (JSONB), transcripts |
| Object Storage | S3-compatible (Cloudflare R2 or AWS S3) | Session audio recordings |
| Deployment | Docker Compose on single VPS (8-core, 32GB) | MVP infrastructure |

**MVP note on TTS:** The student speaks; the AI's responses are displayed as text in the browser. This simplifies the pipeline, reduces latency, reduces cost, and supports a potential security measure (ensuring students aren't running a secondary AI agent that would need to process audio). TTS can be layered in later as a Pipecat pipeline node with no architectural changes.

---

## 2. Project Structure

```
aver/
├── docker-compose.yml
├── .env.example
│
├── backend/                    # FastAPI + Pipecat (Python)
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                 # FastAPI app entry point
│   │
│   ├── api/                    # FastAPI route modules
│   │   ├── __init__.py
│   │   ├── auth.py             # Magic link auth endpoints
│   │   ├── assessments.py      # CRUD + configuration workflow
│   │   ├── sessions.py         # Session management + results
│   │   ├── signaling.py        # WebRTC signaling (SDP offer/answer for SmallWebRTCTransport)
│   │   ├── dashboard.py        # Instructor dashboard queries
│   │   └── students.py         # Student-facing endpoints
│   │
│   ├── models/                 # SQLAlchemy / Pydantic models
│   │   ├── __init__.py
│   │   ├── db.py               # Database models (SQLAlchemy)
│   │   ├── schemas.py          # API schemas (Pydantic)
│   │   └── session_plan.py     # Session plan data structures
│   │
│   ├── compiler/               # Session plan compilation
│   │   ├── __init__.py
│   │   ├── compiler.py         # Main compilation logic
│   │   ├── rubric_generator.py # Rubric generation from LOs
│   │   └── prompts.py          # All compiler prompts
│   │   # V2: add lo_extractor.py for syllabus upload + LO extraction
│   │
│   ├── pipeline/               # Pipecat voice pipeline
│   │   ├── __init__.py
│   │   ├── session_runner.py   # Session lifecycle management
│   │   ├── pipeline.py         # Pipecat pipeline assembly
│   │   ├── rules_engine.py     # Custom Pipecat processor node
│   │   ├── context_manager.py  # Ephemeral domain window logic
│   │   ├── belief_model.py     # Learner belief model updates
│   │   ├── output_validator.py # Post-LLM output validation
│   │   └── prompts.py          # Runtime agent system prompts
│   │
│   ├── profiler/               # Post-session profile generation
│   │   ├── __init__.py
│   │   ├── profiler.py         # Main profiling logic
│   │   └── prompts.py          # Profiler prompts
│   │
│   ├── services/               # Shared services
│   │   ├── __init__.py
│   │   ├── llm.py              # LLM adapter (Gemini, Anthropic)
│   │   ├── storage.py          # S3 operations
│   │   └── email.py            # Magic link emails
│   │
│   └── db/
│       ├── migrations/         # Alembic migrations
│       └── seed.py             # Dev seed data
│
├── frontend/                   # Next.js application
│   ├── Dockerfile
│   ├── package.json
│   ├── tailwind.config.js
│   │
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx            # Landing / login
│   │   │
│   │   ├── assess/
│   │   │   └── [sessionId]/
│   │   │       └── page.tsx    # Student session UI
│   │   │
│   │   ├── student/
│   │   │   ├── page.tsx        # Student home — assessment list
│   │   │   └── profile/
│   │   │       └── [sessionId]/
│   │   │           └── page.tsx # Competency profile view
│   │   │
│   │   └── instructor/
│   │       ├── page.tsx        # Instructor home — course list
│   │       ├── assessment/
│   │       │   ├── new/
│   │       │   │   └── page.tsx # Assessment configuration workflow
│   │       │   └── [assessmentId]/
│   │       │       ├── page.tsx # Assessment dashboard
│   │       │       └── session/
│   │       │           └── [sessionId]/
│   │       │               └── page.tsx # Individual session review
│   │       └── course/
│   │           └── [courseId]/
│   │               └── page.tsx # Course management
│   │
│   ├── components/
│   │   ├── session/            # Voice session components
│   │   │   ├── SessionView.tsx
│   │   │   ├── TranscriptPanel.tsx
│   │   │   └── AudioWaveform.tsx
│   │   ├── config/             # Assessment configuration components
│   │   │   ├── LearningOutcomesList.tsx
│   │   │   ├── CoverageSummary.tsx
│   │   │   ├── RubricTable.tsx
│   │   │   └── RubricRowExpanded.tsx
│   │   ├── dashboard/          # Instructor dashboard components
│   │   │   ├── ScoreDistribution.tsx
│   │   │   ├── TopicBreakdown.tsx
│   │   │   └── SessionList.tsx
│   │   └── profile/            # Competency profile components
│   │       ├── CompetencyMap.tsx
│   │       ├── NarrativeAssessment.tsx
│   │       └── TranscriptViewer.tsx
│   │
│   └── lib/
│       ├── api.ts              # FastAPI client
│       └── pipecat.ts          # Pipecat client setup
│
└── scripts/
    ├── seed_demo.py            # Create demo assessment for testing
    └── run_profiler.py         # Manual profiler trigger for debugging
```

---

## 3. Data Model

### 3.1 Database Schema (PostgreSQL)

```sql
-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    role VARCHAR(20) NOT NULL CHECK (role IN ('instructor', 'student')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auth tokens (magic links)
CREATE TABLE auth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Courses
CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instructor_id UUID REFERENCES users(id) NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Assessments
CREATE TABLE assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id) NOT NULL,
    title VARCHAR(255) NOT NULL,
    scaffold_type VARCHAR(50) NOT NULL CHECK (scaffold_type IN ('competency_map', 'socratic_exploration')),
    duration_target_minutes INT DEFAULT 15 CHECK (duration_target_minutes BETWEEN 10 AND 20),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),

    -- Instructor inputs
    source_materials_ref VARCHAR(500),          -- S3 key for uploaded materials
    additional_instructions TEXT,

    -- AI-generated, instructor-reviewed
    learning_outcomes JSONB NOT NULL DEFAULT '[]',
    coverage_summary JSONB NOT NULL DEFAULT '[]',
    rubric JSONB NOT NULL DEFAULT '[]',

    -- Compiled session plan (generated after publish)
    session_plan JSONB,
    session_plan_version INT DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    published_at TIMESTAMPTZ
);

-- Assessment enrollments (student ↔ assessment)
CREATE TABLE assessment_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID REFERENCES assessments(id) NOT NULL,
    student_id UUID REFERENCES users(id) NOT NULL,
    enrolled_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (assessment_id, student_id)
);

-- Sessions (one per student per assessment attempt)
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID REFERENCES assessments(id) NOT NULL,
    student_id UUID REFERENCES users(id) NOT NULL,
    session_plan_version INT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'abandoned')),

    -- Runtime state (serialized at session end)
    transcript JSONB DEFAULT '[]',
    competency_state JSONB DEFAULT '{}',
    belief_model JSONB DEFAULT '{}',
    evaluation_log JSONB DEFAULT '[]',       -- Per-turn evaluation blocks
    key_moments JSONB DEFAULT '[]',

    -- Metadata
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_seconds INT,
    turn_count INT DEFAULT 0,
    recording_ref VARCHAR(500),              -- S3 key for audio recording

    -- Flags
    extraction_attempts JSONB DEFAULT '[]',
    flags JSONB DEFAULT '[]',                -- e.g., high_scaffolding, edge_cases

    created_at TIMESTAMPTZ DEFAULT now()
);

-- Competency profiles (generated post-session)
CREATE TABLE competency_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) UNIQUE NOT NULL,
    assessment_id UUID REFERENCES assessments(id) NOT NULL,
    student_id UUID REFERENCES users(id) NOT NULL,

    -- Scores
    competency_map JSONB NOT NULL,           -- {dimension: score} 
    knowledge_ceiling INT,

    -- Narrative
    narrative_assessment TEXT NOT NULL,
    strengths JSONB NOT NULL DEFAULT '[]',
    growth_areas JSONB NOT NULL DEFAULT '[]',

    -- Metadata
    generated_at TIMESTAMPTZ DEFAULT now(),
    profiler_model VARCHAR(100),
    profiler_version VARCHAR(50)
);

-- Indexes
CREATE INDEX idx_sessions_assessment ON sessions(assessment_id);
CREATE INDEX idx_sessions_student ON sessions(student_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_profiles_assessment ON competency_profiles(assessment_id);
CREATE INDEX idx_profiles_student ON competency_profiles(student_id);
CREATE INDEX idx_enrollments_assessment ON assessment_enrollments(assessment_id);
CREATE INDEX idx_enrollments_student ON assessment_enrollments(student_id);
```

### 3.2 JSONB Structures

**Assessment: `learning_outcomes`**
```json
[
  {
    "id": "lo_1",
    "text": "Explain the causal mechanisms of supply and demand",
    "provenance": "extracted",
    "source_excerpt": "Chapter 3 covers the fundamental..."
  },
  {
    "id": "lo_2", 
    "text": "Apply price elasticity concepts to real-world markets",
    "provenance": "synthesized",
    "source_excerpt": null
  }
]
```

**Assessment: `rubric`**
```json
[
  {
    "learning_outcome_id": "lo_1",
    "exceeds": "Explains the full causal mechanism including equilibrium adjustment, applies it fluently to novel scenarios, and names assumptions unprompted",
    "meets": "Explains the directional effect with some mechanism, applies concepts to a scenario with prompting",
    "approaching": "States that price rises when demand increases but cannot explain why; needs significant scaffolding",
    "does_not_meet": "Cannot explain the relationship or produces a fundamentally incorrect account",
    "sample_questions": [
      "Explain what happens to the price of a good when demand increases. Walk me through the mechanism.",
      "Why would demand for insulin be less elastic than demand for a specific brand of cereal?"
    ]
  }
]
```

**Assessment: `session_plan`** (See Section 5 for full structure)

**Session: `transcript`**
```json
[
  {
    "turn": 1,
    "role": "ai",
    "text": "This is a 15-minute oral assessment...",
    "phase": 1,
    "question_type": null,
    "structural_move": "signpost",
    "timestamp": "2026-04-10T14:30:00Z"
  },
  {
    "turn": 2,
    "role": "learner",
    "text": "Yeah, I'm ready.",
    "timestamp": "2026-04-10T14:30:45Z"
  },
  {
    "turn": 3,
    "role": "ai",
    "text": "First topic: supply and demand...",
    "phase": 2,
    "question_type": "mechanism",
    "node_id": "node_1",
    "timestamp": "2026-04-10T14:30:48Z"
  }
]
```

**Session: `belief_model`**
```json
{
  "lo_1": {
    "understanding_level": "strong",
    "claims": ["demand increase causes shortage", "shortage drives price up through buyer competition"],
    "gaps": [],
    "scaffolding_needed": "none",
    "confidence_signal": "high",
    "last_assessed_turn": 6
  },
  "lo_2": {
    "understanding_level": "partial",
    "claims": ["necessities are inelastic", "substitutes increase elasticity"],
    "gaps": ["confused elastic/inelastic labels once, self-corrected"],
    "scaffolding_needed": "light",
    "confidence_signal": "moderate",
    "last_assessed_turn": 10
  }
}
```

**Session: `competency_state`**
```json
{
  "foundation_scores": {
    "causal_reasoning": 4,
    "conceptual_relationships": 4,
    "vocabulary_precision": 3,
    "completeness": 4
  },
  "scaffolding_needed": "light",
  "knowledge_ceiling": 4,
  "scaling_trajectory": "ascending",
  "transfer_quality": 5,
  "reasoning_structure": "branching",
  "assumption_awareness": "fully_explicit",
  "scenario_engagement": "engaged",
  "vocabulary_level": "moderate",
  "articulation_vs_understanding": false
}
```

---

## 4. API Specification (FastAPI)

### 4.1 Auth Endpoints

```
POST /api/auth/magic-link
  Body: { email: string }
  → Sends magic link email. Creates user if not exists.
  Response: { message: "Check your email" }

GET /api/auth/verify?token={token}
  → Validates token, sets session cookie, returns user.
  Response: { user: User, token: string }

GET /api/auth/me
  → Returns current user from session.
  Response: { user: User }

POST /api/auth/logout
  → Clears session.
```

### 4.2 Assessment Configuration Endpoints

```
POST /api/assessments
  Body: { 
    course_id, 
    title, 
    scaffold_type, 
    duration_target_minutes,
    learning_outcomes: [{ text: string }],
    additional_instructions: string (optional)
  }
  → Creates draft assessment with LOs.
  Response: { assessment: Assessment }

POST /api/assessments/{id}/generate-rubric
  → Generates rubric, coverage summary, and compiles session plan from confirmed LOs.
  Response: { rubric: RubricRow[], coverage_summary: CoverageSummaryItem[] }

PUT /api/assessments/{id}/rubric
  Body: { rubric: RubricRow[] }
  → Saves instructor's rubric edits.

POST /api/assessments/{id}/regenerate-rubric-row
  Body: { learning_outcome_id: string }
  → Regenerates a single rubric row.
  Response: { rubric_row: RubricRow, coverage_summary_item: CoverageSummaryItem }

POST /api/assessments/{id}/publish
  → Recompiles session plan if rubric was edited since last generation,
    sets status to 'published'.
  Response: { assessment: Assessment, share_link: string }

GET /api/assessments/{id}
  → Full assessment details including LOs, rubric, plan status.

GET /api/assessments/{id}/sample-questions/{lo_id}
  → Returns sample questions for a specific LO (progressive disclosure in review step).
  Response: { questions: SampleQuestion[], adaptive_description: string }

# V2: Add material upload and LO extraction
# POST /api/assessments/{id}/upload-materials
#   Body: multipart file upload
#   → Stores materials in S3, extracts LOs.
#   Response: { learning_outcomes: LearningOutcome[] }
```

### 4.3 Session Endpoints

```
POST /api/sessions/start
  Body: { assessment_id: string }
  → Creates session, loads session plan, starts Pipecat pipeline, returns connection info.
  Response: { session_id, websocket_url }

POST /api/sessions/{id}/end
  → Marks session complete, triggers profiler.
  Response: { session: Session }

GET /api/sessions/{id}
  → Session details including transcript, status.

GET /api/sessions/{id}/profile
  → Competency profile for this session.
  Response: { profile: CompetencyProfile }

GET /api/sessions/{id}/recording-url
  → Pre-signed S3 URL for audio playback.
  Response: { url: string, expires_in: number }
```

### 4.4 Dashboard Endpoints

```
GET /api/dashboard/assessments/{id}/summary
  → Aggregate stats: completion rate, score distributions, topic breakdown.
  Response: { summary: AssessmentSummary }

GET /api/dashboard/assessments/{id}/sessions
  → Paginated list of student sessions with scores and flags.
  Query: ?page=1&per_page=20&sort=completed_at
  Response: { sessions: SessionSummary[], total: number }

GET /api/dashboard/assessments/{id}/topic-breakdown
  → Per-LO performance across all students.
  Response: { topics: TopicPerformance[] }
```

### 4.5 Student Endpoints

```
GET /api/student/assessments
  → List of assessments the student is enrolled in.
  Response: { assessments: StudentAssessment[] }

GET /api/student/sessions
  → List of completed sessions with profiles.
  Response: { sessions: StudentSession[] }
```

---

## 5. Session Plan Compiler

### 5.1 Compilation Pipeline

Triggered by `POST /api/assessments/{id}/publish`. Runs asynchronously (background task).

```
Input:
  - Assessment.learning_outcomes (confirmed by instructor)
  - Assessment.rubric (confirmed by instructor)
  - Assessment.scaffold_type
  - Assessment.duration_target_minutes
  - Assessment.additional_instructions
  - Assessment.source_materials (text extracted from uploaded files)

Processing:
  1. Build topic hierarchy from LOs
  2. Generate question nodes per LO across difficulty levels
  3. Generate domain packets per node (scoped knowledge)
  4. Generate rubric descriptors per node (from rubric cells)
  5. Build follow-up logic (conditional edges between nodes)
  6. Build phase transition rules
  7. Flag pre-planned cross-reference points
  8. Assemble full session plan

Output:
  - SessionPlan (stored as assessment.session_plan JSONB)
```

### 5.2 Compiler Prompt (Claude Sonnet 4.6)

```python
COMPILER_SYSTEM_PROMPT = """
You are an expert assessment designer. You compile oral assessment session plans 
from instructor-provided learning outcomes and rubrics.

Your output is a structured JSON session plan that an AI assessor will navigate 
during a live voice assessment. The assessor will see ONE question node at a time 
and must be able to conduct the assessment using only the information in that node 
plus the learner's transcript.

CRITICAL CONSTRAINTS:
- Each node's domain_packet must contain ONLY the knowledge needed to evaluate 
  responses to THAT node's questions. Do not include answers to other nodes' questions.
- Domain packets should be 150-400 tokens. Enough to evaluate, not enough to lecture.
- Rubric descriptors must be evaluative criteria, not answers. 
  GOOD: "explains causal mechanism linking demand shift to price change"
  BAD: "the answer is that increased demand creates a shortage which drives price up"
- Follow-up logic must cover: strong response, partial response, weak response, 
  and silence/refusal.
- Sample questions should be natural, conversational, and varied. Generate 2-3 per node.
- The plan must cover all provided learning outcomes.
"""

COMPILER_USER_PROMPT = """
Compile a session plan for the following assessment:

SCAFFOLD TYPE: {scaffold_type}
DURATION TARGET: {duration_target} minutes
ADDITIONAL INSTRUCTIONS: {additional_instructions}

LEARNING OUTCOMES:
{formatted_learning_outcomes}

RUBRIC:
{formatted_rubric}

SOURCE MATERIAL CONTEXT:
{source_material_excerpt}

Generate the session plan as a JSON object with this exact structure:
{session_plan_schema}
"""
```

### 5.3 Session Plan Schema

```python
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class FollowUpRule:
    condition: str                  # "strong" | "partial" | "weak" | "silence" | "off_topic"
    action: str                     # "advance" | "probe" | "scaffold" | "redirect" | "move_on"
    follow_up_type: Optional[str]   # From taxonomy: "specificity_probe", "causal_interrogation", etc.
    target_node_id: Optional[str]   # Node to transition to (if advancing)
    instruction: str                # Natural language instruction for the agent

@dataclass
class QuestionNode:
    id: str
    learning_outcome_id: str
    phase: int                              # 1-5
    difficulty_level: int                   # 1-5
    question_type: str                      # From taxonomy
    question_instructions: str              # Instructions for the agent on what to ask
    sample_questions: list[str]             # 2-3 examples
    domain_packet: str                      # Scoped domain knowledge (150-400 tokens)
    rubric_descriptors: list[str]           # Evaluation criteria
    follow_up_rules: list[FollowUpRule]
    cross_reference_inject: list[str]       # Node IDs for pre-planned escalation
    structural_move_before: Optional[str]   # e.g., "signpost" before this node
    time_budget_seconds: Optional[int]      # Approximate time allocation

@dataclass
class PhaseTransition:
    from_phase: int
    to_phase: int
    condition: str                          # e.g., "foundation_complete"
    signpost_instruction: str               # What the agent says at the transition

@dataclass  
class SessionPlan:
    id: str
    assessment_id: str
    scaffold_type: str
    learning_outcomes: list[dict]           # Copy from assessment for reference
    nodes: dict[str, QuestionNode]          # node_id -> QuestionNode
    start_node_id: str
    phase_transitions: list[PhaseTransition]
    orientation_script: str                 # Phase 1 opening text
    closing_script: str                     # Phase 5 closing text
    duration_target_minutes: int
    total_node_count: int
    metadata: dict
```

---

## 6. Voice Pipeline (Pipecat)

### 6.1 Pipeline Assembly

```python
# backend/pipeline/pipeline.py

from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.services.deepgram import DeepgramSTTService
from pipecat.transports.services.small_webrtc import SmallWebRTCTransport
from pipecat.services.google import GoogleLLMService

from pipeline.rules_engine import RulesEngineProcessor
from pipeline.output_validator import OutputValidatorProcessor
from pipeline.context_manager import ContextManager

async def create_pipeline(
    session_id: str,
    session_plan: SessionPlan,
    webrtc_connection: SmallWebRTCConnection,
) -> Pipeline:
    
    # Transport — self-hosted WebRTC (peer-to-peer, zero cost)
    # V2 migration: swap to DailyTransport for server-side video recording.
    # Pipeline code below this block is unchanged.
    transport = SmallWebRTCTransport(
        webrtc_connection=webrtc_connection,
        params=SmallWebRTCTransport.InputParams(
            audio_in_enabled=True,
            audio_out_enabled=False,  # No TTS for MVP — text responses only
            vad_enabled=True,         # Voice Activity Detection
            vad_analyzer=SileroVADAnalyzer(
                params=VADParams(
                    min_volume=0.3,
                    stop_secs=3.0,       # 3 sec silence = end of turn
                )
            ),
        ),
    )

    # STT — Deepgram streaming
    stt = DeepgramSTTService(
        api_key=settings.DEEPGRAM_API_KEY,
        params=DeepgramSTTService.InputParams(
            language="en",
            model="nova-2",
            interim_results=True,
            endpointing=300,          # 300ms endpointing
        ),
    )

    # Context manager — handles ephemeral domain windows
    context_manager = ContextManager(session_plan=session_plan)

    # Rules engine — custom processor node
    rules_engine = RulesEngineProcessor(
        session_id=session_id,
        session_plan=session_plan,
        context_manager=context_manager,
    )

    # LLM — Gemini 2.5 Flash with function calling
    llm = GoogleLLMService(
        model="gemini-2.5-flash",
        api_key=settings.GOOGLE_API_KEY,
        params=GoogleLLMService.InputParams(
            temperature=0.7,
            max_tokens=500,           # Cap response length
        ),
    )

    # Register the evaluation function — the LLM calls this alongside
    # its conversational response to provide structured assessment data.
    # This replaces the fragile <evaluation>/<utterance> XML parsing approach.
    # Function calls are natively supported by Gemini and structurally validated.
    async def handle_evaluation(
        function_name, tool_call_id, args, llm, context, result_callback
    ):
        # Pass evaluation data to the rules engine for processing
        await rules_engine.process_evaluation(args)
        # Return empty result — the evaluation is a side-channel, not a response
        await result_callback(None)

    llm.register_function("evaluate_response", handle_evaluation)

    # Output validator — post-LLM processing
    output_validator = OutputValidatorProcessor()

    # Assemble pipeline
    pipeline = Pipeline([
        transport.input(),        # Audio in from browser
        stt,                      # Audio → text
        rules_engine,             # Update state, build LLM context with domain window
        llm,                      # Generate response + call evaluate_response()
        output_validator,         # Validate and clean response
        transport.output(),       # Text response → browser (displayed as text)
    ])

    return pipeline, rules_engine
```

**Function calling architecture:** On each turn, the LLM produces two things simultaneously: (1) a text response to the learner (the utterance), and (2) a function call to `evaluate_response()` with structured evaluation data. Gemini natively supports producing text and function calls in the same response. The text goes through the pipeline to the learner. The function call is intercepted by the registered handler and routed to the rules engine. This is more reliable than structured XML parsing because function call schemas are validated by the model — the parameters either match the schema or the call isn't made.

### 6.2 Session Lifecycle

```python
# backend/pipeline/session_runner.py

from pipecat.transports.services.small_webrtc import SmallWebRTCTransport, SmallWebRTCConnection

async def run_session(
    session_id: str, 
    assessment_id: str, 
    student_id: str,
    webrtc_connection: SmallWebRTCConnection,
):
    """Main entry point for a voice assessment session."""
    
    # Load session plan from database
    assessment = await get_assessment(assessment_id)
    session_plan = SessionPlan.from_json(assessment.session_plan)
    
    # Create session record
    session = await create_session(
        session_id=session_id,
        assessment_id=assessment_id,
        student_id=student_id,
        session_plan_version=assessment.session_plan_version,
    )
    
    # Build pipeline (SmallWebRTCTransport — self-hosted, zero cost)
    pipeline, rules_engine = await create_pipeline(
        session_id=session_id,
        session_plan=session_plan,
        webrtc_connection=webrtc_connection,
    )
    
    # Register event handlers
    rules_engine.on_session_complete(lambda state: handle_session_complete(
        session_id, state
    ))
    
    # Run pipeline (blocks until session ends)
    runner = PipelineRunner()
    await runner.run(pipeline)


async def handle_session_complete(session_id: str, state: SessionState):
    """Called when session ends. Persists state and triggers profiler."""
    
    # Save session state to database
    await update_session(
        session_id=session_id,
        status="completed",
        transcript=state.transcript,
        competency_state=state.competency_state.to_dict(),
        belief_model=state.belief_model,
        evaluation_log=state.evaluation_log,
        key_moments=state.key_moments,
        turn_count=state.turn_count,
        duration_seconds=state.duration_seconds,
    )
    
    # Save audio recording captured from the pipeline's audio frames
    # The rules engine captures raw audio frames as they pass through 
    # the pipeline and writes them to a buffer. At session end, the 
    # buffer is encoded and uploaded to S3.
    if state.audio_buffer:
        recording_ref = await save_audio_to_s3(state.audio_buffer, session_id)
        await update_session(session_id=session_id, recording_ref=recording_ref)
    
    # Trigger profiler (async background task)
    await trigger_profiler(session_id)


# FastAPI WebRTC signaling endpoint
# SmallWebRTCTransport requires a signaling endpoint for the WebRTC handshake.
# This is mounted in the FastAPI app.

from fastapi import APIRouter
router = APIRouter()

@router.post("/api/sessions/{session_id}/offer")
async def webrtc_offer(session_id: str, offer: dict):
    """WebRTC signaling endpoint. Client sends SDP offer, server returns SDP answer."""
    # This endpoint is called by the Pipecat client SDK to establish
    # the peer-to-peer WebRTC connection. The SmallWebRTCTransport
    # handles the SDP negotiation internally.
    connection = SmallWebRTCConnection()
    answer = await connection.handle_offer(offer["sdp"], offer["type"])
    
    # Start the session pipeline in the background
    asyncio.create_task(run_session(
        session_id=session_id,
        assessment_id=offer["assessment_id"],
        student_id=offer["student_id"],
        webrtc_connection=connection,
    ))
    
    return {"sdp": answer.sdp, "type": answer.type}
```

**Audio recording without Daily:** Since SmallWebRTCTransport is peer-to-peer, there's no third-party server to record on. Audio recording is handled by capturing raw audio frames as they pass through the Pipecat pipeline (the server receives all audio for STT processing — recording is a side effect of that processing). The audio buffer is encoded to WAV/MP3 and uploaded to S3 at session end. This provides server-side audio recording with integrity (the student doesn't control the recording process) without any external recording service.

**V2 migration to Daily for video recording:** When server-side video+audio recording is needed, swap `SmallWebRTCTransport` to `DailyTransport` in `create_pipeline()`. Add Daily room creation in `run_session()`. Enable Daily's cloud recording. The pipeline code (rules engine, context manager, LLM, output validator) is unchanged. Estimated migration effort: 1–2 days.

---

## 7. Rules Engine

### 7.1 Evaluation Function Schema

Instead of parsing structured XML output, the LLM calls an `evaluate_response` function alongside its conversational response. Function calls are natively supported by Gemini and structurally validated — the parameters either match the schema or the call fails gracefully. This is dramatically more reliable than regex-based XML parsing.

```python
# backend/pipeline/evaluation_schema.py

EVALUATE_RESPONSE_SCHEMA = {
    "name": "evaluate_response",
    "description": (
        "REQUIRED: Call this function on EVERY turn after the learner speaks. "
        "Evaluate their response against the rubric descriptors and determine "
        "the next assessment action. You MUST call this function — do not skip it."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "descriptor_matches": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Which rubric descriptors the learner's response matched"
            },
            "descriptor_misses": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Which rubric descriptors were not addressed"
            },
            "response_quality": {
                "type": "string",
                "enum": ["strong", "partial", "weak", "off_topic", "silence"],
                "description": "Overall quality of the learner's response"
            },
            "belief_update": {
                "type": "object",
                "properties": {
                    "learning_outcome_id": {"type": "string"},
                    "claims": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "New claims the learner made this turn"
                    },
                    "gaps": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "New gaps identified this turn"
                    },
                    "understanding_level": {
                        "type": "string",
                        "enum": ["strong", "partial", "weak"]
                    },
                    "scaffolding_needed": {
                        "type": "string",
                        "enum": ["none", "light", "heavy"]
                    },
                    "confidence_signal": {
                        "type": "string",
                        "description": "Brief note on learner's confidence level"
                    }
                },
                "description": "Updates to the learner belief model for this turn's learning outcome"
            },
            "next_action": {
                "type": "string",
                "enum": ["advance", "follow_up", "scaffold", "redirect", "move_on", "end_phase"],
                "description": "What the assessment should do next"
            },
            "follow_up_type": {
                "type": "string",
                "enum": [
                    "causal_interrogation", "specificity_probe", "counterfactual_challenge",
                    "extension", "redirect_reframe", "boundary_test", "assumption_surfacing",
                    "contradiction_probe", "precision_push", "steelman", "scaffold"
                ],
                "description": "If next_action is follow_up, which type from the taxonomy"
            },
            "key_moment": {
                "type": "string",
                "description": "Brief description if this was a notable moment, empty string otherwise"
            },
            "flags": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": [
                        "extraction_attempt", "anxiety_pattern", "tangent",
                        "bullshit_detected", "overachiever", "i_dont_know",
                        "self_correction", "articulation_gap"
                    ]
                },
                "description": "Any edge case patterns detected this turn"
            }
        },
        "required": ["descriptor_matches", "response_quality", "next_action"]
    }
}
```

### 7.2 Core State Machine

```python
# backend/pipeline/rules_engine.py

from pipecat.processors.frame_processor import FrameProcessor, FrameDirection
from pipecat.frames.frames import (
    TranscriptionFrame, LLMTextFrame, Frame, LLMMessagesUpdateFrame
)

class RulesEngineProcessor(FrameProcessor):
    """
    Custom Pipecat processor that sits between STT and LLM.
    
    Responsibilities:
    1. Receive transcribed learner speech
    2. Build LLM context with ephemeral domain window
    3. Pass context to LLM
    4. Receive evaluation data via function call (from LLM, routed by pipeline)
    5. Update competency state, belief model, and session plan position
    
    The evaluation flow is:
    - Learner speaks → STT transcribes → rules engine builds context → LLM responds
    - LLM produces BOTH a text response AND an evaluate_response() function call
    - Text response flows through pipeline to the learner
    - Function call is intercepted by the registered handler in pipeline.py
      and routed to this processor's process_evaluation() method
    """
    
    def __init__(self, session_id: str, session_plan: SessionPlan, 
                 context_manager: ContextManager):
        super().__init__()
        self.session_id = session_id
        self.plan = session_plan
        self.ctx = context_manager
        
        self.state = SessionState(
            session_plan=session_plan,
            current_node_id=session_plan.start_node_id,
            competency_state=CompetencyState(),
            belief_model={},
            transcript=[],
            evaluation_log=[],
            key_moments=[],
            turn_count=0,
            phase=1,
            started_at=datetime.utcnow(),
        )
        
        self._pending_navigation = None  # Set by process_evaluation, applied next turn
    
    async def process_frame(self, frame: Frame, direction: FrameDirection):
        """Process frames flowing through the pipeline."""
        
        if isinstance(frame, TranscriptionFrame):
            # New learner utterance received from STT
            learner_text = frame.text
            
            # Apply any pending navigation from the previous turn's evaluation
            if self._pending_navigation:
                self._navigate(self._pending_navigation)
                self._pending_navigation = None
            
            # Add to transcript
            self.state.transcript.append({
                "turn": self.state.turn_count + 1,
                "role": "learner",
                "text": learner_text,
                "timestamp": datetime.utcnow().isoformat(),
            })
            self.state.turn_count += 1
            
            # Build LLM context with current node's ephemeral domain window
            context = self._build_context(learner_text)
            
            # Update the LLM's context for this turn
            await self.push_frame(LLMMessagesUpdateFrame(messages=context))
            return
        
        elif isinstance(frame, LLMTextFrame):
            # LLM text response — this is what the learner sees
            utterance = frame.text
            
            # Add AI utterance to transcript
            self.state.transcript.append({
                "turn": self.state.turn_count,
                "role": "ai",
                "text": utterance,
                "phase": self.state.phase,
                "node_id": self.state.current_node_id,
                "timestamp": datetime.utcnow().isoformat(),
            })
            
            # Check for session end conditions
            if self._should_end_session():
                await self._end_session()
                return
            
            # Pass text through to the learner
            await self.push_frame(frame, direction)
            return
        
        # Pass through all other frames
        await self.push_frame(frame, direction)
    
    async def process_evaluation(self, eval_args: dict):
        """
        Called by the function call handler registered in pipeline.py.
        Receives the structured evaluation data from the LLM's
        evaluate_response() function call.
        
        This runs asynchronously alongside the text response delivery —
        the learner sees the text response immediately while the evaluation
        is processed in the background.
        """
        # Log evaluation
        self.state.evaluation_log.append({
            "turn": self.state.turn_count,
            "node_id": self.state.current_node_id,
            "evaluation": eval_args,
        })
        
        # Update belief model
        belief_update = eval_args.get("belief_update")
        if belief_update:
            lo_id = belief_update.get("learning_outcome_id",
                self.plan.nodes[self.state.current_node_id].learning_outcome_id)
            
            if lo_id not in self.state.belief_model:
                self.state.belief_model[lo_id] = {
                    "understanding_level": "unknown",
                    "claims": [],
                    "gaps": [],
                    "scaffolding_needed": "unknown",
                    "confidence_signal": "",
                    "last_assessed_turn": 0,
                }
            
            model = self.state.belief_model[lo_id]
            model["claims"].extend(belief_update.get("claims", []))
            model["gaps"].extend(belief_update.get("gaps", []))
            model["understanding_level"] = belief_update.get(
                "understanding_level", model["understanding_level"])
            model["scaffolding_needed"] = belief_update.get(
                "scaffolding_needed", model["scaffolding_needed"])
            model["confidence_signal"] = belief_update.get(
                "confidence_signal", model["confidence_signal"])
            model["last_assessed_turn"] = self.state.turn_count
        
        # Update competency state from descriptor matches
        descriptor_matches = eval_args.get("descriptor_matches", [])
        response_quality = eval_args.get("response_quality", "partial")
        self._update_competency_state(descriptor_matches, response_quality)
        
        # Record key moment
        key_moment = eval_args.get("key_moment", "")
        if key_moment:
            self.state.key_moments.append({
                "turn": self.state.turn_count,
                "description": key_moment,
            })
        
        # Record flags
        flags = eval_args.get("flags", [])
        if flags:
            for flag in flags:
                self.state.flags.append({
                    "turn": self.state.turn_count,
                    "flag": flag,
                })
        
        # Determine navigation for next turn
        next_action = eval_args.get("next_action", "follow_up")
        self._pending_navigation = self._resolve_navigation(next_action, eval_args)
    
    def _resolve_navigation(self, next_action: str, eval_args: dict) -> dict:
        """
        Resolve the LLM's next_action into a concrete navigation instruction.
        Uses the current node's follow_up_rules from the session plan.
        """
        current_node = self.plan.nodes[self.state.current_node_id]
        response_quality = eval_args.get("response_quality", "partial")
        
        if next_action == "advance":
            # Find the appropriate next node from follow-up rules
            for rule in current_node.follow_up_rules:
                if rule.condition == response_quality and rule.action == "advance":
                    return {"type": "advance", "target_node_id": rule.target_node_id}
            # Fallback: advance to the next node in sequence
            return {"type": "advance", "target_node_id": self._get_next_sequential_node()}
        
        elif next_action == "end_phase":
            # Advance to the first node of the next phase
            next_phase = self.state.phase + 1
            return {"type": "phase_transition", "target_phase": next_phase}
        
        elif next_action in ("follow_up", "scaffold", "redirect"):
            # Stay on current node — the LLM will handle the follow-up in its text response
            return {"type": "stay"}
        
        elif next_action == "move_on":
            # Skip to next topic
            return {"type": "advance", "target_node_id": self._get_next_topic_node()}
        
        return {"type": "stay"}
    
    def _navigate(self, navigation: dict):
        """Apply a navigation instruction — swap domain window and update state."""
        
        if navigation["type"] == "stay":
            return  # No navigation needed
        
        if navigation["type"] == "advance":
            target_id = navigation.get("target_node_id")
            if target_id and target_id in self.plan.nodes:
                target_node = self.plan.nodes[target_id]
                if target_node.phase != self.state.phase:
                    self.state.phase = target_node.phase
                self.ctx.set_current_node(target_id)
                self.state.current_node_id = target_id
        
        elif navigation["type"] == "phase_transition":
            target_phase = navigation.get("target_phase", self.state.phase + 1)
            # Find the first node in the target phase
            for node_id, node in self.plan.nodes.items():
                if node.phase == target_phase:
                    self.state.phase = target_phase
                    self.ctx.set_current_node(node_id)
                    self.state.current_node_id = node_id
                    break
    
    def _build_context(self, learner_text: str) -> list[dict]:
        """Build the LLM context with ephemeral domain window."""
        current_node = self.plan.nodes[self.state.current_node_id]
        system_prompt = self._build_system_prompt(current_node)
        history = self._build_conversation_history()
        
        return [
            {"role": "system", "content": system_prompt},
            *history,
            {"role": "user", "content": learner_text},
        ]
    
    def _build_system_prompt(self, current_node: QuestionNode) -> str:
        """
        Build the system prompt with ephemeral domain window.
        Rebuilt every turn with the current node's domain packet.
        """
        return RUNTIME_SYSTEM_PROMPT.format(
            scaffold_type=self.plan.scaffold_type,
            current_phase=self.state.phase,
            phase_description=PHASE_DESCRIPTIONS[self.state.phase],
            question_instructions=current_node.question_instructions,
            sample_questions="\n".join(f"- {q}" for q in current_node.sample_questions),
            domain_packet=current_node.domain_packet,
            rubric_descriptors="\n".join(f"- {d}" for d in current_node.rubric_descriptors),
            follow_up_rules=self._format_follow_up_rules(current_node.follow_up_rules),
            belief_model=json.dumps(self.state.belief_model, indent=2),
            competency_state_summary=self._summarize_competency_state(),
            structural_move=current_node.structural_move_before or "none",
        )
    
    def _should_end_session(self) -> bool:
        """Check if the session should end."""
        elapsed = (datetime.utcnow() - self.state.started_at).total_seconds()
        time_limit = self.plan.duration_target_minutes * 60
        if elapsed > time_limit + 120:
            return True
        # Check if last evaluation signaled session complete
        if self.state.evaluation_log:
            last_eval = self.state.evaluation_log[-1].get("evaluation", {})
            if last_eval.get("next_action") == "end_phase" and self.state.phase >= 5:
                return True
        return False
```

### 7.2 Output Validator

```python
# backend/pipeline/output_validator.py

class OutputValidatorProcessor(FrameProcessor):
    """
    Validates LLM output before it reaches the learner.
    Sits between LLM and transport in the pipeline.
    """
    
    EVALUATIVE_PHRASES = [
        "great job", "well done", "excellent", "perfect",
        "that's wrong", "incorrect", "not quite right",
        "you're doing great", "good work", "nice",
    ]
    
    async def process_frame(self, frame, direction):
        if isinstance(frame, TextFrame):
            text = frame.text
            
            # Reject multi-question turns (more than 1 question mark)
            question_count = text.count("?")
            if question_count > 2:  # Allow 1-2, reject 3+
                # Log the violation
                # In production: request regeneration or trim
                # For MVP: log and pass through with a warning
                pass
            
            # Strip evaluative language
            text_lower = text.lower()
            for phrase in self.EVALUATIVE_PHRASES:
                if phrase in text_lower:
                    # Log the violation
                    # For MVP: pass through but flag
                    pass
            
            await self.push_frame(TextFrame(text=text))
        else:
            await self.push_frame(frame)
```

### 7.3 Context Manager

```python
# backend/pipeline/context_manager.py

class ContextManager:
    """
    Manages the ephemeral domain window.
    Ensures only the current node's domain packet is available.
    """
    
    def __init__(self, session_plan: SessionPlan):
        self.plan = session_plan
        self.current_node_id: str = session_plan.start_node_id
        self._escalation_packets: dict[str, str] = {}  # Temporary cross-reference packets
    
    def set_current_node(self, node_id: str):
        """Switch to a new node. Clears any escalation packets."""
        self.current_node_id = node_id
        self._escalation_packets.clear()
        
        # Check for pre-planned cross-reference injection
        node = self.plan.nodes[node_id]
        if node.cross_reference_inject:
            for ref_node_id in node.cross_reference_inject:
                if ref_node_id in self.plan.nodes:
                    self._escalation_packets[ref_node_id] = \
                        self.plan.nodes[ref_node_id].domain_packet
    
    def get_current_domain_packet(self) -> str:
        """Returns the current node's domain packet plus any escalation packets."""
        current = self.plan.nodes[self.current_node_id].domain_packet
        
        if self._escalation_packets:
            escalation_context = "\n\n".join([
                f"[Cross-reference context for follow-up:]\n{packet}"
                for packet in self._escalation_packets.values()
            ])
            return f"{current}\n\n{escalation_context}"
        
        return current
    
    def get_current_rubric_descriptors(self) -> list[str]:
        """Returns the current node's rubric descriptors."""
        return self.plan.nodes[self.current_node_id].rubric_descriptors
```

---

## 8. System Prompts

### 8.1 Runtime Agent System Prompt

```python
# backend/pipeline/prompts.py

RUNTIME_SYSTEM_PROMPT = """You are an AI oral assessment agent conducting a structured assessment.

SCAFFOLD TYPE: {scaffold_type}
CURRENT PHASE: {current_phase} — {phase_description}

YOUR TASK THIS TURN:
{question_instructions}

SAMPLE QUESTIONS (use as inspiration, adapt naturally):
{sample_questions}

DOMAIN KNOWLEDGE FOR THIS QUESTION (use ONLY for evaluation, never state directly):
{domain_packet}

EVALUATION CRITERIA (what to listen for in the learner's response):
{rubric_descriptors}

FOLLOW-UP LOGIC:
{follow_up_rules}

LEARNER'S CURRENT UNDERSTANDING (belief model):
{belief_model}

ASSESSMENT PROGRESS:
{competency_state_summary}

STRUCTURAL MOVE BEFORE YOUR RESPONSE: {structural_move}

RESPONSE FORMAT — You MUST do two things every turn:

1. CALL the evaluate_response function with your assessment of the learner's response.
   This is REQUIRED on every turn after the learner speaks. The function call provides
   structured evaluation data to the assessment system.

2. RESPOND to the learner with your spoken text. This is ALL the learner sees.
   Be direct, concise, and conversational. Sound like a sharp, encouraging professor.
   Keep responses under 80 words. This is a conversation, not a lecture.

Both the function call and your text response are produced in the same turn.
The function call is invisible to the learner — only your text response is displayed.

CRITICAL RULES:
1. ALWAYS call evaluate_response after the learner speaks. Do not skip it.
2. NEVER reveal domain knowledge directly. You assess; you don't teach (unless scaffold type is socratic_exploration and the learner is stuck).
3. NEVER give evaluative feedback ("good job", "correct", "wrong"). Exception: the reflect-back structural move for anxious learners.
4. Ask ONE question per turn. Maximum two if they are tightly related.
5. If the learner asks you to explain something or give an answer, redirect: "I want to hear your thinking first."
6. If a structural move is specified, execute it before your question.
"""
```

### 8.2 Phase Descriptions

```python
PHASE_DESCRIPTIONS = {
    1: "Orientation — Signpost the session structure. Deliver the opening script. No assessment yet.",
    2: "Foundation Probe — Assess conceptual understanding via teach-back and explanation. Determine the learner's baseline.",
    3: "Depth Scaling — Find the knowledge ceiling. Increase difficulty until the learner reaches their limit.",
    4: "Applied Reasoning — Test transfer to novel scenarios with ambiguity. Evaluate reasoning quality, not just correctness.",
    5: "Synthesis & Close — Ask one integration question. Then deliver the closing script. Do not add performance commentary.",
}
```

### 8.3 LO Extraction Prompt — V2 (Not Used in MVP)

```python
# V2: Used when instructors upload source materials for automated LO extraction.
# For MVP, instructors define LOs manually.

LO_EXTRACTION_PROMPT = """Analyze the following course materials and extract or synthesize 
learning outcomes suitable for an oral assessment.
...
"""
```

### 8.4 Rubric Generation Prompt (Claude Sonnet 4.6)

```python
RUBRIC_GENERATION_PROMPT = """Generate an assessment rubric for oral examination based on 
the following learning outcomes.

For each learning outcome, describe what a student would DEMONSTRATE at each performance level 
during a voice conversation. Be specific and observable — not "shows understanding" but 
"explains the causal mechanism linking X to Y, including the intermediate steps."

LEARNING OUTCOMES:
{formatted_learning_outcomes}

SCAFFOLD TYPE: {scaffold_type}

ADDITIONAL INSTRUCTIONS FROM INSTRUCTOR:
{additional_instructions}

For each learning outcome, also generate:
- A coverage summary (1-2 sentences, plain English, describing how this LO will be assessed)
- 2-3 sample questions at varying difficulty levels

Respond with JSON only, no preamble:
{rubric_schema}
"""
```

### 8.5 Profiler Prompt (Claude Sonnet 4.6)

```python
PROFILER_PROMPT = """You are generating a competency profile for a student who just completed 
an oral assessment. You have the full transcript, the accumulated competency state, the belief 
model, and the assessment rubric.

Your profile must be:
- Specific: reference actual moments from the transcript
- Honest: do not inflate or deflate performance
- Constructive: growth areas should be framed as next steps, not failures
- Verifiable: anyone reading the transcript should agree with your assessment

TRANSCRIPT:
{transcript}

COMPETENCY STATE:
{competency_state}

BELIEF MODEL:
{belief_model}

EVALUATION LOG:
{evaluation_log}

KEY MOMENTS:
{key_moments}

RUBRIC:
{rubric}

LEARNING OUTCOMES:
{learning_outcomes}

Generate the competency profile as JSON:
{{
  "competency_map": {{
    "conceptual_understanding": <1-5 float>,
    "verbal_explanation_ability": <1-5 float>,
    "applied_reasoning": <1-5 float>,
    "knowledge_depth": <1-5 float>,
    "synthesis_and_integration": <1-5 float>
  }},
  "knowledge_ceiling": <1-5 int>,
  "narrative_assessment": "<2-3 sentences, plain language, specific to this student>",
  "strengths": [
    "<specific strength referencing a transcript moment>"
  ],
  "growth_areas": [
    "<specific growth area with constructive framing>"
  ]
}}
"""
```

---

## 9. Frontend Specification

### 9.1 Student Session UI (`/assess/[sessionId]`)

**Layout:** Full-screen, minimal. Three elements:

1. **Transcript panel** (center, scrolling): Shows the conversation as it unfolds. AI messages appear as text blocks. Learner messages appear with **live transcription** — words appear in real time as the student speaks, using Deepgram's `interim_results`. Interim (in-progress) text is displayed in a lighter style; when the final transcription for that utterance is received, it replaces the interim text and renders in full style. This lets the student verify their speech is being captured accurately while they speak. Auto-scrolls to latest message.

2. **Status bar** (top): Session timer (elapsed), current phase indicator (subtle dots or progress bar — Phase 1/2/3/4/5), connection status indicator.

3. **Controls** (bottom): Microphone status indicator (listening/processing), "End Session" button.

**Live transcription implementation:**

Deepgram's streaming STT produces two types of events:
- `interim_results`: Partial, in-progress transcription (updates frequently as the student speaks)
- `final_results`: Complete transcription for a finished utterance (arrives when the student pauses)

The Pipecat pipeline emits both to the client. The frontend handles them differently:

```typescript
// frontend/lib/pipecat.ts
import { PipecatClient } from "@pipecat-ai/client-js";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";

export async function initSession(sessionId: string, assessmentId: string) {
  const transport = new SmallWebRTCTransport({
    signalUrl: `${API_URL}/api/sessions/${sessionId}/offer`,
    additionalData: { assessment_id: assessmentId },
  });
  
  const client = new PipecatClient({ transport });
  
  // AI text responses (displayed, not spoken)
  client.on("botText", (text: string) => {
    addToTranscript({ role: "ai", text, final: true });
  });
  
  // Live transcription — interim results (partial, updating)
  client.on("userTranscriptionInterim", (text: string) => {
    updateInterimTranscript({ role: "learner", text, final: false });
  });
  
  // Final transcription (replaces interim)
  client.on("userTranscript", (text: string) => {
    finalizeTranscript({ role: "learner", text, final: true });
  });
  
  await client.connect();
  return client;
}
```

```typescript
// frontend/components/session/TranscriptPanel.tsx
// 
// Interim text: displayed in gray/lighter font, updates in place as the 
// student continues speaking. Only one interim block exists at a time.
//
// Final text: displayed in full style. When a final transcription arrives,
// it replaces the interim block and becomes a permanent transcript entry.
//
// This gives the student real-time feedback that their speech is being 
// captured, and lets them see if they need to repeat or clarify.
```

**Note on Pipecat event names:** The exact event names (`userTranscriptionInterim`, `userTranscript`) need to be verified against the Pipecat client SDK docs. Deepgram's `interim_results=True` parameter (set in our STT config) enables interim transcriptions. Pipecat may expose these as separate events or as a single event with an `is_final` flag — check the SDK.

**Pre-session screen:** Before the session starts, show:
- Assessment title and estimated duration
- Microphone permission request (with instructions if blocked)
- Equipment check: "Say something to test your microphone" with live transcription preview (this doubles as both a mic test and a transcription accuracy test)
- "Begin Assessment" button (disabled until mic is confirmed working)

**Post-session screen:** After session ends, show:
- "Assessment complete. Your competency profile is being generated."
- Spinner while profiler runs (~15-30 seconds)
- Redirect to profile view when ready

### 9.2 Assessment Configuration UI (`/instructor/assessment/new`)

**MVP flow:** No file upload. The instructor defines learning outcomes manually, selects a scaffold type, confirms, and the system generates everything else. File upload and LO extraction from syllabi is a future enhancement.

**Layout:** Single page, stepped flow. Three steps visible as a progress indicator at the top; content for the current step below.

**Step 1: Define Learning Outcomes**

- Assessment title text input
- Editable list of learning outcomes. Each item is a text input with a delete button. "Add Learning Outcome" button at bottom.
- Instructor types LOs in their own words: "Explain the causal mechanisms of supply and demand," "Apply price elasticity concepts to real-world markets," etc.
- Minimum 2 LOs, maximum 8 for a single session.
- Optional: "Additional instructions" textarea for anything the instructor wants to emphasize ("Focus on application, not memorized definitions").
- "Continue" button → advances to Step 2.

**Step 2: Select Assessment Type**

- Two cards, selectable (radio-style):
  - **Competency Map:** "Assess the breadth and depth of what students know. The AI scales from foundational questions to advanced application, finding each student's ceiling. Produces a detailed competency profile with scores across multiple dimensions."
  - **Socratic Exploration:** "Guide students through the material with adaptive questioning. More educational than evaluative — the AI scaffolds when students are stuck and extends when they're flowing. Produces a learning profile focused on breakthroughs and remaining gaps."
- Duration slider (10–20 minutes, default 15).
- "Generate Assessment" button → triggers rubric and session plan generation. Shows a loading state ("Building your assessment..."). This is an async call — rubric generation takes a few seconds, session plan compilation takes up to 60 seconds.

**Step 3: Review and Publish**

Appears once generation completes. Two sections:

**Section A: Coverage Summary**
- Read-only text blocks, one per LO. Each shows 1–2 sentences describing how the LO will be assessed. Generated by the compiler.
- Gap indicator: "All learning outcomes are covered" (green) or "LO X has limited coverage" (amber).

**Section B: Assessment Rubric**
- Table: rows = LOs, columns = Exceeds / Meets / Approaching / Does Not Meet.
- Each cell is an editable textarea, pre-populated with specific, observable performance descriptions.
- Each row is expandable (progressive disclosure): click to reveal sample questions and a brief description of the adaptive approach for that LO.
- Editing a rubric cell does NOT auto-regenerate — the instructor edits are treated as overrides. A "Regenerate" button per row is available if they want the AI to redo it.

**Publish button** at the bottom of Step 3. Clicking publishes the assessment and shows a shareable link + option to copy. The instructor can return to edit the rubric at any time before students begin.

**API calls in this flow:**

| User action | API call | What happens |
|---|---|---|
| Clicks "Generate Assessment" | `POST /api/assessments` (creates draft with LOs, scaffold type, duration) then `POST /api/assessments/{id}/generate-rubric` | Creates assessment, generates rubric + coverage summary + compiles session plan |
| Edits a rubric cell | Local state only (saved on publish) | No API call — edits are client-side until publish |
| Clicks "Regenerate" on a row | `POST /api/assessments/{id}/regenerate-rubric-row` | Regenerates one rubric row from the LO |
| Clicks "Publish" | `PUT /api/assessments/{id}/rubric` then `POST /api/assessments/{id}/publish` | Saves any rubric edits, recompiles session plan if rubric changed, publishes |

**Future enhancement (V2):** Add a "Upload Materials" option in Step 1 that extracts LOs from a syllabus/textbook, pre-populating the LO list. The rest of the flow remains identical.

### 9.3 Instructor Dashboard (`/instructor/assessment/[assessmentId]`)

**Layout:** Header with assessment title and metadata. Below: tab navigation between "Overview" and "Students."

**Overview tab:**
- Completion stats: X of Y students completed, average duration
- Score distribution: horizontal bar chart per competency dimension (conceptual understanding, verbal explanation, applied reasoning, knowledge depth, synthesis)
- Topic breakdown: per-LO average scores, highlighting weak topics (the NYU paper's most powerful diagnostic feature for instructors)
- Flags summary: count of sessions with extraction attempts, high scaffolding, etc.

**Students tab:**
- Sortable table: student name, completion date, overall score, flags
- Click a row → individual session review page

### 9.4 Session Review (`/instructor/assessment/[assessmentId]/session/[sessionId]`)

**Layout:** Two-column. Left: competency profile (same as student view). Right: transcript with playback controls.

**Transcript viewer:** Full transcript with:
- Phase markers (visual dividers between phases)
- Turn annotations: question type labels, node IDs (subtle, for debugging)
- Audio playback synced to transcript position (play from any turn)
- Flag indicators inline (extraction attempts, edge cases)

### 9.5 Competency Profile View (`/student/profile/[sessionId]`)

**Layout:** Clean, document-like. Printable/shareable.

- Header: Student name, date, domain, session duration
- Competency map: horizontal bar chart per dimension (1-5 scale)
- Narrative assessment: 2-3 sentences
- Strengths: bullet list
- Growth areas: bullet list
- Verification links: transcript viewer, recording playback
- Assessment ID (for verification)

---

## 10. Authentication

### 10.1 Magic Link Flow

```python
# backend/api/auth.py

@router.post("/auth/magic-link")
async def request_magic_link(body: MagicLinkRequest, db: Session):
    # Find or create user
    user = await get_or_create_user(db, email=body.email)
    
    # Generate token (expires in 15 min)
    token = secrets.token_urlsafe(32)
    await create_auth_token(db, user_id=user.id, token=token, 
                            expires_at=datetime.utcnow() + timedelta(minutes=15))
    
    # Send email
    link = f"{settings.FRONTEND_URL}/auth/verify?token={token}"
    await send_email(
        to=body.email,
        subject="Sign in to Aver",
        body=f"Click here to sign in: {link}"
    )
    
    return {"message": "Check your email"}

@router.get("/auth/verify")
async def verify_token(token: str, db: Session, response: Response):
    auth_token = await get_valid_token(db, token)
    if not auth_token:
        raise HTTPException(401, "Invalid or expired token")
    
    # Mark token as used
    await mark_token_used(db, auth_token.id)
    
    # Create session JWT
    jwt_token = create_jwt(user_id=auth_token.user_id)
    response.set_cookie("session", jwt_token, httponly=True, samesite="lax")
    
    user = await get_user(db, auth_token.user_id)
    return {"user": user, "token": jwt_token}
```

### 10.2 Assessment Access (Students)

Students access assessments via a shareable link: `{FRONTEND_URL}/assess/{assessment_id}?invite={invite_token}`

The invite token auto-enrolls the student and redirects to the session start screen. If the student isn't authenticated, they're prompted to enter their email (magic link), then redirected back.

---

## 11. Deployment

### 11.1 Docker Compose

```yaml
# docker-compose.yml
version: "3.9"

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://aver:${DB_PASSWORD}@db:5432/aver
      - DEEPGRAM_API_KEY=${DEEPGRAM_API_KEY}
      - GOOGLE_API_KEY=${GOOGLE_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - S3_BUCKET=${S3_BUCKET}
      - S3_ACCESS_KEY=${S3_ACCESS_KEY}
      - S3_SECRET_KEY=${S3_SECRET_KEY}
      - JWT_SECRET=${JWT_SECRET}
      - FRONTEND_URL=https://${DOMAIN}
    depends_on:
      - db
    volumes:
      - ./backend:/app
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=https://${DOMAIN}/api
    depends_on:
      - backend
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=aver
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=aver
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
    depends_on:
      - backend
      - frontend
    restart: unless-stopped

volumes:
  pgdata:
```

### 11.2 Nginx Configuration

```nginx
# nginx.conf
server {
    listen 443 ssl;
    server_name ${DOMAIN};

    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    # API routes → FastAPI
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebRTC signaling endpoint (SmallWebRTCTransport SDP offer/answer)
    location /api/sessions/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 1800;        # 30 min — sessions are long-lived
        proxy_send_timeout 1800;
    }

    # Everything else → Next.js
    location / {
        proxy_pass http://frontend:3000;
        proxy_set_header Host $host;
    }
}
```

### 11.3 Environment Variables

```env
# .env.example

# Database
DB_PASSWORD=<strong-password>

# LLM Providers
GOOGLE_API_KEY=<gemini-api-key>
ANTHROPIC_API_KEY=<anthropic-api-key>

# Voice
DEEPGRAM_API_KEY=<deepgram-api-key>
# DAILY_API_KEY=<daily-api-key>          # V2: uncomment when adding server-side video recording
# DAILY_DOMAIN=<your-daily-domain>       # V2: uncomment when adding server-side video recording
STUN_SERVERS=stun:stun.l.google.com:19302  # Free Google STUN for SmallWebRTC NAT traversal

# Storage
S3_BUCKET=aver-recordings
S3_ACCESS_KEY=<s3-access-key>
S3_SECRET_KEY=<s3-secret-key>
S3_ENDPOINT=<s3-endpoint-url>

# Auth
JWT_SECRET=<random-256-bit-secret>

# App
DOMAIN=app.aver.education
FRONTEND_URL=https://app.aver.education
```

---

## 12. Build Sequence

| Phase | Deliverable | Validates |
|-------|------------|-----------|
| **1** | Pipecat pipeline with SmallWebRTCTransport: Deepgram STT → hardcoded LLM context → Gemini Flash → text response displayed in browser via Pipecat prebuilt UI. No rules engine, no session plan. Hardcoded questions. | Voice loop works. Latency is acceptable. Turn-taking feels natural. SmallWebRTC connects reliably. |
| **2** | Rules engine node in pipeline. Load a manually-written session plan JSON. Domain window injection, node navigation, evaluation block parsing. | Ephemeral window architecture works. Agent follows the plan. |
| **3** | Session plan compiler. From hardcoded LOs + rubric → compiled plan → fed to pipeline. End-to-end: input config → voice conversation. | AI-generated plans produce good conversations. |
| **4** | Instructor configuration UI. Upload materials → LO extraction → rubric generation → review surface → publish → compile. | Professors can configure assessments. The rubric review surface is usable. |
| **5** | Profiler. Post-session: transcript + state → competency profile. Student profile view. | Output artifact is valuable and specific. |
| **6** | Auth (magic links), session persistence, student enrollment, instructor dashboard. | Multi-user, production-ready. |
| **7** | Recording storage, transcript playback, session review UI. | Verification layer works. |

**Phase 1 is the acid test.** If a hardcoded conversation doesn't feel natural over voice, nothing else matters. Spend the time here to get latency, turn-taking, and the agent's conversational register right before layering in the assessment logic.

---

## 13. Testing Strategy

### 13.1 Pipeline Testing

- **Latency benchmark:** Measure end-to-end turn latency (end of learner speech → AI text displayed). Target: <1.5 seconds. Log p50 and p95.
- **Evaluation block parsing:** Unit tests for `_parse_response()` — verify correct extraction of eval block and utterance from various response formats, including malformed responses.
- **Rules engine state machine:** Unit tests for node navigation, phase transitions, domain window swapping, belief model updates. Test against manually crafted session plans with known expected paths.
- **Output validation:** Unit tests for multi-question detection, evaluative language filtering.

### 13.2 Compiler Testing

- **LO extraction:** Compare extracted LOs against manually identified LOs for 5-10 sample syllabi across different domains.
- **Rubric quality:** Human review of generated rubrics for specificity, observability, and appropriate difficulty calibration.
- **Session plan coherence:** Run compiled plans through the pipeline with simulated learner inputs to verify navigation logic and follow-up appropriateness.

### 13.3 End-to-End Testing

- **Self-assessment:** Take the assessment yourself across multiple domains. Record and review. This is the most important test.
- **Edge case simulation:** Script specific learner behaviors (silence, tangent, "I don't know", extraction attempt) and verify the agent handles them per spec.
- **Profiler accuracy:** Compare generated profiles against human assessment of the same transcripts (small calibration study, 10-20 sessions).

### 13.4 Security Testing

- **Domain window isolation:** Attempt to extract domain knowledge through conversational probing. Verify the agent cannot answer questions about topics it hasn't been given the domain packet for.
- **System prompt extraction:** Attempt standard prompt injection techniques. Verify the system prompt doesn't contain answer keys (domain knowledge is in ephemeral windows, not the system prompt).
- **Rubric descriptor leakage:** Take multiple assessments on the same topic and analyze whether the pattern of follow-up questions reveals rubric content. This is the pre-launch red-team study.

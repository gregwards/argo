# Argo Architecture

AI oral assessment platform. Students have an adaptive voice conversation with an AI assessor; the system produces a competency profile with evidence-backed findings.

---

## Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 14, React 18, TypeScript | App router, SSR, path aliases |
| Backend | FastAPI, Python 3.12, async throughout | Native async, Pydantic validation |
| Voice pipeline | Pipecat 1.0+ | STT/LLM/TTS orchestration, WebRTC transport |
| Runtime LLM | Gemini 2.5 Flash | ~250 tok/s — latency is ~70% of voice turn time |
| Compilation LLM | Claude Sonnet 4.6 | Quality-critical; runs once at publish |
| Profiling LLM | Claude Sonnet 4.6 | Complex qualitative analysis; runs once post-session |
| STT | Deepgram Nova-2 | Streaming, interim results, configurable endpointing |
| TTS | Inworld (Jessica, 1.5-max) | Streaming WebSocket, low latency |
| Transport | Daily.co WebRTC rooms | Managed rooms, bot tokens, data channels |
| Database | PostgreSQL 16, SQLAlchemy async, asyncpg | JSONB for flexible nested state |
| Auth | Magic links + JWT (PyJWT) | No passwords; assessment-scoped tokens |
| Email | Resend | Magic link delivery |
| Storage | S3/CloudFlare R2 or local filesystem | Session recordings |
| Deployment | Docker Compose (dev), Railway (staging) | Hot reload locally, auto-deploy from git |

---

## Database Schema

Eight tables. All primary keys are UUID4.

### Users
`email` (unique), `name`, `role` ("instructor" / "student"). No password — magic link only.

### AuthToken
Single-use magic link tokens. `user_id` FK, `assessment_id` FK (nullable), `token` (urlsafe, unique), `expires_at` (15 min), `used_at` (null until consumed). Assessment-scoped by design.

### Course
Logical grouping. `instructor_id` FK, `name`.

### Assessment
The core entity. Key fields:

- `slug` — human-readable URL, generated at publish: `{title}-{md5_suffix}`
- `scaffold_type` — "competency_map" or "socratic_exploration"
- `learning_outcomes` — JSONB array: `[{id, text, bloom_level, estimated_minutes}]`
- `rubric` — JSONB: `[{learning_outcome_id, criteria: [{id, name, weight, descriptors}]}]`
- `session_plan` — JSONB: compiled node graph (see Compiler section)
- `session_plan_version` — incremented on each publish; sessions pin this
- `status` — "draft" → "published" → "archived" / "closed"
- `max_attempts` — default 1
- `tts_enabled` — default true

### AssessmentEnrollment
Join table: `assessment_id` + `student_id` with unique constraint. Controls who can access an assessment.

### Session
Tracks active/completed sessions. Key fields:

- `session_plan_version` — pinned at creation (assessment updates don't affect in-flight sessions)
- `status` — "pending" → "active" → "completed" / "abandoned" / "error"
- `transcript` — JSONB: `[{turn, role, text, timestamp}]`
- `belief_model` — JSONB: per-LO understanding estimates
- `evaluation_log` — JSONB: every `evaluate_response()` call
- `competency_state`, `key_moments`, `flags` — JSONB
- `recording_ref` — S3 key or local path
- `duration_seconds` — computed at finalization

### CompetencyProfile
Post-session output. Key fields:

- `criteria_scores` — JSONB: `[{criterion_id, ai_score (1-5), level, evidence_turns, strength, growth}]`
- `narrative_assessment` — overall summary
- `strengths`, `growth_areas` — JSONB arrays
- `profiler_model` — e.g. "claude-sonnet-4"

### ProfileScoreEdit
Instructor adjustment audit trail: `original_score`, `new_score`, `edited_by`, `edited_at`.

---

## Authentication

### Magic Link Flow

1. Student enters email on `/assess/{slug}` → `POST /api/auth/magic-link`
2. Backend finds/creates user, checks enrollment + attempt limits
3. Token created regardless of enrollment (prevents timing attacks / email enumeration)
4. Email sent only if enrolled and within limits
5. Student clicks link → `GET /api/auth/verify?token={token}`
6. Token marked used (single-use), JWT issued:
   - **Session JWT** — includes `assessment_id` claim, 1-day TTL, httpOnly cookie `session`
   - **Portal JWT** — no `assessment_id`, 7-day TTL, httpOnly cookie `portal_session`
7. Redirect to lobby

### Scope Enforcement

Every API route uses `get_current_user()` which validates the JWT and checks `assessment_id` matches the request. Students can only access the assessment they authenticated for.

### Site Password Gate

Staging/dev behind password gate. Frontend middleware checks `site_auth=granted` cookie on `/dev`, `/instructor`, `/demo` routes. Backend dev endpoints check same cookie via `require_site_auth()` dependency.

---

## Assessment Creation Pipeline

### 1. Extract Learning Outcomes

`POST /api/assessments/extract-los` — accepts PDF, DOCX, or pasted text.

- PyMuPDF / python-docx parse uploads (10 MB limit)
- Claude Sonnet analyzes source material
- Returns LOs with Bloom's level, estimated minutes, provenance ("extracted" vs "synthesized")

### 2. Generate Rubric

`POST /api/assessments/{id}/generate-rubric` — Claude Sonnet generates from LOs.

Output structure:
```json
{
  "rubric": [{
    "learning_outcome_id": "lo_1",
    "criteria": [{
      "id": "crit_1a",
      "name": "...",
      "weight": 25,
      "descriptors": ["descriptor 1", "..."]
    }]
  }],
  "coverage_summary": [...]
}
```

Weights normalized via largest-remainder method to sum to exactly 100.

### 3. Publish (Compile Session Plan)

`POST /api/assessments/{id}/publish` — Claude Sonnet compiles rubric + LOs into a session plan.

The session plan is a **node graph** — each node represents one question or structural moment:

```json
{
  "start_node_id": "node_1",
  "nodes": {
    "node_1": {
      "learning_outcome_id": "lo_1",
      "criteria_name": "...",
      "rubric_descriptors": ["..."],
      "domain_packet": "Reference material for evaluation only",
      "question_instructions": "What to ask and how",
      "sample_questions": ["variant 1", "variant 2"],
      "follow_up_rules": [...],
      "cross_reference_inject": ["node_3"],
      "priority": "required" | "if_time_permits",
      "structural_move_before": "Transition phrase"
    }
  },
  "max_duration_seconds": 960
}
```

Assessment status → "published", slug generated, `session_plan_version` incremented.

---

## Voice Pipeline

### Architecture

```
transport.input()
  → AudioRecorderProcessor    (passively copies frames for recording)
  → DeepgramSTTService        (streaming speech-to-text)
  → context_aggregator.user() (builds LLM context from transcript)
  → GoogleLLMService          (Gemini Flash — generates response + calls evaluate_response)
  → InworldTTSService         (text-to-speech, if enabled)
  → context_aggregator.assistant()
  → transport.output()
```

Assembled in `backend/pipeline/session_runner.py`.

### Transport

`DailyTransport` — Daily.co WebRTC rooms with:
- `audio_in_enabled=True`
- `audio_out_enabled=tts_enabled`
- `audio_in_filter=RNNoiseFilter()` (echo/noise suppression when TTS enabled)
- `vad_analyzer=SileroVADAnalyzer(min_volume=0.5, stop_secs=0.5)`

VAD `stop_secs=0.5` is intentionally low — it's only for speech detection. Actual turn-taking silence threshold is controlled by the stop strategy.

### Turn-Taking

Uses `SpeechTimeoutUserTurnStopStrategy(user_speech_timeout=5.0)` — a flat 5-second silence window after speech ends.

**Why not the default TurnAnalyzerUserTurnStopStrategy:** The default uses an ML model to predict sentence completeness and fires in ~1s for "finished" sentences. In an oral assessment, students need time to think. Getting cut off after 1 second of silence feels adversarial. The 5-second window is consistent and predictable.

**How it interacts with other components:**
- Deepgram `endpointing=5000` — sends finalized transcript after 5s silence
- VAD `stop_secs=0.5` — detects speech boundaries quickly
- Pipecat calculates turn timeout as `max(stt_p99 - stop_secs, user_speech_timeout)` — with our values, the 5.0s timeout dominates

### Evaluation (Function Calling)

The LLM calls `evaluate_response()` on every student turn. This is the core assessment mechanism.

**Required parameters:**
- `descriptor_matches` — which rubric descriptors the student hit
- `response_quality` — "strong" / "partial" / "weak" / "off_topic" / "silence"
- `next_action` — "advance" / "follow_up" / "scaffold" / "redirect" / "move_on" / "end_phase"

**Optional parameters:**
- `belief_update` — `{understanding_level, claims, gaps, scaffolding_needed, confidence_signal}`
- `follow_up_type` — taxonomy (causal_interrogation, specificity_probe, etc.)
- `flags` — extraction_attempt, anxiety_pattern, etc.
- `confidence_adjustment` — -0.5 to 0 (qualitative concern)
- `key_moment` — notable turn description
- `observation` — qualitative signal (inconsistency, rote_memorization, etc.)

**Why function calling, not XML/structured output:** Pipecat + Gemini have native function calling support. Schema-validated, no parsing fragility. The structured output feeds the rules engine state machine directly.

### Ephemeral Domain Windows

Core security mechanism. The LLM only sees one question node's `domain_packet` at a time.

**How it works:** `ContextManager` strips the previous node's domain packet and injects the current node's packet into the system prompt when the rules engine navigates to a new node. Cross-reference packets allow pre-planned escalation material.

**Why:** Prevents the LLM from seeing answers to future questions. If a student tries to extract information about upcoming questions, the LLM literally doesn't have that context.

---

## Rules Engine

`backend/pipeline/rules_engine.py` — the assessment state machine.

### State

```python
SessionState:
  current_node_id    # Navigation pointer into session plan
  phase              # 1-5 for structured, 99 = ending
  turn_count         # Incremented every evaluation
  transcript         # [{turn, role, text, timestamp}]
  evaluation_log     # [{turn, node_id, evaluation}]
  belief_model       # {lo_id: {understanding_level, claims, gaps, confidence}}
  competency_state   # Foundation scores, trajectory
  key_moments        # Notable turns flagged by LLM
  flags              # Behavioral signals
```

### Per-Turn Flow

1. **`on_learner_turn(text)`** — apply pending navigation, increment turn counter, record transcript
2. **`on_evaluation(eval_args)`** — the main processing:
   - Apply any pending navigation from previous turn
   - Check hard time limit (target + 2 min buffer)
   - Detect extraction attempts → silent redirect
   - Update belief model (per-LO understanding + confidence)
   - Resolve navigation:
     - Fast-skip: one strong answer at a difficulty level skips remaining at that level
     - Adaptive pacing: skip "if_time_permits" nodes under time pressure
     - Belief-driven advance: if understanding is established, auto-advance past remaining LO nodes
   - Store pending navigation for next turn
3. **`should_end_session()`** — checked after each evaluation:
   - Hard time limit exceeded
   - All LOs assessed with at least partial understanding
   - No more nodes to advance to
   - Phase set to 99 (explicit end)

### Navigation

Navigation instructions are stored in `_pending_navigation` and applied at the start of the next evaluation. Types:
- `stay` — same node, ask follow-up
- `advance` — move to target node (or end session if no next node)
- `phase_transition` — jump to next phase
- `end_session` — set phase=99, trigger closing

---

## Profiler

`backend/profiler/profiler.py` — runs async after session finalization.

Claude Sonnet analyzes the full transcript, evaluation log, and belief model. Produces:

- Per-criterion scores (1-5 Likert) with evidence turn numbers
- Per-criterion strength + growth feedback with supporting quotes
- Narrative assessment (overall summary)
- Belief model notes (qualitative signals: anxiety vs knowledge gap)

120-second timeout with error fallback. Stored as `CompetencyProfile` in the database.

---

## Frontend Pages

### Student Flow

1. **`/assess/{slug}`** — Email entry. Requests magic link.
2. **`/assess/{slug}/lobby`** — Camera/mic check. "Begin Assessment" creates session + connects WebRTC.
3. **`/session/{sessionId}`** — Active session. Shows:
   - Live transcript (interim + final)
   - Countdown bar (5s drain synced to turn-taking)
   - Section progress bars (asymptotic curve + belief model floor)
   - Camera preview
   - Timer
4. **`/student/profile/{sessionId}`** — Competency profile. Per-criterion cards with score blocks, strength/growth feedback, supporting quotes. Polls for profile generation (3s interval, 60s timeout).
5. **`/student`** — Portal. Lists all sessions and assessment history.

### Instructor Flow

1. **`/instructor`** — Assessment list with session counts.
2. **`/instructor/assessment/new`** — Create: title, LOs (manual or extracted from file), scaffold type, duration.
3. **`/instructor/assessment/{id}/edit`** — Rubric editor. Generate or manually edit criteria, weights, descriptors.
4. **`/instructor/assessment/{id}`** — Assessment detail. Publish, share link, session list, score distributions.
5. **`/instructor/session/{id}`** — Drill-down. Full transcript, evaluation log, recording playback.

### Dev/Demo

- **`/dev`** — Dev console. Seed data, impersonate users, enroll students, view all assessments/sessions.
- **`/demo`** — Co-founder demo landing. Pipeline overview with MVP progress bars, guided walkthrough (take assessment as student, build as instructor).

### Pipecat Client (`frontend/lib/pipecat.ts`)

Factory function `createPipecatClient(callbacks)` creates a `PipecatClient` with `DailyTransport`. Handles:
- `onBotLlmText` → AI response text
- `onUserTranscript` → interim/final user speech
- `onTrackStarted` → TTS audio playback via HTMLAudioElement
- `onServerMessage` → data channel messages (criterion_advance, section_progress)

---

## Session Lifecycle

```
POST /api/sessions                    → Session created (status: pending)
POST /api/sessions/{id}/connect       → Daily room created, bot spawned
  ↓
Pipeline runs:
  Student speaks → Deepgram STT → LLM context → Gemini responds
    + evaluate_response() → Rules engine → belief model update → navigation
    + section_progress sent via Daily data channel
    + persist_session_state() fire-and-forget
  ↓
should_end_session() → closing statement → auto-disconnect
  ↓
finalize_session()                    → Status: completed, transcript persisted
  ↓
_run_profiler()                       → Claude Sonnet generates CompetencyProfile
  ↓
Frontend polls /profile               → Redirect to competency report
```

---

## Security Model

### Assessment Scope (D-02)
JWT includes `assessment_id`. Verified on every request. Students can only access the assessment they authenticated for.

### Enrollment Check (D-04)
`AssessmentEnrollment` row required. Checked at magic link send and session creation.

### Email Enumeration Prevention (D-06)
Same work (token creation, email send attempt) regardless of enrollment status. Response always says "Check your email."

### Single-Use Tokens (T-02-02)
`AuthToken.used_at` set on first validation. Atomic check prevents reuse.

### Extraction Attempt Detection (D-11)
If the LLM flags an extraction attempt, the rules engine silently redirects to the current node without advancing. Logged but not shown to student.

### Ephemeral Domain Windows
LLM context only contains current node's domain packet. Previous packets stripped on navigation. Prevents answer leakage across questions.

### Time Limits (D-12)
Hard stop at target + 2 minute buffer. Enforced in rules engine before any evaluation processing.

---

## Environment Variables

### Backend
| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `GOOGLE_API_KEY` | Gemini Flash (runtime LLM) |
| `ANTHROPIC_API_KEY` | Claude Sonnet (compiler + profiler) |
| `DEEPGRAM_API_KEY` | Speech-to-text |
| `INWORLD_TTS_API_KEY` | Text-to-speech |
| `DAILY_API_KEY` | WebRTC room management |
| `JWT_SECRET` | Token signing |
| `FRONTEND_URL` / `FRONTEND_URLS` | CORS origins, magic link URLs |
| `ENVIRONMENT` | "development" enables dev endpoints |
| `SITE_PASSWORD` | Dev/staging gate |
| `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_ENDPOINT` | Recording storage (optional) |

### Frontend
| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API base URL |
| `SITE_PASSWORD` | Gate password |
| `COOKIE_DOMAIN` | Cross-subdomain cookie sharing |

---

## Infrastructure

### Docker Compose (Local Dev)
Three services: backend (Python 3.12 + uvicorn --reload), frontend (Next.js), postgres (16-alpine with healthcheck). Backend volume-mounted for hot reload.

### Railway (Staging)
Auto-deploys from `main` branch. Backend and frontend as separate services. PostgreSQL as managed addon. Environment variables configured in Railway dashboard.

### Key Configuration
| Parameter | Value | Why |
|-----------|-------|-----|
| Deepgram endpointing | 5000ms | 5s silence before transcript finalization |
| VAD stop_secs | 0.5s | Quick speech detection, not turn control |
| Speech timeout | 5.0s | Consistent silence window for students |
| Magic link TTL | 15 min | Security vs usability balance |
| Session JWT TTL | 1 day | Limits token theft window |
| Portal JWT TTL | 7 days | Longer access for student portal |
| Hard time limit | target + 2 min | Buffer before forced end |
| Max assessment duration | 20 min | Absolute ceiling |
| Profile generation timeout | 120s | Prevents indefinite profiler hang |
| Audio recording | 16kHz mono | ~1.9 MB/min, acceptable for MVP |

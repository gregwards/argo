<!-- GSD:project-start source:PROJECT.md -->
## Project

**Aver**

An AI-powered oral assessment platform for education. Instructors define learning outcomes, the system generates an adaptive assessment plan, and students complete a 10-20 minute voice conversation with an AI assessor that probes understanding in real time. The AI produces a competency profile at the end. Built for professors who need scalable oral assessment — written work no longer reliably reflects understanding.

**Core Value:** A student can complete a voice-based assessment that adapts to their actual responses and produces a verified competency profile — something no written exam or static quiz can do.

### Constraints

- **Voice latency**: Conversational agent must use Gemini Flash (~250 tok/s) — latency is ~70% of turn time
- **Security model**: Ephemeral domain window is non-negotiable — behavioral guardrails alone are insufficient per NYU oral assessment paper and OWASP LLM Top 10
- **Transport**: SmallWebRTCTransport (self-hosted, zero cost) at MVP; DailyTransport swap is a config change for V2
- **Function calls**: LLM evaluation via function calls (not structured XML) — Pipecat + Gemini native support, schema-validated
- **No performance commentary**: AI must not give "great job" or similar feedback — the profile is the feedback
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- Python 3.12 - Backend API and voice pipeline (`/Users/gregoryedwards/Documents/dev/aver/backend/`)
- TypeScript 5.4 - Frontend web application (`/Users/gregoryedwards/Documents/dev/aver/frontend/`)
- JavaScript - Next.js runtime and React
- SQL - PostgreSQL schema and queries
## Runtime
- Python 3.12 (backend)
- Node.js (implied by Next.js 14)
- npm (frontend) - `frontend/package.json`
- pip (backend) - `backend/requirements.txt`
## Frameworks
- FastAPI 0.115.0+ - Backend REST API (`backend/main.py`)
- Next.js 14.2.0 - Frontend framework (`frontend/package.json`)
- React 18.3.0 - Frontend UI library
- Pipecat 0.0.104+ - Voice pipeline orchestration with plugins for Google, Deepgram, Silero
- SQLAlchemy 2.0.0+ with async support (`backend/db/database.py`)
- Alembic 1.14.0 - Database migrations
- asyncpg 0.30.0 - PostgreSQL async driver
- Tailwind CSS 3.4.0 - Utility-first CSS
- PostCSS 8.4.0 - CSS processing
- TypeScript 5.4.0 - Type checking for frontend
- Autoprefixer 10.4.0 - CSS vendor prefixes
## Key Dependencies
- `pipecat-ai` - Core voice pipeline framework; includes STT (Deepgram), LLM (Google), VAD (Silero)
- `fastapi` - REST API server
- `sqlalchemy[asyncio]` - ORM with async support
- `asyncpg` - Database connection driver for PostgreSQL
- `uvicorn>=0.32.0` - ASGI server (runs FastAPI)
- `python-dotenv` - Environment variable loading
- `python-multipart` - Multipart form parsing
- `pyjwt>=2.12.0` - JWT token creation and verification
- `anthropic>=0.42.0` - Claude API for compiler and profiler (non-runtime pipeline calls)
- `boto3>=1.35.0` - AWS SDK for S3 (optional; recordings stored locally if not configured)
- `loguru>=0.7.0` - Structured logging
- `pydantic>=2.0.0` - Data validation and settings
## Configuration
- `.env` file (not committed) - Runtime secrets and configuration
- See `.env.example` for required variables:
- `frontend/tsconfig.json` - TypeScript configuration for Next.js
- Docker Compose for local development - `docker-compose.yml`
- `backend/Dockerfile` - Python 3.12 with media libraries for WebRTC
## Platform Requirements
- Docker and Docker Compose (for PostgreSQL and services)
- Python 3.12 with pip
- Node.js/npm (for Next.js)
- ffmpeg system libraries (for Pipecat audio processing)
- Docker containers (backend, frontend, PostgreSQL)
- PostgreSQL 16 database
- Cloud deployment platform (not yet specified)
- S3 or equivalent object storage for recordings (optional)
## Database
- Async driver: asyncpg
- ORM: SQLAlchemy with async support
- URL format: `postgresql+asyncpg://user:password@host:5432/database`
- Connection pooling: SQLAlchemy async session maker
- Defined in `backend/db/database.py` using SQLAlchemy declarative ORM
- Tables: users, auth_tokens, courses, and others (models in `db/database.py`)
- Migrations: Alembic (not yet visible but configured)
## WebRTC & Networking
- SmallWebRTC - Lightweight WebRTC implementation via `pipecat-ai-small-webrtc-prebuilt`
- STUN servers configured via `STUN_SERVERS` env var (defaults to Google STUN)
- ICE candidates exchanged via signaling API at `/api/sessions/{session_id}/offer`
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Python files: `snake_case.py` (e.g., `session_runner.py`, `rules_engine.py`, `database.py`)
- TypeScript/TSX files: `kebab-case` for routes/pages, `camelCase` for utility modules (e.g., `[sessionId]/page.tsx`, `api.ts`, `pipecat.ts`)
- Module organization: Import-based (Python) or path aliases (TypeScript using `@/` prefix)
- Python: `snake_case` (e.g., `run_bot()`, `handle_evaluation()`, `get_next_node_id()`)
- TypeScript: `camelCase` (e.g., `createPipecatClient()`, `formatTime()`, `startSession()`)
- Async functions: Use `async` keyword (Python) or `async` modifier (TypeScript)
- Python: `snake_case` (e.g., `session_plan`, `learner_text`, `response_quality`)
- TypeScript: `camelCase` (e.g., `sessionId`, `interimText`, `elapsedSeconds`)
- React hooks: Prefix with state indicator (e.g., `setPhase`, `setTranscript`, `setMicReady`)
- Private/internal: Leading underscore in Python (e.g., `_build_context()`, `_serialize_assessment()`)
- Python: PascalCase for classes and type hints (e.g., `SessionState`, `RulesEngine`, `Assessment`)
- TypeScript: PascalCase for interfaces/types (e.g., `TranscriptEntry`, `SessionPhase`)
- Enums/union types: Use string literals for flexibility (e.g., `type SessionPhase = "pre" | "active" | "post"`)
- UPPER_SNAKE_CASE for module-level constants (e.g., `DATABASE_URL`, `API_URL`)
## Code Style
- Python: 4-space indentation (PEP 8)
- TypeScript: 2-space indentation (Next.js/React standard)
- Line length: No enforced limit observed; pragmatic line breaking used
- Python: Not enforced (no `.eslintrc` or config detected)
- TypeScript: Not enforced (no `.eslintrc` or config detected)
- No Prettier/Black configuration found — code follows implicit team style
- Python: Module-level docstrings required (triple-quoted, describing purpose)
- Function docstrings: Brief description (no @param/@return style observed)
- Inline comments: Explain *why*, not *what* (e.g., "Workaround: Pipecat's data channel on("open") listener misses the event")
- TypeScript: Inline comments for non-obvious logic; no JSDoc style observed
## Import Organization
- TypeScript: `@/` points to project root for imports (e.g., `import { createPipecatClient } from "@/lib/pipecat"`)
- Python: Relative imports with `from pipeline.module import Class`
## Error Handling
- HTTP exceptions: `raise HTTPException(status_code=404, detail="Assessment not found")`
- Try/except for async operations: `try: ... except Exception as e: logger.error(f"...")`
- Async operations return `None` or data; no custom exception types observed
- No explicit error handling in UI components observed
- API errors caught in `apiFetch()`: `.json().catch(() => ({ detail: res.statusText }))`
- User-facing errors logged to console or state (implicit via UI state)
## Logging
- `logger.info()` for lifecycle events: "Bot started", "Client connected"
- `logger.error()` for exceptions: "Evaluation processing error: {e}"
- `logger.debug()` for detailed state: Turn counts, quality scores, flags
- Always include context: session ID, turn count, operation name
- No logging library used; state-driven (UI renders based on state)
- Implicit logging via component re-renders and callback chains
## Comments
- Explain *why* a workaround exists, not *what* code does
- Document complex logic (state machine transitions, context building)
- Mark temporary solutions: "Workaround: ...", "TODO: ...", "FIXME: ..."
- Not used in TypeScript files observed
- Type annotations sufficient for clarity (interfaces, generic types)
## Function Design
- Prefer named parameters for clarity (e.g., `async def run_bot(transport, session_id: str, session_plan: Optional[dict] = None)`)
- Use kwargs for optional feature flags (e.g., `**kwargs` in Pipecat runners)
- Avoid positional-only; use type hints
- Python: Return data or None; use tuples for multiple values (not observed)
- TypeScript: Return typed values; use callbacks for async updates (React pattern)
- Async functions: Use `await` at call site; return coroutines
## Module Design
- Python: Top-level async functions (e.g., `async def run_bot()`) called by orchestrators
- TypeScript: Export interfaces/types first, then factory functions (e.g., `export function createPipecatClient()`)
- Avoid default exports in utility modules; use named exports for clarity
- Not used; direct imports preferred
- Path aliases (`@/lib/`) manage module organization
- Use Pydantic `BaseModel` for request/response validation (e.g., `CreateAssessmentRequest`, `UpdateRubricRequest`)
- Use dataclass-like objects for state management (e.g., `SessionState` with `__init__` and properties)
## Type Hints
- Use type hints for all function parameters and returns (modern Python 3.10+)
- Optional types: `Optional[str]` or `str | None`
- Collections: `list[dict]`, `dict[str, int]`
- Use interfaces for object shapes
- Inline type definitions for callback signatures
- Generic types for reusable components
## Database/ORM
- Models inherit from `Base` (DeclarativeBase)
- Use UUID primary keys with `uuid4()` default
- Use JSONB columns for flexible nested data
- Index frequently-queried columns (e.g., `assessment_id`, `student_id`, `status`)
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Real-time voice conversation using Pipecat WebRTC framework
- LLM-driven assessment with structured evaluation via function calling
- Session plan compiler that generates dynamic assessment flows from learning outcomes
- Ephemeral domain context injection to ensure assessor never sees unrelated material
- Async-first Python backend with FastAPI; Next.js React frontend
## Layers
- Purpose: Student assessment UI and instructor assessment authoring UI
- Location: `frontend/app/`, `frontend/components/`
- Contains: Next.js page components, Pipecat WebRTC client integration, forms for assessment creation/editing
- Depends on: Backend API (`backend/main.py`), Pipecat client library
- Used by: Students (assessment sessions), instructors (create/publish assessments)
- Purpose: REST endpoints for assessment management, session lifecycle, authentication
- Location: `backend/api/`
- Contains: 
- Depends on: Database layer, compiler, Pipecat transports
- Used by: Frontend, external clients via REST
- Purpose: Generate rubrics and session plans from learning outcomes using Claude LLM
- Location: `backend/compiler/`
- Contains:
- Depends on: `backend/services/llm.py` (Claude API), database
- Used by: Assessment creation endpoint, session initialization
- Purpose: Real-time voice conversation orchestration — STT → LLM → TTS with state management
- Location: `backend/bot.py`, `backend/pipeline/session_runner.py`
- Contains:
- Depends on: Deepgram (STT), Google Gemini (LLM), SmallWebRTC transport, rules engine, context manager
- Used by: Main app (`/start` endpoint), development testing
- Purpose: Orchestrate assessment progression, track competency state, manage evaluation callbacks
- Location: `backend/pipeline/rules_engine.py`
- Contains:
- Depends on: Context manager, session plan, prompts
- Used by: Pipeline via LLM function call handlers
- Purpose: Ephemeral domain window security — strips old context, injects only current node's domain packet
- Location: `backend/pipeline/context_manager.py`
- Contains:
- Depends on: Session plan structure
- Used by: Rules engine during question navigation
- Purpose: System prompts and prompt templates for LLM
- Location: `backend/pipeline/prompts.py`
- Contains:
- Used by: Session runner (context creation)
- Purpose: Persistent storage of users, assessments, sessions, competency profiles
- Location: `backend/db/database.py`
- Contains: SQLAlchemy ORM models (User, Course, Assessment, Session, CompetencyProfile, etc.)
- Depends on: PostgreSQL (async driver asyncpg)
- Used by: All API routes, assessment storage
- Purpose: Abstraction for Claude API calls
- Location: `backend/services/llm.py`
- Contains: `call_claude()` function wrapping Anthropic SDK
- Used by: Compiler (rubric generation, session plan compilation)
## Data Flow
- **SessionState** (in-memory, ephemeral): Tracks phase, turns, transcript, competency updates during active session
- **Database Session model**: Persists after session ends (transcript, duration, status)
- **CompetencyProfile model**: Stores final assessment results (competency_map, knowledge_ceiling, narrative_assessment)
## Key Abstractions
- Purpose: Represents one question or structural section in the session plan
- Location: Generated by compiler, stored in Assessment.session_plan
- Structure: `{"id": "node_1", "phase": 1, "domain_packet": "...", "rubric_descriptors": [...], "follow_up_rules": {...}, "cross_reference_inject": [...]}`
- Pattern: Tree/graph structure allowing conditional navigation
- Purpose: Structured LLM function calling for assessment
- Location: `backend/pipeline/evaluation_schema.py`
- Structure: Defines `evaluate_response(response_quality, next_action, belief_update, flags)` function
- Pattern: LLM calls this function on every learner turn, returning structured assessment data
- Purpose: Security boundary ensuring LLM only sees one question's reference material at a time
- Mechanism: ContextManager strips old node's domain_packet, injects new node's packet + escalation packets
- Pattern: Prevents "jailbreak" attacks where LLM could access out-of-scope answers
- Purpose: Assessment strategy configuration
- Values: "competency_map" (structured progression), "socratic_exploration" (flexible questioning)
- Pattern: Affects system prompt generation and follow-up logic templates
## Entry Points
- Location: `backend/bot.py`
- Triggers: `python bot.py -t webrtc` or via prebuilt UI at `/prebuilt`
- Responsibilities:
- Location: `backend/main.py`
- Triggers: FastAPI startup (via Uvicorn)
- Responsibilities:
- Location: `backend/main.py`, line 66-91
- Triggers: `POST /start` from frontend
- Responsibilities:
- Location: `backend/pipeline/session_runner.py`
- Triggers: Called as background task from `/start` endpoint
- Responsibilities:
- Location: `frontend/app/assess/[sessionId]/page.tsx`
- Triggers: Student navigates to `/assess/session-uuid`
- Responsibilities:
- Location: `frontend/app/instructor/assessment/new/page.tsx`
- Triggers: Instructor clicks "Create Assessment"
- Responsibilities:
## Error Handling
- Compiler: JSON parse errors logged, empty return fallback
- LLM service: API errors bubble up, caught in routes
- Database: SQLAlchemy exceptions caught, HTTPException(404/400) returned
- Pipeline: Frame errors logged via FrameLogger processor, task cancellation on disconnect
## Cross-Cutting Concerns
- Framework: loguru
- Pattern: `logger.info()`, `logger.error()`, `logger.debug()` throughout
- Key logs: Session start/end, phase transitions, evaluation calls, frame events
- Frontend: Form validation (learning outcomes not empty, title required)
- Backend API: Pydantic models (CreateAssessmentRequest, UpdateRubricRequest)
- Pipeline: LLM output validation (JSON parsing with fallback)
- Magic link flow: Request email → generate token → verify token → issue JWT
- Session-based: JWT stored in cookie/localStorage, passed in API headers
- Pipeline: No auth needed (sessions spawned only from authenticated API endpoint)
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

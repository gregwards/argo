# Aver: Technical Specification Recommendations

**Companion to:** MVP Requirements Specification
**Purpose:** Recommendations for the 10 blocking technical decisions, with rationale and alternatives noted. Intended to be reviewed, challenged, and locked down before spec-writing begins.

---

## Decision 2: LLM Provider and Model Selection

**Recommendation: Multi-model strategy — different models for different roles.**

The three processing stages have fundamentally different requirements:

| Role | Needs | Recommended Model | Rationale |
|------|-------|-------------------|-----------|
| **Conversational agent** (runtime) | Fast (sub-800ms TTFT), good at natural conversation, follows structured instructions, affordable at volume | **Gemini 2.5 Flash** | 250 tok/s throughput, ~250ms TTFT, $0.15/$0.60 per million tokens. At 10,000 sessions/month (avg 30 turns, ~500 tokens per turn), estimated LLM cost: ~$90/month. Closest competitor GPT-4o mini is comparable on price but slower (~62 tok/s). Claude Haiku 4.5 is higher quality but 5x more expensive on input and 6.7x on output. For a latency-critical voice pipeline where the LLM is ~70% of total latency, speed wins. |
| **Session plan compiler** (pre-session) | Strong reasoning about domain structure, rubric interpretation, question generation. Latency irrelevant. | **Claude Sonnet 4.6** or **GPT-4.1** | This is the "smart" call — it generates the entire assessment structure from the instructor's materials. Quality matters more than speed. Run once per assessment configuration and cache. Cost per compilation is negligible. Claude Sonnet is the stronger pick for instruction-following and structured output consistency. |
| **Profiler** (post-session) | Thorough analysis of transcript against rubric, narrative generation, specific finding extraction. Latency irrelevant. | **Claude Sonnet 4.6** | Same reasoning as the compiler. The profiler generates the competency profile narrative, which needs to read like a precise diagnostic. Claude's writing quality and instruction-following suit this well. |

**Multi-provider from day one?** Yes, but minimally. Use Gemini for runtime, Anthropic for compilation and profiling. This gives you resilience (neither provider is a single point of failure for the full product) and cost optimization. Abstract the LLM calls behind a thin interface so you can swap models without changing application code. Don't use an orchestration framework like LangChain for this — the abstraction layer should be a simple adapter pattern in your own code. LangChain adds dependency weight without meaningful value for this use case.

**Risk:** Gemini 2.5 Flash's instruction-following for the structured evaluation block output (JSON) needs to be validated. If it doesn't reliably produce the evaluation block format, you may need to fall back to GPT-4o mini or Claude Haiku 4.5 for the conversational agent. Build the adapter so this swap is a config change.

---

## Decision 3: Real-Time Communication Architecture

**Recommendation: Pipecat framework with WebRTC transport via Daily.**

**Why Pipecat:**

Pipecat is an open-source Python framework for real-time voice AI pipelines, created by Daily.co. It's the most mature framework for exactly what we're building:

- **Pipeline architecture:** Audio flows through a configurable pipeline — STT → processing → LLM → processing → TTS. This is exactly where the rules engine and ephemeral domain window injection need to live. Pipecat's pipeline model lets you insert custom processing nodes between any stage.
- **Structured conversations:** Pipecat Flows supports defined conversational states and transitions — directly applicable to our session plan navigation.
- **Provider-agnostic:** Supports 40+ AI services as plugins. Swap STT, LLM, or TTS providers without rewriting the pipeline.
- **Client SDKs:** JavaScript, React, React Native, iOS, Android. The React SDK covers our MVP frontend needs and provides future mobile extensibility.
- **Turn-taking:** Built-in endpointing, interruption handling, and silence detection — the exact problems the NYU paper identified as critical.
- **Production deployment:** Pipecat Cloud offers managed hosting, but you can also self-host. Start with self-hosted for control, evaluate Pipecat Cloud for scaling later.

**Why WebRTC (via Daily) over WebSocket:**

- WebRTC uses UDP — lost packets cause a tiny audio glitch rather than a stream stall. For a 15-minute conversation, this matters.
- Browser handles audio capture, Opus encoding, echo cancellation, and noise reduction natively. Less client-side code.
- Future-proof for video (if you ever add webcam recording for proctoring or session recording).
- Daily (Pipecat's parent company) provides the WebRTC infrastructure as a service, handling TURN servers, NAT traversal, and scaling. You don't build WebRTC infrastructure — you use theirs.

**Architecture flow:**

```
Browser (React + Pipecat JS SDK)
  ↕ WebRTC audio (via Daily)
Server (Pipecat pipeline in Python)
  ├── STT node (Deepgram)
  ├── Rules Engine node (custom) ← ephemeral window injection, state management
  ├── LLM node (Gemini 2.5 Flash)
  ├── Output Validation node (custom) ← reject multi-question turns, filter evaluative language
  └── TTS node (ElevenLabs or Deepgram)
```

The critical insight: Pipecat's pipeline architecture means the rules engine is a processing node in the audio pipeline, not a separate service. It intercepts between STT and LLM to inject the domain window, and between LLM and TTS to validate the output. This is exactly the architectural seam we need for the ephemeral domain window pattern.

**Alternative considered:** LiveKit Agents is the other mature framework. It's more infrastructure-oriented (you run your own media server), which gives more control but more ops burden. For MVP with one developer, Pipecat + Daily is less infrastructure to manage.

---

## Decision 4: Rules Engine Implementation

**Recommendation: In-process Python module within the Pipecat pipeline, not a separate service.**

The rules engine is not complex enough to justify a separate service at MVP. It's a state machine with these responsibilities:

1. **Parse the agent's evaluation block** (JSON output preceding the utterance)
2. **Update competency state and belief model** (structured data operations)
3. **Select next node** from session plan (graph traversal with conditional edges)
4. **Swap domain windows** (strip current, inject next)
5. **Validate agent output** (pattern matching: reject if >1 question mark, reject if contains evaluative phrases like "great job," "well done")
6. **Log everything** (write to session log)

Each of these is a straightforward function. Total execution time should be <10ms per turn. The rules engine runs as a custom Pipecat processor node — it receives the transcript of the current turn, runs the state machine, and passes the updated context to the LLM node.

**Data structures the rules engine holds per session:**

```python
class SessionState:
    session_plan: SessionPlan          # Pre-compiled, loaded at session start
    current_node_id: str               # Which question node we're on
    competency_state: CompetencyState  # Scores, gaps, trajectories
    belief_model: dict                 # Per-concept learner understanding
    transcript: list[Turn]             # Full transcript
    turn_count: int
    phase: int                         # Current session phase (1-5)
    escalation_flags: list             # Pre-planned cross-reference turns
```

This state lives in memory for the duration of the session (~15 minutes). At session end, it's serialized and persisted to the database. For MVP with <100 concurrent sessions, in-memory state on a single server is fine. At scale, this moves to Redis with session affinity.

**What the rules engine explicitly does NOT do:**
- No LLM calls (all reasoning is pre-compiled in the session plan or handled by the agent)
- No network calls (all data is in memory)
- No complex NLP (pattern matching only, no semantic analysis)

Keep it dumb and fast. The intelligence lives in the session plan (compiled by a smart model) and the conversational agent (running in real-time). The rules engine is the plumbing.

---

## Decision 5: Session Plan Data Structure

**Recommendation: JSON graph with question nodes, conditional edges, and embedded domain packets.**

```python
@dataclass
class QuestionNode:
    id: str
    learning_outcome_id: str
    phase: int                          # 1-5
    difficulty_level: int               # 1-5
    question_type: str                  # From taxonomy: "teach_back", "mechanism", etc.
    question_instructions: str          # Natural language instructions for the agent
    sample_questions: list[str]         # Examples (agent may use or rephrase)
    domain_packet: str                  # Scoped domain knowledge for this node
    rubric_descriptors: list[str]       # What the agent evaluates against
    follow_up_logic: list[FollowUpRule] # Conditional rules for next action
    cross_reference_inject: list[str]   # Node IDs whose packets to re-inject (pre-planned escalation)

@dataclass
class FollowUpRule:
    condition: str          # e.g., "descriptors_hit >= 3"
    action: str             # e.g., "scale_up", "precision_push", "scaffold", "move_on"
    target_node_id: str     # Which node to go to (if moving)
    follow_up_type: str     # From taxonomy: "specificity_probe", "boundary_test", etc.
    instruction: str        # Natural language instruction for the agent

@dataclass
class SessionPlan:
    id: str
    assessment_id: str
    scaffold_type: str
    learning_outcomes: list[LearningOutcome]
    nodes: dict[str, QuestionNode]       # node_id -> QuestionNode
    start_node_id: str
    phase_transitions: list[PhaseTransition]
    duration_target_minutes: int
    metadata: dict                        # Instructor config, source material refs
```

**Domain packet sizing:** Target 200–400 tokens per node. This is a few sentences of scoped domain knowledge — enough for the agent to evaluate a response against rubric descriptors, but not a full lecture. The full session plan for a 5-LO, 15-minute assessment might have 15–20 nodes, totaling 3,000–8,000 tokens of domain content. Only one node's packet (200–400 tokens) is in the agent's context at any time.

**Storage:** Session plans are stored as JSON in Postgres (JSONB column). Loaded into memory at session start. Cached in application memory if multiple students take the same assessment concurrently.

---

## Decision 6: Database and State Management

**Recommendation: Postgres + S3. Redis deferred to scaling phase.**

| Data | Storage | Rationale |
|------|---------|-----------|
| Assessment configurations | Postgres | Structured, queryable, versioned |
| Session plans | Postgres (JSONB) | Loaded once at session start, cached in app memory |
| Active session state | In-process memory | <100 concurrent sessions at MVP. Serialized to Postgres at session end. |
| Completed session data (transcripts, competency state, belief models, evaluation blocks) | Postgres | Structured, needs to support instructor dashboard queries |
| Competency profiles | Postgres | Queryable for aggregation and instructor views |
| Session recordings (audio) | S3 (or equivalent object storage) | Large binary files, lifecycle management, cost-effective |
| User accounts and course structure | Postgres | Standard relational data |

**Schema design principle:** Design tables to be extensible. Use JSONB columns for the belief model, competency state, and evaluation blocks — these will evolve as you iterate on the assessment logic. Keep structured foreign keys for the relationships (user → course → assessment → session → profile) but don't over-normalize the assessment-specific data.

**When to add Redis:** When you need >1 server for session execution (session state needs to be shared across processes) or when session plan caching needs to be shared across server instances. This is a scaling milestone, not an MVP requirement.

---

## Decision 7: Frontend Architecture

**Recommendation: Next.js (React) single application with route-based separation between student and instructor experiences.**

Two distinct UIs, one codebase:

**Student experience:**
- Pre-session: Landing page with assessment info, microphone permission check, "Begin Assessment" button
- During session: Minimal UI — audio waveform visualization, elapsed time, current phase indicator (subtle), "End Session" button. The voice is the interface. Don't over-design this screen.
- Post-session: Competency profile view, transcript viewer, recording playback

**Instructor experience:**
- Assessment configuration: The rubric review surface (Section 3 of requirements). This is the most complex UI — editable learning outcomes, coverage summary, rubric table with progressive disclosure, publish button.
- Dashboard: Assessment list, per-assessment aggregate results (score distributions, topic performance breakdown), student list with drill-down
- Session review: Individual student profile, transcript viewer with playback sync, flagging controls

**Voice integration:** Pipecat provides a React SDK (`pipecat-react`) with hooks for managing the WebRTC connection, audio state, and transcript. This handles the complex real-time audio plumbing. Your component layer sits on top.

**Styling:** Tailwind CSS. Fast to iterate, no component library lock-in. The instructor configuration surface needs to look professional and trustworthy — clean typography, clear hierarchy, nothing flashy. The student session UI needs to be calm and minimal.

**Alternative considered:** Separate apps (student SPA, instructor SPA). Unnecessary complexity for MVP. Route-based separation within Next.js gives you clean code organization without deployment overhead. Split later if needed.

---

## Decision 8: Authentication and Multi-Tenancy

**Recommendation: Email magic links for MVP. Instructor-scoped tenancy.**

**Authentication:**
- Instructors: Email + password (or magic link). Account creation is self-service.
- Students: Magic link sent by instructor (or generated when they access an assessment link). No password required for MVP — the assessment link itself can include a token that creates a session-scoped identity. Students who want persistent access to their profiles create an account.

**Why not SSO at MVP:** SSO (SAML/OIDC) is an institutional requirement, not a user requirement. It matters for procurement at scale. For initial validation with individual professors (your likely first users), email auth is sufficient and dramatically simpler to build. Plan the data model to support SSO later — user accounts should have a `provider` field and external ID mapping.

**Tenancy model:** Instructor-scoped. Each instructor owns their courses and assessments. Students are associated with assessments (many-to-many — a student can take multiple assessments, an assessment has multiple students). No institution-level tenancy at MVP.

**Data model implication:**
```
Instructor (1) → Course (many) → Assessment (many) → Session (many) → Profile (1 per session)
                                                    ↗
Student (1) → AssessmentEnrollment (many) --------/
```

**When to add institution-level tenancy:** When you sell to a department or institution rather than individual professors. This is a V2 concern that affects data isolation, admin roles, and billing — not the core assessment engine.

---

## Decision 9: Assessment Configuration Workflow Implementation

**Recommendation: Ship the full rubric review surface for MVP. Defer progressive disclosure Level 3 and the coverage summary regeneration.**

The configuration workflow from Section 3 of the requirements has three levels of sophistication:

| Component | MVP Priority | Rationale |
|-----------|-------------|-----------|
| Learning outcome extraction/synthesis from uploaded materials | **Must have** | This is the core value prop of the configuration surface. Without it, the professor is manually typing everything. |
| Editable LO list with provenance tags | **Must have** | Professors need to see what the AI extracted and correct it. |
| Coverage summary (natural language per-LO descriptions) | **Must have** | This is what tells the professor "here's what your assessment will do." Without it, the rubric alone is too abstract. |
| Gap indicator | **Must have** | Proactive honesty about coverage gaps is a major trust builder. |
| Rubric table with 4 performance levels, editable | **Must have** | The primary review and editing surface. |
| Progressive disclosure Level 2 (sample questions, adaptive approach) | **Should have** | Gives professors who want to go deeper the ability to inspect. Can be simplified to a "Show sample questions" toggle per LO row. |
| Progressive disclosure Level 3 (rubric descriptors) | **Defer** | Only power users need this. The descriptors are generated from the rubric anyway — showing them is a transparency feature, not a functional one. |
| Regeneration on edit (editing an LO regenerates its rubric row) | **Should have, simplified** | Full regeneration on every keystroke is expensive and distracting. Instead: "Regenerate" button per LO row that the professor clicks after editing. |
| Scaffold type selection with plain-language descriptions | **Must have** | Two options with clear descriptions. Simple dropdown or toggle. |
| Additional instructions free-text field | **Must have** | Low-effort, high-value — lets the professor steer without editing the rubric. |

**Build order:** LO extraction → rubric generation → review surface (LOs + rubric table + coverage summary + gap indicator) → publish flow → progressive disclosure Level 2. This lets you demo the configuration workflow early and iterate on the rubric generation quality before building the editing refinements.

---

## Decision 10: Deployment and Infrastructure

**Recommendation: Single VPS with Docker Compose for MVP. Migrate to container orchestration at scaling milestone.**

**MVP deployment:**

- **Server:** A single beefy VPS (8+ cores, 32GB RAM). The Pipecat pipeline, rules engine, Next.js server, and Postgres all run here via Docker Compose. S3 for recordings is the one external service.
- **Why not serverless:** Active voice sessions are stateful (15 minutes of continuous state in memory) and latency-sensitive. Serverless cold starts and stateless execution are a poor fit. The Pipecat pipeline needs a persistent process for each active session.
- **Why not Kubernetes at MVP:** You're one developer. K8s is ops overhead that doesn't pay off until you have scaling problems. Docker Compose gives you containerization (reproducible deployments, clean service boundaries) without orchestration complexity.

**External services at MVP:**
- **Daily.co:** WebRTC infrastructure (free tier supports development; pay-as-you-go for production)
- **Deepgram:** STT (pay-per-minute, ~$0.45/hr streaming)
- **ElevenLabs or Deepgram:** TTS (evaluate both; Deepgram is faster, ElevenLabs sounds better)
- **Google AI / Anthropic API:** LLM inference (pay-per-token)
- **S3-compatible storage:** Recordings (AWS S3, Cloudflare R2, or Backblaze B2 for cost)

**Scaling path:**
1. **First bottleneck (~50-100 concurrent sessions):** LLM API rate limits and server CPU from running multiple Pipecat pipelines. Solution: move to multiple server instances behind a load balancer with session affinity. Add Redis for shared session state.
2. **Second bottleneck (~500+ concurrent sessions):** Need container orchestration. Migrate Docker Compose to a managed container service (AWS ECS, Railway, or Fly.io). Each active session runs as a container process.
3. **Third bottleneck (~5,000+ concurrent sessions):** Evaluate Pipecat Cloud for managed pipeline hosting. Consider dedicated LLM inference (provisioned throughput from Anthropic/Google) rather than shared API endpoints.

**Cost estimate at MVP scale (100 sessions/month):**

| Component | Monthly Cost |
|-----------|-------------|
| VPS (8-core, 32GB) | ~$50-80 |
| Daily.co WebRTC | ~$20-50 |
| Deepgram STT (25 hrs audio) | ~$12 |
| TTS (25 hrs audio) | ~$15-30 |
| LLM - runtime agent (Gemini Flash) | ~$9 |
| LLM - session plan compilation (Claude Sonnet) | ~$5 |
| LLM - profiler (Claude Sonnet) | ~$10 |
| S3 storage | ~$2 |
| **Total** | **~$125-200/month** |

At 1,000 sessions/month, this scales roughly linearly on the per-session costs (STT, TTS, LLM) while the fixed costs (VPS, Daily) increase modestly. The $0.42/student marginal cost from the NYU paper is a reasonable target — our architecture is more complex (rules engine, ephemeral windows) but also uses a cheaper runtime model.

---

## Summary: The Stack

```
┌─────────────────────────────────────────────────┐
│  FRONTEND                                       │
│  Next.js (React) + Tailwind CSS                 │
│  Pipecat React SDK for voice sessions           │
│  Auth: email magic links                        │
└────────────────────┬────────────────────────────┘
                     │ WebRTC (Daily) for voice
                     │ HTTPS for everything else
┌────────────────────┴────────────────────────────┐
│  BACKEND                                        │
│  Python (Pipecat framework)                     │
│                                                 │
│  Voice Pipeline:                                │
│    Deepgram STT → Rules Engine → Gemini Flash   │
│    → Output Validator → TTS                     │
│                                                 │
│  Pre-Session:                                   │
│    Claude Sonnet (session plan compilation)      │
│                                                 │
│  Post-Session:                                  │
│    Claude Sonnet (profiler)                      │
│                                                 │
│  API Layer:                                     │
│    FastAPI or Next.js API routes                 │
│    (assessment config, dashboard, auth)          │
│                                                 │
│  Data:                                          │
│    Postgres (structured data, session plans)     │
│    S3 (recordings)                              │
│    In-memory (active session state)             │
└─────────────────────────────────────────────────┘
```

**One architectural note:** The backend has two runtime modes. The Pipecat voice pipeline runs as persistent Python processes (one per active session). The API layer (assessment configuration, dashboard queries, auth) runs as standard request/response. These can be the same server process at MVP but should be separate containers at scale — the voice pipeline is CPU-intensive and stateful; the API layer is lightweight and stateless.

---

## Recommended Build Sequence

| Phase | What | Why First |
|-------|------|-----------|
| 1 | Pipecat pipeline with Deepgram STT + Gemini Flash + TTS, hardcoded questions, no rules engine | Prove the voice loop works end-to-end. Get the latency right. |
| 2 | Rules engine node in the pipeline — domain window injection, evaluation block parsing, node traversal | Prove the ephemeral window architecture works in practice. |
| 3 | Session plan compiler (Claude Sonnet) — from hardcoded topic input to compiled plan | Prove that AI-generated session plans produce good conversations. |
| 4 | Instructor configuration workflow — LO extraction, rubric generation, review surface | Prove that professors can configure assessments and trust the output. |
| 5 | Post-session profiler — competency profile from transcript + competency state | Prove the output artifact is valuable. |
| 6 | Student and instructor auth, session persistence, dashboard | Production readiness. |
| 7 | Recording, transcript storage, playback | The verification layer. |

Phase 1 is the highest-risk work. If the voice loop doesn't feel natural, nothing else matters. Get there fast, test it yourself, and iterate on latency and turn-taking before building the assessment logic on top.

# Aver — Design Context for Development

*This document captures the key design decisions and their rationale. Read this before making architectural changes. The exemplar conversations in `/docs/exemplar-conversations.md` illustrate the question taxonomy and conversation patterns — use them as reference for the AI's conversational register, but don't treat them as fixed scripts. The actual conversations will be generated dynamically from session plans.*

---

## What We're Building

An AI-powered oral assessment platform for education. Instructors define learning outcomes, the system generates an assessment plan, and students have a 10–20 minute voice conversation with an AI assessor. The AI adapts in real time — probing understanding, following up based on responses, and producing a competency profile at the end.

## Architecture Decisions and Why

### Voice Pipeline: Pipecat + SmallWebRTCTransport

**Decision:** Use Pipecat (open-source Python framework) with SmallWebRTCTransport (self-hosted, peer-to-peer WebRTC). No Daily.co at MVP.

**Why:** SmallWebRTC gives us WebRTC audio quality (UDP, browser-native echo cancellation) at zero transport cost. Daily.co adds $0.30–0.60/session for infrastructure we don't need until we add server-side video recording. Pipecat's transport abstraction means the pipeline code is identical — swapping to DailyTransport for V2 video recording is a config change, not a rewrite.

**Audio recording without Daily:** The server receives all audio for STT processing — capture raw audio frames in the pipeline and save to S3 at session end. This is server-side recording (student doesn't control it) without a third-party recording service.

### Ephemeral Domain Window (Security Model)

**Decision:** The conversational agent only sees one question node's domain knowledge at a time. After each turn, the previous domain packet is stripped and the next one is injected. Domain knowledge is never persistent in the agent's context.

**Why:** The agent needs domain knowledge to evaluate responses, but must not leak that knowledge to the student. Behavioral guardrails (prompt instructions) are insufficient — the NYU oral assessment paper (2026) and OWASP LLM Top 10 both conclude that prompts cannot be treated as security controls. Our approach is structural: the agent literally doesn't have knowledge it hasn't been given for the current question. Jailbreaking yields only the current node's rubric fragment.

**Implementation:** The rules engine rebuilds the LLM system prompt every turn with only the current node's domain packet and rubric descriptors. The ContextManager handles node transitions and domain window swapping. Pre-planned cross-reference injection (for contradiction probes) is handled by explicitly flagging nodes in the session plan that should receive a previous node's packet — this is logged and auditable.

### Function Calls for Evaluation (Not Structured XML)

**Decision:** The LLM calls an `evaluate_response()` function alongside its text response, rather than producing `<evaluation>` XML blocks.

**Why:** We initially designed for structured XML output (`<evaluation>{JSON}</evaluation><utterance>{text}</utterance>`). Research into Pipecat Flows revealed that function calls are natively supported by Gemini, structurally validated by the model, and dramatically more reliable than asking an LLM to produce well-formed XML on every turn. The function call parameters are typed and schema-validated — they either match or they don't. The text response flows to the student; the function call routes to the rules engine. Clean separation without fragile parsing.

**Schema:** See `pipeline/evaluation_schema.py`. The LLM calls `evaluate_response(descriptor_matches, response_quality, belief_update, next_action, ...)` on every turn.

### Learner Belief Model (Cross-Turn Intelligence)

**Decision:** A structured per-concept record of the learner's demonstrated understanding persists across all turns in the agent's context. It describes the learner, not the domain.

**Why:** The ephemeral domain window strips domain knowledge between turns, which limits cross-turn reasoning (contradiction probes, synthesis evaluation). The belief model solves this by carrying forward *what the learner has demonstrated* rather than *what the correct answers are*. The agent can detect when a student's current statement conflicts with their previously demonstrated understanding without needing the domain context for the earlier question.

**Security property:** Contains learner claims and assessed gaps, not domain answers. A jailbreak exposing the belief model reveals what the student said and how they were assessed — which is already in the transcript.

### Multi-Model Strategy

**Decision:** Gemini 2.5 Flash for the real-time conversational agent. Claude Sonnet 4.6 for session plan compilation and competency profile generation.

**Why:** The conversational agent is latency-critical (~70% of total turn latency is LLM inference). Gemini Flash at 250 tok/s and $0.15/M input tokens is the best speed/cost option. The compiler and profiler are quality-critical but latency-irrelevant (they run pre/post-session). Claude Sonnet's instruction-following and writing quality suit these tasks. Total LLM cost: ~$0.16/session.

**Model strings:** `gemini-2.5-flash` (Pipecat GoogleLLMService), `claude-sonnet-4-6` (Anthropic AsyncAnthropic SDK).

### No TTS at MVP

**Decision:** AI responses displayed as text in the browser. No text-to-speech.

**Why:** Simplifies the pipeline, reduces latency, reduces cost, and supports a potential security measure (harder for a student to run a secondary AI agent if the assessment output is text, not audio). When TTS is added later (Deepgram Aura), it's a single pipeline node insertion with no other changes.

### Pipecat Flows — Evaluated and Rejected

**Decision:** Build a custom rules engine rather than using Pipecat's official `pipecat-ai-flows` library.

**Why:** Pipecat Flows offers node-based conversation state management, which maps well to our session plan. However, its context management strategies (APPEND, RESET, RESET_WITH_SUMMARY) don't support our ephemeral domain window. APPEND accumulates domain packets from all previous nodes (breaking the security model). RESET loses the transcript. There's no hook for custom strategies. Working around this means bypassing Flows' context management entirely, at which point the framework adds complexity rather than removing it. Our rules engine is ~150 lines of focused code.

**What we adopted from Flows:** The function-call approach for evaluation (the key insight from studying the framework).

### Session Plan Compilation

**Decision:** An evaluator agent (Claude Sonnet) compiles a full session plan before the student connects. The plan is a JSON graph of question nodes with domain packets, rubric descriptors, follow-up logic, and phase transitions. The runtime agent navigates this plan — it doesn't generate the assessment structure.

**Why:** Pre-computation moves the "smart" reasoning out of the latency-critical runtime path. The runtime agent focuses on two things: understanding natural language and producing natural language. All structural decisions (what to ask, in what order, how to scale difficulty) are pre-computed by a more capable model with unlimited time.

### Instructor Configuration: LOs First, Then Generate

**Decision:** MVP flow is manual LO entry → scaffold type selection → system generates rubric and session plan → instructor reviews rubric → publishes. No file upload or LO extraction from syllabi.

**Why:** Simplest path to a working product. File upload + LO extraction is a V2 feature. The critical trust surface is the rubric review — the instructor sees exactly what will be assessed and at what levels. The rubric speaks their language (learning outcomes and performance levels), not the system's language (phases, question types, nodes).

## Question Type Taxonomy

The AI assessor has a defined vocabulary of moves:

**Root questions** (open a line of inquiry): teach-back, mechanism, compare/distinguish, scenario-based, personal experience bridge, debate/position, judgment call, synthesis, predict, evaluate.

**Follow-ups** (respond to what the learner said): causal interrogation, specificity probe, counterfactual challenge, extension, redirect/reframe, boundary test, assumption surfacing, contradiction probe, precision push, steelman/devil's advocate, scaffold.

**Structural moves** (conversation management): signpost, reflect-back, neutral wait prompt, redirect from tangent, acknowledge and accelerate, park and move on.

**Scaffold types** (govern the session arc):
- **Competency Map** (MVP): Progressive complexity, find the ceiling, produce a scored profile.
- **Socratic Exploration** (MVP): Guided discovery, more educational, scaffold when stuck, produce a learning profile.
- Thesis Defense, Rapid Verification, Reflective Interview: future.

## Edge Cases the AI Must Handle

- **Confident but surface-level:** Fluent language hiding shallow understanding. Deploy specificity probes — surface knowledge collapses under concrete examples.
- **Anxious expert:** Knows the material but hedges/freezes. Use reflect-back: "You said [accurate thing]. That's right."
- **Silent pause:** 8s → "Take your time." 15s → reframe. 25s → move on.
- **Tangent:** Let them finish, then redirect.
- **"I don't know":** Distinguish knowledge gap from fear. "Give me your best guess." If still stuck, move on.
- **Overachiever:** Acknowledge and accelerate. Skip to higher difficulty.
- **Extraction attempt:** Agent structurally lacks knowledge to comply. Redirect: "I want to hear your thinking first."

## Session Close Rules

No performance commentary from the AI. No "great job" or "you did well." The profile is the feedback. Adding compliments undermines assessment credibility.

## Scaling Considerations

- Session plans cached per assessment config (compiled once, used by all students)
- Active session state in-memory at MVP; Redis when >1 server needed
- Each active session = one Pipecat pipeline process
- First scaling bottleneck (~50-100 concurrent): LLM rate limits + server CPU → add servers with session affinity
- Database: PostgreSQL with JSONB for flexible schema evolution
- Recordings: S3-compatible object storage

## Cost Per Session: ~$0.30

| Component | Cost |
|-----------|------|
| Gemini Flash (runtime, 30 turns) | $0.05 |
| Claude Sonnet (profiler) | $0.10 |
| Claude Sonnet (compiler, amortized) | $0.01 |
| Deepgram STT (15 min) | $0.12 |
| S3 storage | $0.02 |
| Transport (SmallWebRTC) | $0.00 |

## What NOT to Build Yet

- TTS (add Deepgram Aura later as a pipeline node)
- File upload / LO extraction from syllabi
- Multi-session portfolios
- LMS integration (Canvas, Moodle, Blackboard)
- Employer-facing features
- Mobile apps
- Server-side video recording (swap to DailyTransport when needed)
- Micro-burst cross-turn evaluation
- Contradiction graph pre-computation
- Multi-model grading council for profiling

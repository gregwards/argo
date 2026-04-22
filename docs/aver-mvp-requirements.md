# Aver: MVP Requirements Specification

**Version:** 0.1 — Draft
**Date:** April 2026
**Status:** Internal — Not for distribution
**Companion document:** Exemplar Conversations (annotated transcripts illustrating taxonomy and scaffold types)

---

## 1. Product Overview

### 1.1 What Aver Is

Aver is a voice-based dynamic oral assessment platform for education. A professor creates an assessment by providing a topic scope and optional source materials. Students complete a 10–20 minute voice conversation with an AI assessor that adapts in real time — probing understanding, surfacing reasoning gaps, and following up based on the student's actual responses. When the session ends, the student receives a competency profile alongside a recorded session and full transcript. The professor sees aggregate results with the ability to review any individual recording.

### 1.2 Why It Matters

The relationship between what someone writes and what someone understands has structurally broken. 89% of students use AI for coursework. Professional bodies are abandoning remote written exams. Faculty across institutions report students producing excellent written work who cannot explain their own reasoning when asked. Oral assessment is more valid than written exams — structured oral formats achieve Cronbach's alpha of 0.75–0.80 — but has never scaled due to the cost of human time. AI removes that cost. The technology exists, the research is strong, and no product ties them together.

### 1.3 MVP Goal

Ship a working product that allows a professor to assign an adaptive oral assessment to students in a single course, producing verified competency profiles. Validate with real users. Begin accumulating assessment data and validity evidence.

### 1.4 MVP Scope Boundaries

**In scope for MVP:**
- Instructor-facing assessment configuration and review workflow (learning outcome extraction, rubric generation, gap analysis, and review surface)
- Single-session oral assessment (10–20 minutes)
- Two scaffold types: Competency Map and Socratic Exploration
- Domain-agnostic question generation from instructor-provided topic scope and optional source materials
- Adaptive follow-up based on learner responses
- Competency profile output per session
- Session recording and full transcript
- Instructor dashboard with aggregate results and individual session review
- Student-facing session history and profile access

**Out of scope for MVP (see Section 13 for future roadmap):**
- Assessment confidence sandbox ("try the assessment yourself" for instructors)
- Multi-session portfolio aggregation
- Thesis Defense, Rapid Verification, and Reflective Interview scaffolds
- Micro-burst escalation for cross-turn evaluation
- Contradiction graph pre-computation
- Integration with LMS platforms (Moodle, Canvas, Blackboard)
- Employer-facing features or portable credential system
- Mobile-native application (web-based for MVP)

---

## 2. Users and Roles

### 2.1 Instructor (Assessment Creator)

Creates and configures assessments. Reviews results. The instructor is the buyer in B2B contexts and the primary configuration surface.

**MVP capabilities:**
- Create an account and define a course
- Create an assessment by uploading source materials (syllabus, textbook chapter, lecture notes) and/or manually specifying topic scope
- Review and edit AI-extracted learning outcomes, AI-generated assessment rubric, and coverage analysis via the assessment configuration workflow (see Section 3)
- Select scaffold type (Competency Map or Socratic Exploration) and session duration target (10–20 minute range, default 15)
- Optionally inspect sample questions and adaptive follow-up logic per learning outcome via progressive disclosure
- Publish the assessment and assign to students (via link or course roster)
- View aggregate results across all students in an assessment
- Drill into individual student sessions: competency profile, transcript, recording playback
- Flag sessions for manual review

### 2.2 Student (Assessment Taker)

Completes the oral assessment. Receives their competency profile. The student is the end user whose experience determines product viability.

**MVP capabilities:**
- Receive an assessment link from instructor
- Complete the voice-based assessment session in a web browser
- Receive competency profile immediately after session
- Access session recording and transcript
- View history of completed assessments

### 2.3 System Administrator

Manages platform configuration, monitoring, and support. Not a user-facing role for MVP but required for operations.

---

## 3. Assessment Configuration & Review Workflow

This section describes what happens between "professor uploads materials" and "students receive a link." The configuration workflow is the primary trust-building surface — the professor must be able to see exactly what their students will be assessed on, at what levels, and against what criteria. No black box.

### 3.1 Design Principles

The review surface speaks entirely in the language educators already use: learning outcomes and rubric criteria. The session plan, question type taxonomy, scaffold mechanics, and phase structure are implementation details that the professor should never need to see in order to configure an effective assessment. The AI's job is to translate between the professor's rubric and the system's session plan, and that translation should be invisible.

The target experience: a professor with a clear syllabus goes from upload to publishable assessment in under 15 minutes, including review and edits. The AI does the heavy lifting on generation; the professor steers.

### 3.2 Workflow Steps

The workflow is a single page with three sections, presented after the professor uploads source materials and selects a scaffold type.

#### Step 1: Upload and Configuration Inputs

The professor provides:

- **Source materials (at least one required):** Syllabus, textbook chapters, lecture notes, slide decks, or any course materials. The system extracts learning outcomes, concepts, topic hierarchy, and vocabulary from these materials.
- **Topic scope (alternative to source materials):** If the professor prefers, they can manually specify topics rather than uploading materials. Example: "Supply and demand, price elasticity, market equilibrium — introductory level."
- **Scaffold type:** Competency Map or Socratic Exploration. Presented with plain-language descriptions, not internal names. Competency Map: "Assess the breadth and depth of what students know, producing a detailed competency profile." Socratic Exploration: "Guide students through the material with adaptive questioning, producing a learning profile focused on where they had breakthroughs and where they still need work."
- **Session duration target:** Slider, 10–20 minutes, default 15.
- **Additional instructions (optional):** Free text for anything the professor wants to emphasize or exclude. Example: "Focus heavily on application to real-world scenarios. Don't spend much time on memorized definitions."

The system processes these inputs and generates the review surface.

#### Step 2: Review Surface — Single Page, Three Sections

**Section A: Learning Outcomes (top of page)**

A clean, editable list of learning outcomes. Each is a text field the professor can confirm, edit, reword, delete, or reorder. New outcomes can be added.

Each outcome is tagged with a provenance indicator:
- "From your materials" — extracted verbatim or near-verbatim from the uploaded source materials
- "Suggested by AI" — synthesized by the system from the source content (used when the source materials don't contain explicit learning outcomes)

If the professor uploaded a syllabus with explicit learning outcomes, these are extracted directly and tagged as "from your materials." If the professor uploaded lecture notes without defined learning outcomes, the system synthesizes outcomes from the content and tags them as "suggested by AI."

The professor's task: confirm the list is correct and complete. This should take under 60 seconds for a well-structured syllabus. Adding or editing an outcome triggers regeneration of the rubric row for that outcome.

**Section B: Coverage Summary (middle of page)**

A brief natural-language paragraph per learning outcome describing how it will be assessed. Plain English, no jargon, no references to internal concepts like "phases" or "question types."

Example: "LO1 (Supply and Demand Mechanisms): Students will be asked to explain the causal chain linking demand changes to price changes, then apply this reasoning to a realistic scenario. The assessment will probe whether students can articulate the mechanism, not just state the outcome."

Example: "LO3 (Market Equilibrium): Students will be presented with a scenario involving a policy intervention (such as a price ceiling) and asked to reason through the chain of effects, including unintended consequences."

Below the per-LO descriptions, a **gap indicator**:
- If all learning outcomes have strong assessment coverage: "All learning outcomes are covered by this assessment."
- If gaps exist: "Not currently covered: LO4 (International Trade Effects). Add assessment coverage for this outcome?" with an action button to add a question node for the uncovered LO.
- If coverage is thin: "LO2 (Price Elasticity) has limited coverage. The assessment will include one question at the application level. Add deeper coverage?" with an action to expand.

The coverage summary answers "what will this assessment actually do?" in ~2 minutes of reading. It contextualizes the rubric that follows.

**Section C: Assessment Rubric (bottom of page)**

A table. One row per learning outcome. Four columns representing performance levels:

| | Exceeds Expectations | Meets Expectations | Approaching | Does Not Meet |
|---|---|---|---|---|
| **LO1: Supply & Demand** | Explains the full causal mechanism including equilibrium adjustment, applies it fluently to novel scenarios, and names assumptions unprompted | Explains the directional effect with some mechanism, applies concepts to a scenario with prompting | States that price rises when demand increases but cannot explain why; needs significant scaffolding to connect to scenarios | Cannot explain the relationship or produces a fundamentally incorrect account |

Each cell is directly editable. The professor can rewrite any performance level description. Cells are pre-populated with specific, observable descriptions generated from the source materials — not generic placeholders like "shows understanding."

**Progressive disclosure within each rubric row:**

The rubric row is expandable. Clicking expands progressively:

- **Level 1 (default — always visible):** Learning outcome text + four performance level descriptions. This is the primary review and editing surface.

- **Level 2 (one click to expand):** Sample questions the AI might ask for this learning outcome, grouped by difficulty level. Plus a brief description of the adaptive approach: "If the student demonstrates strong understanding, the AI will probe edge cases and push toward transfer. If the student struggles, the AI will scaffold with concrete examples before moving on." The professor can flag or edit sample questions.

- **Level 3 (another click to expand):** The specific rubric descriptors the AI will use to evaluate student responses (e.g., "mentions equilibrium adjustment mechanism," "connects demand shift to quantity supplied response"). This is the most granular view — the professor can see exactly what the AI is listening for. Most professors will never expand to this level; it exists for those who want to inspect the machine.

#### Step 3: Publish

A single "Publish Assessment" button. Clicking it triggers session plan compilation from the confirmed learning outcomes, rubric, and coverage configuration. The professor receives a confirmation with a shareable link or roster assignment options.

**Edit after publish:** The professor can return to the review surface and edit at any time before students begin taking the assessment. Edits after students have started trigger a new version — previous students retain their original assessment configuration; new students receive the updated version. The system warns the professor about this versioning behavior.

### 3.3 Learning Outcome to Session Plan Translation

The review surface is the professor's interface. Behind it, the system translates the professor's rubric into the session plan that the runtime architecture executes.

**The translation logic:**

- Each learning outcome becomes a **topic cluster** in the session plan — a group of question nodes spanning difficulty levels.
- The performance level descriptions in the rubric become the **rubric descriptors** in the session plan's per-node domain packets. "Explains the full causal mechanism including equilibrium adjustment" becomes the descriptor set that the runtime agent evaluates against.
- The difficulty scaling within each topic cluster is derived from the performance levels: "Does Not Meet" maps to Level 1 questions, "Approaching" to Level 2, "Meets" to Level 3–4, "Exceeds" to Level 4–5.
- The coverage summary's description of assessment approach ("scenario-based problem," "explain the mechanism") maps to question type selection per node.
- The professor's additional instructions modify the session plan's weighting: "focus heavily on application" increases the proportion of scenario-based and judgment call questions; "don't spend much time on definitions" reduces or eliminates teach-back questions at Level 1.

This translation is performed during session plan compilation. The professor never sees the session plan — they see the rubric, and the system ensures the session plan faithfully implements it.

### 3.4 Handling Source Materials Without Explicit Learning Outcomes

Many professors will upload a textbook chapter or lecture slides that don't contain defined learning outcomes. The system must synthesize learning outcomes from the content.

**Synthesis approach:**
- Extract the key concepts, relationships, and skills implied by the source material
- Generate learning outcomes using standard educational taxonomy (Bloom's or equivalent) — ensuring a mix of comprehension, application, and analysis-level outcomes appropriate to the course level
- Tag all synthesized outcomes as "Suggested by AI" so the professor knows to review them carefully
- Present the synthesized outcomes with a brief note: "These learning outcomes were generated from your materials. Please review and edit to ensure they match your course goals."

This is a significant value-add for professors who have content but haven't formalized their learning outcomes — the system does the pedagogical design work that many professors skip.

### 3.5 Future: Assessment Confidence Sandbox (V2)

After the rubric-based review, an optional "Preview the Assessment" section allows the professor to build experiential confidence in how the assessment will work:

- **"Try it yourself"** — The professor takes a 3-minute compressed version of the assessment, experiencing the question flow, adaptive follow-ups, and tone firsthand.
- **"Watch a strong student"** — A pre-generated simulated transcript showing a high-performing student, annotated with which learning outcomes are assessed at each moment.
- **"Watch a struggling student"** — Same, for a student who needs scaffolding, showing how the AI adapts.

The sandbox is entirely optional and does not block publishing. It serves the confidence need ("will this actually work?") that the rubric alone doesn't fully address, particularly for first-time users.

---

## 4. System Architecture

### 4.1 Architectural Principles

The architecture is designed around three principles derived from the research literature and our security analysis:

1. **Structural security over behavioral guardrails.** Domain knowledge isolation is enforced through context management architecture, not through prompt instructions. The OWASP LLM Top 10 (2025) explicitly states that system prompts should never be treated as a security control. The NYU oral assessment paper (Ipeirotis, 2026) found that behavioral constraints fail in practice — agents violate prompt instructions for question stacking, paraphrasing, and randomization. Our architecture makes leakage structurally difficult rather than behaviorally prohibited.

2. **Pre-compute what's predictable; reserve LLM inference for what requires real-time judgment.** Session structure, question selection, rubric criteria, scaling logic, and scaffold transitions are compiled before the session starts. The runtime LLM focuses on the two things it's uniquely good at: understanding natural language and producing natural language.

3. **Design for auditability.** Every assessment decision is logged, every session is recorded, and the competency profile is verifiable against the transcript. The recording is the ultimate trust layer — anyone can inspect what happened.

### 4.2 High-Level Architecture

The system comprises three processing stages: pre-session planning (latency-free), real-time session execution (latency-critical), and post-session profiling (latency-free).

#### Pre-Session: Session Plan Compilation

An evaluator agent with full domain knowledge runs after the instructor publishes the assessment (see Section 3). It receives the instructor's confirmed learning outcomes, assessment rubric, source materials, scaffold configuration, and any additional instructions. It produces a **session plan** — a structured graph of question nodes, each containing:

- Question text (or question generation instructions for the runtime agent)
- Rubric descriptors per node (compressed evaluation criteria, e.g., "mentions equilibrium adjustment mechanism," "connects concept A to concept B")
- Per-node domain packet (scoped domain knowledge relevant only to that question)
- Follow-up decision logic (if descriptors 1+3 hit → scale up; if only 1 → precision push on Y)
- Scaffold transition rules
- Pre-planned cross-reference flags (nodes where the rules engine should re-inject a previous domain packet)

The session plan is the primary artifact that makes the runtime architecture work. It encodes the evaluator's full domain reasoning into a structured format that the runtime agent can navigate without needing full domain access itself.

#### Runtime: Session Execution

A single LLM agent conducts the conversation. Per turn, it operates with:

**Persistent context (present across all turns):**
- System prompt with assessment instructions and question type taxonomy
- Scaffold configuration (Competency Map or Socratic Exploration for MVP)
- Full session transcript
- Running competency state
- Learner belief model (structured per-concept record of learner's demonstrated understanding — see Section 4.4)

**Ephemeral context (injected per turn, stripped after):**
- Current question node's domain packet
- Current node's rubric descriptors and follow-up logic

The agent produces two outputs per turn:
1. A structured evaluation block (JSON: descriptor matches, competency signals, flags, recommended next action)
2. The learner-facing utterance

A **rules engine** (non-LLM, deterministic) processes the evaluation block:
- Updates the competency state and learner belief model
- Selects the next question node from the session plan
- Strips the current domain window
- Injects the next domain window
- Validates the agent's output (rejects multi-question turns, filters evaluative language)
- Logs all decisions

The rules engine, not the LLM, makes structural decisions about session flow. The LLM makes conversational decisions about how to phrase things and how to interpret what the learner said.

#### Post-Session: Competency Profile Generation

A profiler agent runs after the session ends. It receives the full transcript, the complete competency state accumulated across the session, the learner belief model, and the full domain knowledge for the assessed topics. It generates the competency profile (see Section 10). Because it runs post-session, latency is irrelevant, and it can have full domain access without any security implications — it never interacts with the student.

For future consideration (not MVP): a multi-model grading council pattern, as validated by the NYU paper (Krippendorff's α = 0.86 with three-model deliberation), could strengthen grading reliability.

### 4.3 Ephemeral Domain Window — Security Model

The security architecture is based on temporal scoping of domain knowledge. The conversational agent only ever sees one question node's domain packet at a time. After each turn, the previous packet is stripped from context. This means:

- The agent cannot leak answers to questions it hasn't been asked yet (it doesn't have them)
- The agent cannot reveal the full rubric (it only sees the current node's criteria)
- If jailbroken on any given turn, the attacker obtains only the current question's rubric fragment — not the session plan, not other nodes' domain packets, not the answer key
- The security boundary is structural (context management) rather than behavioral (prompt instructions), making it model-version-independent

**Known residual risk:** Rubric descriptors within the ephemeral domain packet are compressed domain knowledge. A descriptor like "mentions equilibrium adjustment mechanism" implicitly reveals part of the correct answer. Mitigation: keep descriptors abstract where possible ("identifies the causal mechanism" rather than naming the specific mechanism), and design the profiler to detect if a learner's performance suspiciously improves on dimensions they were probed on. A pre-launch red-team study should quantify the actual leakage risk from descriptor patterns across a full session.

**Pre-planned escalation:** For specific turns flagged in the session plan as requiring cross-turn domain context (e.g., a planned contradiction probe), the rules engine re-injects a previous node's domain packet alongside the current one. This escalation is pre-planned, logged, and bounded — the agent doesn't request it; the session plan specifies it.

### 4.4 Learner Belief Model

The learner belief model is a structured, per-concept record that persists in the agent's context across all turns. It is updated by the rules engine after each turn, based on the agent's evaluation output. It describes the learner, not the domain.

**Structure per concept:**

```
{
  "concept_name": "price elasticity",
  "understanding_level": "partial",
  "claims": [
    "necessities are inelastic",
    "substitutes increase elasticity"
  ],
  "gaps": [
    "conflated elastic and inelastic labels in one instance, self-corrected"
  ],
  "scaffolding_needed": "light",
  "confidence_signal": "moderate — hedged initially but grew more confident",
  "last_assessed_turn": 4
}
```

**Purpose:** Enables the agent to perform cross-turn reasoning without domain knowledge. The agent can detect when a learner's current statement conflicts with their previously demonstrated understanding, evaluate synthesis questions against the learner's trajectory, and tailor follow-up difficulty and tone to the learner's demonstrated level — all by referencing what the learner has shown, not what the correct answers are.

**Security property:** The belief model contains the learner's claims and assessed gaps, not domain answers. A jailbreak that exposes the belief model reveals what the learner said and how they were assessed, which is already in the transcript.

### 4.5 Scalability Requirements

The system must be designed from the outset to scale to tens of thousands of concurrent users. While migration of specific services is expected as load grows, the architectural foundations should not require rearchitecting.

**Scaling considerations by component:**

- **Session plan compilation (pre-session):** Compute-intensive but not latency-critical. Can be queued and processed asynchronously when instructors create assessments. Plans are cached per assessment configuration — if 200 students take the same assessment, the plan is compiled once. Horizontal scaling via worker pools.

- **Runtime session execution:** The latency-critical path. Each active session requires one LLM inference call per conversational turn, plus rules engine processing. The rules engine is deterministic and lightweight — it scales horizontally with minimal compute. The LLM inference is the bottleneck. Design for: multiple LLM provider support (failover and load balancing), request queuing with priority management, and session affinity (a session stays on the same inference endpoint for context consistency).

- **Voice pipeline (STT/TTS):** Separate from the LLM inference path. STT and TTS services should be independently scalable. Evaluate managed services (ElevenLabs, Deepgram, AssemblyAI) versus self-hosted for cost/latency tradeoffs at scale.

- **Session recording and storage:** Each session produces an audio recording and a text transcript. At 10,000 sessions/month averaging 15 minutes, that's ~2,500 hours of audio. Design for cloud object storage (S3 or equivalent) with lifecycle policies. Transcripts are lightweight text.

- **Post-session profiling:** Asynchronous, not latency-critical. Can be queued. At scale, batch processing becomes viable.

- **Data layer:** Session plans, competency states, belief models, transcripts, profiles, and assessment configurations. Design for a database architecture that separates hot data (active sessions) from warm data (recent results) and cold data (archived sessions). Expect the data model to evolve — use a schema that tolerates extension.

**Target performance characteristics for MVP (to be validated):**

- Session start latency (from student clicking "begin" to first AI utterance): < 3 seconds
- Per-turn response latency (from student finishing speaking to AI beginning to speak): < 1.5 seconds (including STT, LLM inference, rules engine, TTS)
- Concurrent active sessions supported at launch: 50–100
- Session plan compilation time: < 60 seconds per assessment configuration
- Profile generation time: < 30 seconds after session ends

---

## 5. Session Architecture

A complete assessment session runs 10–20 minutes across five phases. The AI manages phase transitions based on the learner's demonstrated competency, not a fixed timer.

| Phase | Purpose | Duration Target | Question Types |
|-------|---------|-----------------|----------------|
| 1. Orientation | Signpost structure, set expectations | 30–60 sec | None (signposting only) |
| 2. Foundation Probe | Assess conceptual understanding via explanation | 3–5 min | Teach-back, Mechanism, Compare |
| 3. Depth Scaling | Find the ceiling of knowledge | 3–4 min | Scaling questions across difficulty levels |
| 4. Applied Reasoning | Test transfer and judgment under ambiguity | 3–5 min | Scenario-based, Judgment call |
| 5. Synthesis & Close | Assess integration, deliver summary | 2–3 min | Synthesis, session close |

Phase transitions are signposted clearly but not mechanically. A brief bridging sentence that names what's coming is the target register: "Good. Now I'm going to increase the difficulty to find where your knowledge tops out." Efficient, transparent, no filler.

### 5.1 Phase 1: Orientation

**Purpose:** Signpost the session structure, set expectations, and get the learner talking. No rapport-building, no small talk. The assessor is direct, efficient, and transparent. That directness is the trust signal.

**Design principles:**
- State the topics, the structure, and the time commitment upfront
- "I care about reasoning, not definitions" — the one framing line worth including because it changes how learners respond to every subsequent question
- "Ready?" is a gate, not rhetorical — if the learner asks a question, answer it, then proceed
- No warm-up question — Phase 2's first teach-back prompt is the warm-up

**State tracked:** `session_started` (timestamp), `learner_questions_before_start`

### 5.2 Phase 2: Foundation Probe

**Purpose:** Assess whether the learner has a coherent mental model of core concepts. Teach-back format ("explain this to me") reveals the structure of understanding, not just the presence of facts.

**Evaluation dimensions:**

| Dimension | Understanding Indicators | Surface Knowledge Indicators |
|-----------|-------------------------|------------------------------|
| Causal reasoning | Explains *why* (mechanism) | States *that* without mechanism |
| Conceptual relationships | Connects related concepts | Treats concepts as isolated |
| Vocabulary precision | Uses terms accurately and naturally | Uses terms as labels without explanatory power |
| Completeness | Addresses both effect and process | Gives only the headline result |

**Adaptive follow-up logic:**

- **Strong explanation (3+ dimensions):** Probe for edge cases, push toward transfer. Goal: find the boundary.
- **Partial explanation (1–2 dimensions):** Scaffold with targeted follow-up. Offer concrete anchor if stuck. Goal: distinguish understanding gap from articulation gap.
- **Significant struggle (0 dimensions):** Reframe rather than drilling down. Try experiential connection. If the learner can explain from experience but not connect to formal framework, note this as a diagnostic finding. Shorten Phase 2 and allocate more time to Phase 4.

**State tracked:** `foundation_score` (1–5 per dimension), `scaffolding_needed` (none/light/heavy), `specific_gaps` (list), `articulation_vs_understanding` (flag)

### 5.3 Phase 3: Depth Scaling

**Purpose:** Find the boundary between what the learner knows and what they don't. Progressive complexity until the learner reaches their limit.

**Scaling levels (domain-specific, generated during session plan compilation):**

| Level | Character |
|-------|-----------|
| 1 | Definitions with context |
| 2 | Application to specific cases |
| 3 | Comparison and reasoning across concepts |
| 4 | Edge cases and nuance |
| 5 | Synthesis requiring integration of multiple concepts |

**Scaling logic:**
- Start at the level matching Phase 2 performance
- Move up when the learner answers clearly with minimal scaffolding
- Move down or stop when the learner hedges, gives incomplete answers, or says they're unsure
- Maximum 3–4 questions in this phase
- If the learner clears Level 5, note it and move on — do not invent difficulty to stump them

**State tracked:** `knowledge_ceiling` (1–5), `scaling_trajectory` (ascending/plateau/descending)

### 5.4 Phase 4: Applied Reasoning

**Purpose:** Test whether the learner can transfer knowledge to novel situations with ambiguity. Highest-signal phase for competency assessment.

**Scenario design principles:**
- Realistic and specific enough to engage reasoning
- No single correct answer — the AI evaluates quality of reasoning, not the conclusion
- Requires the learner to make assumptions explicit

**Evaluation dimensions:**

| Dimension | Strong Signal | Weak Signal |
|-----------|--------------|-------------|
| Transfer | Applies formal concepts to the specific scenario | Restates textbook principles without connecting them |
| Assumption awareness | Names assumptions unprompted | Treats the scenario as having one right answer |
| Reasoning structure | Logical chain: if X then Y because Z | Jumps to conclusion without showing reasoning |
| Nuance tolerance | Acknowledges trade-offs and uncertainty | Forces a definitive answer on an ambiguous problem |

**State tracked:** `transfer_quality` (1–5), `reasoning_structure` (fragmented/linear/branching), `assumption_awareness` (implicit/partially explicit/fully explicit), `scenario_engagement` (resistant/compliant/engaged/creative)

### 5.5 Phase 5: Synthesis & Close

**Purpose:** Give the learner a chance to integrate across the session (both a final assessment data point and a genuinely educational moment), then close cleanly.

**Synthesis question:** "Stepping back from the specifics: what's the single most important idea from [domain] for understanding [broader question]?"

**Evaluation:** Can they step back from specifics? Do they connect ideas from multiple phases? Does their answer reveal intellectual orientation?

**Session close:** "That's the assessment. Your competency profile will be ready shortly." No performance commentary. The profile is the feedback. Compliments undermine credibility — if the AI compliments everyone, compliments are meaningless; if only strong performers, absence becomes a negative signal.

---

## 6. Question Type Taxonomy

The taxonomy defines the vocabulary of moves available to the AI assessor. The session plan and scaffold configuration determine which types are used, in what proportion, and with what adaptive logic.

### 6.1 Root Questions

Root questions open a line of inquiry. They are not responses to what the learner just said.

| Type | Description | Example |
|------|-------------|---------|
| **Teach-back / Define** | "Explain X in your own words" | "Explain what happens when demand increases." |
| **Mechanism** | "Walk me through how X works" — asks for process, not meaning | "Walk me through the mechanism, not just the result." |
| **Compare / Distinguish** | "What's the difference between X and Y?" | "What's the difference between a shift in demand and movement along the curve?" |
| **Scenario-based** | "If X happened, what would follow?" | "If a city imposes a rent ceiling below equilibrium, what happens?" |
| **Personal experience bridge** | "Tell me about a time you saw X in real life" | "Have you ever seen something get more expensive because everyone wanted it?" |
| **Debate / Position** | "Some argue X, others Y — where do you land?" | "Some say the transactional/transformational distinction is outdated. Where do you stand?" |
| **Judgment call** | "What would you do?" — asks for a decision, not analysis | "The shop owner needs to decide. What would you recommend and why?" |
| **Synthesis / Big picture** | "Stepping back, what's the most important idea?" | "What's the single most important concept for understanding how markets work?" |
| **Predict** | "What do you think happens next?" | "What do you think would happen if they raised the price?" |
| **Evaluate** | "Was this a good decision? Why or why not?" | "Looking back, is there anything you'd do differently?" |

### 6.2 Follow-Up Types

Follow-ups are direct responses to what the learner just said. They adapt the conversation based on the quality and content of the learner's answer.

| Type | Description | Example |
|------|-------------|---------|
| **Causal interrogation** | "Why?" / "What causes that?" | "Why would demand for insulin be less elastic?" |
| **Specificity probe** | "Give me a concrete example" | "Can you give me a specific example of what you mean?" |
| **Counterfactual challenge** | "What if X were different?" | "What if the original shop has loyal customers? Does that change the picture?" |
| **Extension** | "Keep going with that" | "You mentioned substitutes. Keep going — what else drives elasticity?" |
| **Redirect / Reframe** | "Let me come at this differently" | "Let's try a different angle. Think about it like this..." |
| **Boundary test** | "Does that apply to Y too?" | "Does that same logic apply to labor markets?" |
| **Assumption surfacing** | "What are you assuming?" | "What are you assuming about the market here that might not be true?" |
| **Contradiction probe** | "Earlier you said X, now you're saying Y" | "You said necessities are inelastic, but now you're saying housing demand is elastic. How do those fit?" |
| **Precision push** | "What exactly do you mean by that?" | "You used the word 'equilibrium.' What's actually true at that point?" |
| **Steelman / Devil's advocate** | "Someone would argue the opposite" | "A critic would say you're risking the brand's most valuable asset. How do you respond?" |
| **Scaffold** | Concrete anchor + retry invitation | "Think about it like currency — you can't stick a sandwich in a vending machine. Now try again." |

### 6.3 Structural Moves

Not questions, but conversational management moves the AI uses to shape the session.

| Type | Description | Example |
|------|-------------|---------|
| **Signpost** | Announces phase transitions | "Good. Now I'm going to shift to a scenario." |
| **Reflect-back** | Mirrors accurate content to build confidence | "You said [X]. That's exactly right." |
| **Neutral wait prompt** | Acknowledges silence without pressure | "Take your time." |
| **Redirect from tangent** | Brings conversation back without dismissing | "Noted. Let me bring us back to the original question." |
| **Acknowledge and accelerate** | Recognizes strength and skips ahead | "You clearly know this well. Let me jump ahead." |
| **Park and move on** | Defers a topic for later | "Let's come back to that. Next question." |

---

## 7. Scaffold Types

Scaffolds govern the arc of the conversation: which question types are used, in what order, and what the adaptive logic prioritizes. The instructor selects a scaffold when configuring an assessment.

### 7.1 Competency Map (MVP)

**Purpose:** "Show me what you know." Progressive complexity to find the ceiling and produce a calibrated profile.

**Arc:** Define → Explain mechanism → Apply → Analyze → Evaluate/Synthesize. The AI scales up until the learner plateaus, then maps the boundary.

**Question type distribution:** Root types skew toward teach-back, mechanism, compare, scenario. Follow-ups are mostly extension, boundary tests, precision push.

**Adaptive logic:** Scale up on demonstrated competence. Scale down or move on when the learner reaches their limit. Goal is an accurate map, not maximum difficulty.

**Output:** Competency map with scores across dimensions, a clear ceiling level, and a narrative assessment.

### 7.2 Socratic Exploration (MVP)

**Purpose:** "Let's think through this together." More educational than evaluative, though it still produces assessment data.

**Arc:** Start with scenario or provocation → "Why do you think that?" → scaffold when stuck → extend when flowing → synthesize at end.

**Question type distribution:** Heavy use of causal interrogation, redirect/reframe, scaffold moves, and personal experience bridge. The AI is more patient, spends more time in follow-up chains, and favors depth on fewer topics over breadth.

**Adaptive logic:** Guide toward insight through questioning. When the learner is stuck, scaffold rather than move on. When the learner is flowing, extend rather than redirect.

**Output:** Learning profile — what the student worked through, where they had breakthroughs, where they still need work. Lighter on scores, heavier on narrative.

### 7.3 Future Scaffold Types (Not MVP)

**Thesis Defense:** Adversarial. Starts from a position the learner has stated and pressure-tests it. Heavy use of counterfactual challenges, contradiction probes, assumption surfacing, and steelman moves. Output: credibility assessment — does this person own this work?

**Rapid Verification:** Short, targeted, pass/fail. 2–3 root questions at a fixed difficulty level with 1–2 confirming follow-ups. No scaling. Output: met/not yet met with recorded evidence.

**Reflective Interview:** Metacognitive. Asks the learner to reflect on their own learning, connect experiences to concepts, and self-assess. Heavy use of personal experience bridge and evaluate types. Output: reflection quality profile.

### 7.4 Mixed Scaffolds (Future)

In V2, a single assessment session should support multiple scaffold sections. For example, a session might begin with a Competency Map section (15 minutes) and conclude with a Reflective Interview section (5 minutes). Scaffold transitions are signposted explicitly within the session. The session plan pre-compiles both sections as a unified graph with a defined transition point.

---

## 8. Edge Case Handling

These are interaction patterns the AI must handle gracefully. Each represents a real pattern that will occur frequently at scale.

### 8.1 Confident but Surface-Level

The learner uses fluent, confident language but strings together terms without real understanding.

**Detection:** Explanation sounds plausible at the surface but breaks down under one specific follow-up. Often uses jargon as labels rather than with explanatory power.

**Response:** Deploy specificity probe: "Can you give me a concrete example of what you mean?" Surface knowledge collapses under specificity. If confirmed, use precision push to find the actual boundary between understanding and pattern-matching.

**Assessment impact:** The belief model should distinguish "articulate but shallow" from "understands deeply." The competency profile should note the discrepancy between verbal fluency and conceptual depth.

### 8.2 Anxious Expert

The learner actually knows the material but freezes, hedges excessively, or undermines their own answers.

**Detection:** Hedged answers contain accurate content. Self-deprecating framing around correct reasoning.

**Response:** Reflect-back: "You said [accurate thing]. That's exactly right. Keep going." Calibrate the competency profile to distinguish performance anxiety from knowledge gaps.

**Assessment impact:** `articulation_vs_understanding` flag in the belief model. The competency profile should note that the learner demonstrated understanding that they couldn't initially articulate with confidence.

### 8.3 Silent Pause

The learner goes quiet for 8+ seconds. Could be thinking, confusion, or disconnection.

**Response sequence:**
- 8 seconds: Neutral wait prompt — "Take your time."
- 15 seconds: Offer reframe — "Let me give you a more specific version of that question."
- 25 seconds: Move to a different question and circle back later.

### 8.4 Tangent

The learner starts answering a different question or goes on a long tangent about a related topic.

**Response:** Let them finish the thought (do not interrupt), then redirect: "Noted. Let me bring us back to [original question]." If the tangent reveals relevant knowledge, note it in the belief model even though it was off-prompt.

### 8.5 "I Don't Know"

The learner says "I don't know" without attempting an answer.

**Response:** Distinguish genuine lack of knowledge from fear of being wrong.
- First attempt: "Give me your best guess. Even a rough intuition is useful data."
- If they still can't engage: "Okay, let's move on." Move to a lower difficulty level or a different question format.
- Log the gap in the belief model. If the learner later demonstrates knowledge on a related topic, cross-reference against the "I don't know" to assess whether it was a knowledge gap or a confidence gap.

### 8.6 Overachiever

The learner gives a graduate-level answer to an introductory question and wants to go deeper.

**Response:** Acknowledge and accelerate: "You clearly have a strong handle on this. Let me jump ahead." Skip to Level 4–5 in the scaling phase. If they hit Level 5 comfortably, note it and move on. Do not invent difficulty to try to stump them.

### 8.7 Extraction Attempt

The learner asks the AI to provide domain information: "Can you remind me what the key factors are?" or "What's the third one again?"

**Response:** The agent lacks the full domain knowledge to comply (structural defense), but should also handle the conversational moment naturally: "I want to hear your thinking first. What factors do you think matter?" Redirect to elicit the learner's own knowledge. Log the attempt in the session data.

---

## 9. State Management

The AI agent tracks the following state across the session. This is the minimum viable state for producing an accurate competency profile.

### 9.1 Session-Level State

| Variable | Set In | Updated In | Used For |
|----------|--------|------------|----------|
| `session_id` | Phase 1 | — | Unique identifier, links to recording and transcript |
| `session_started` | Phase 1 | — | Timing |
| `session_ended` | Phase 5 | — | Timing, duration calculation |
| `scaffold_type` | Pre-session | — | Governs adaptive logic and question type distribution |
| `session_plan_id` | Pre-session | — | Links to compiled session plan |

### 9.2 Learner-Level State

| Variable | Set In | Updated In | Used For |
|----------|--------|------------|----------|
| `vocabulary_level` | Phase 2 | Phases 3–4 | Calibrating question language |
| `confidence_signal` | Phase 2 | All phases | Distinguishing anxiety from ignorance |
| `foundation_score` (per dimension) | Phase 2 | — | Competency map, scaling start level |
| `scaffolding_needed` | Phase 2 | Phases 3–4 | Competency map (explanation ability) |
| `specific_gaps` | Phase 2 | Phases 3–4 | Narrative assessment, growth areas |
| `articulation_vs_understanding` | Phase 2 | — | Profile nuance |
| `knowledge_ceiling` | Phase 3 | — | Competency map (knowledge depth) |
| `scaling_trajectory` | Phase 3 | — | Profile narrative |
| `transfer_quality` | Phase 4 | — | Competency map (applied reasoning) |
| `reasoning_structure` | Phase 4 | — | Profile narrative |
| `assumption_awareness` | Phase 4 | — | Profile narrative, strengths |
| `scenario_engagement` | Phase 4 | — | Experience quality signal |

### 9.3 Cross-Turn State

| Variable | Set In | Updated In | Used For |
|----------|--------|------------|----------|
| `learner_belief_model` | Phase 2 | All phases | Cross-turn reasoning, synthesis evaluation, trajectory |
| `key_moments` | All phases | All phases | Profile findings, specific evidence |
| `session_transcript` | All phases | All phases | Verification artifact, profiler input |
| `extraction_attempts` | All phases | All phases | Security monitoring, experience quality |

---

## 10. Competency Profile Output

The session produces a structured competency profile. This is the durable artifact the learner owns.

### 10.1 Profile Structure

```
AVER COMPETENCY PROFILE
[Learner Name] · [Date] · [Domain]

SESSION SUMMARY
Topics assessed: [list]
Session duration: [X] minutes
Scaffold type: [Competency Map / Socratic Exploration]
Format: AI-conducted oral assessment with adaptive follow-ups

COMPETENCY MAP

  Conceptual Understanding     ████████░░  4/5
  Verbal Explanation Ability   ███████░░░  3.5/5
  Applied Reasoning            ██████████  5/5
  Knowledge Depth              ██████░░░░  3/5
  Synthesis & Integration      ████████░░  4/5

NARRATIVE ASSESSMENT

[2–3 sentences generated by the profiler from session data. Example:]

"[Name] demonstrates strong conceptual understanding of supply and demand
dynamics and applied them effectively to a novel scenario involving market
competition. Their ability to reason through ambiguous situations with
explicit assumptions was notably strong. Formal vocabulary around elasticity
concepts was developing but not yet fluent, suggesting solid intuition
that would benefit from more practice with precise terminology."

SPECIFIC FINDINGS

Strengths:
[Bullet points referencing actual moments from the conversation]

Growth areas:
[Bullet points referencing specific gaps, with constructive framing]

VERIFICATION
Session recording: [link]
Full transcript: [link]
Assessment ID: [unique hash]
```

### 10.2 Profile Generation Logic

- Competency map scores are derived from the state variables tracked across all five phases, weighted by the scaffold type (Socratic Exploration weights narrative heavier; Competency Map weights scores heavier)
- Narrative assessment is generated by the profiler agent from session data — it should read like a precise diagnostic, not an auto-generated report
- Specific findings reference actual moments from the conversation, making them verifiable against the transcript
- The profile must be consistent with the recorded session — this is the verification layer
- Knowledge provenance is reflected in the profile: competencies demonstrated independently are distinguished from those that emerged only after scaffolding

### 10.3 Instructor View

In addition to the student-facing profile, the instructor receives:

- Aggregate competency maps across all students in the assessment (distribution of scores per dimension)
- Topic-level performance breakdown (which topics were strong/weak across the cohort — the NYU paper demonstrated this as powerful diagnostic feedback for instructors)
- Individual session drill-down: profile, transcript, recording playback
- Flagged sessions: high scaffolding needed, extraction attempts, edge case patterns
- Session duration and completion statistics

---

## 11. Voice Pipeline Requirements

### 11.1 Speech-to-Text (STT)

- Must support domain-specific vocabulary with acceptable accuracy (economics terminology, technical terms from source materials)
- Must handle natural speech patterns: thinking pauses, self-corrections, filler words
- Latency target: < 500ms from end of learner speech to text available for LLM processing
- Must handle non-native English speakers without systematic accuracy degradation (the NYU paper flagged this as a known concern in the broader literature)

### 11.2 Text-to-Speech (TTS)

- Natural prosody — must not sound robotic or rushed
- Consistent voice across the session
- Latency target: begin audio playback within 200ms of text generation start (streaming TTS)
- The AI should not sound warm/encouraging or cold/harsh — neutral, professional register matching "a sharp, encouraging professor"

### 11.3 Turn-Taking

- Silence threshold before the AI speaks: configurable, default 3 seconds after the learner stops speaking
- Must not interpret thinking pauses as end-of-turn (the NYU paper documented this as a significant failure mode at 5 seconds; we should default to longer tolerance)
- The AI must not interrupt the learner
- The learner should be able to interrupt the AI (barge-in support)

---

## 12. Data Model and Storage

### 12.1 Core Entities

**Assessment Configuration:** Instructor-defined. Contains topic scope, source materials, scaffold type, duration target, and any custom instructions. Immutable once students begin taking the assessment.

**Session Plan:** Compiled from an assessment configuration. Contains the question node graph, domain packets, rubric descriptors, and follow-up logic. Cached and reused across all students taking the same assessment. Versioned — if the instructor modifies the assessment configuration, a new session plan is compiled and previous plans are archived.

**Session:** One per student per assessment attempt. Contains the full transcript, running competency state snapshots, learner belief model, evaluation blocks per turn, recording reference, and profiler output. The session is the primary audit artifact.

**Competency Profile:** Generated post-session. Contains scores, narrative, specific findings, and links to the session recording and transcript. Belongs to the student and is visible to both student and instructor.

**User:** Student or instructor. Minimal profile for MVP (name, email, role). Authentication via email link or institutional SSO (stretch goal for MVP).

### 12.2 Data Retention

- Session recordings and transcripts: retained indefinitely (subject to institutional requirements)
- Competency profiles: retained indefinitely
- Session plans: retained as long as assessments are active
- Evaluation blocks and state snapshots: retained for audit purposes, minimum 12 months

---

## 13. Future Roadmap

Features considered during design but deferred beyond MVP. These have been architecturally accounted for — the MVP design should not preclude their addition.

### 13.1 V2: Expanded Scaffolds and Cross-Turn Intelligence

**Additional scaffold types:** Thesis Defense, Rapid Verification, and Reflective Interview. The session plan compilation and question type taxonomy already support these; the primary work is in scaffold-specific adaptive logic and testing.

**Mixed scaffolds:** A single session with multiple scaffold sections (e.g., Competency Map followed by Reflective Interview). Requires session plan support for scaffold transitions and per-section profiling.

**Micro-burst escalation:** For spontaneous cross-turn evaluation moments the session plan didn't anticipate. A compact, purpose-built LLM call triggered by the rules engine when the drift detector flags a potential contradiction or cross-reference. The micro-burst receives only the two relevant exchanges and their domain packets, produces a probe instruction, and feeds it to the rules engine. The conversational agent never sees the additional domain context. Estimated latency: 200–300ms, triggered on ~10-15% of turns.

**Pre-computed contradiction graph:** During session plan compilation, the evaluator maps expected claim-pairs across concepts to specific contradiction probe instructions. The rules engine matches learner claims (extracted from evaluation blocks) against the graph and injects pre-built probes without additional LLM inference.

**Drift detector:** A rules engine extension that compares new learner claims against the belief model. When a claim conflicts with the learner's previously demonstrated understanding, it triggers either a graph-matched probe (fast) or a micro-burst evaluation (deeper).

### 13.2 V2: Multi-Model Grading Council

Adopt the NYU paper's validated pattern: three LLM models from different families independently score each transcript, then revise scores after reviewing peer reasoning. A chair model synthesizes the final profile. This strengthens grading reliability (Krippendorff's α = 0.86 in the NYU implementation) and reduces single-model bias. The profiler architecture already separates grading from the conversational agent, making this a modular addition.

### 13.3 V2: Assessment Confidence Sandbox

An optional "Preview the Assessment" feature within the assessment configuration workflow (see Section 3.5). Allows instructors to experience the assessment as a student ("try it yourself" in a compressed 3-minute session), or view simulated transcripts of strong and struggling students with annotations showing which learning outcomes are assessed at each moment. Builds experiential confidence beyond what the rubric review alone provides, particularly for first-time users.

### 13.4 V2: LMS Integration

Integration with Canvas, Moodle, and Blackboard via LTI (Learning Tools Interoperability). Enables instructors to assign assessments within their existing course management workflows and synchronize grades. Requires no architectural changes to the assessment engine — the integration layer sits between the LMS and Aver's API.

### 13.5 V3: Multi-Session Portfolio

Multiple sessions across different topics aggregate into a student portfolio. Design questions to resolve: does each session produce an independent profile (simpler, more auditable), or does the portfolio synthesize across sessions (richer, but harder to verify against individual recordings)? The portfolio belongs to the student.

### 13.6 V3: Employer-Facing Features

If Aver earns trust in education and validity studies demonstrate that oral assessment scores predict real-world outcomes, portfolios may carry value beyond the classroom. This is not a near-term product goal but informs architectural decisions: student data ownership, portability, and privacy controls should be designed from the start to support eventual external sharing if the student chooses.

### 13.7 Ongoing: Validity Research Program

Publish validity studies comparing Aver's competency profiles against expert human assessors. This is both a product requirement (credibility with institutions) and a competitive moat (validity evidence that no competitor can shortcut). Requires: structured data export for research, consent workflows for student participation, and partnership with education researchers.

---

## 14. Open Questions

Decisions that don't need to be resolved before building MVP but will need answers before scale.

1. **Scoring calibration:** The 1–5 rubric dimensions need validation against expert assessors. Are the AI's scores consistent with human professor evaluations? Requires a calibration study, likely 20–30 sessions scored by both AI and human.

2. **Session length optimization:** Is 10–20 minutes the right range? Shorter sessions risk shallow assessment. Longer sessions risk learner fatigue and higher compute costs. Log session lengths and learner drop-off points to inform this.

3. **Domain generalizability:** Introductory courses with clear conceptual hierarchies (economics, biology, computer science) are natural launch domains. Domains with different assessment structures (creative writing, philosophy, lab sciences) may require scaffold modifications. How domain-specific does the session architecture need to be?

4. **Rubric descriptor leakage quantification:** A pre-launch red-team study should test whether savvy learners can reverse-engineer domain knowledge from the pattern of questions and follow-ups across a full session. This is the primary unvalidated security risk in the ephemeral domain window architecture.

5. **Non-native speaker experience:** The NYU paper found 83% of students reported oral exams as more stressful than written. This stress may be amplified for non-native English speakers. Evaluate whether the voice pipeline's STT accuracy and the AI's conversational style create systematic disadvantages.

6. **Recording format and storage:** Audio-only vs. video? Platform-hosted vs. downloadable? The verification layer depends on this. Also drives compute and storage costs at scale.

7. **Pricing model:** Per-student per-assessment vs. institutional subscription vs. course-level licensing. The $0.42/student marginal cost from the NYU paper suggests significant margin opportunity, but the session plan compilation and infrastructure costs need to be factored into the model.

# Architectural Precedents Research: Findings

*Synthesized from academic papers, technical documentation, OWASP frameworks, and public technical discussions. April 2026.*

---

## Executive Summary

The core finding across all comparable domains is a consistent pattern: **behavioral constraints on LLMs (prompting, RLHF, system instructions) are necessary but structurally insufficient for preventing knowledge leakage.** Every team that has deployed a system where an AI agent must not reveal what it knows has either (a) learned this lesson the hard way and retrofitted architectural controls, or (b) accepted the residual risk because their use case tolerates it. No published system we found has implemented anything resembling our ephemeral domain window architecture, which suggests it's either genuinely novel or the problem hasn't been framed this way before. The closest analogues come from enterprise RAG access control, where the principle of pre-retrieval filtering (never let the LLM see unauthorized data) is now consensus best practice over post-generation auditing.

---

## Finding 1: The NYU Oral Assessment System — The Most Direct Precedent

**Source:** Ipeirotis & Rizakos, "Scalable and Personalized Oral Assessments Using Voice AI," arXiv:2603.18221, March 2026.

This is the closest existing implementation to what Aver is building. 36 students, NYU Stern, AI-conducted oral exams at $0.42/student using ElevenLabs Conversational AI.

**Architecture:** Three-agent decomposition — Authentication Agent, Project Discussion Agent, Case Discussion Agent — managed by a platform orchestrator. Each agent handles one phase. Grading is separated entirely: a post-session "council of LLMs" (Claude, Gemini, GPT-5) scores transcripts through two rounds of independent evaluation plus deliberation.

**Key architectural lessons:**

- **Phase decomposition prevents conversational drift.** When a failure occurs in Phase 2, it doesn't contaminate Phase 3. This validates the session plan approach — structuring conversations into bounded phases with clear handoffs.

- **"Behavioral constraints on LLMs must be enforced through architecture, not prompting alone."** This is stated as their central finding. Specific failures:
  - The agent stacked multiple questions per turn despite explicit prompt prohibitions. Prompt instructions could not prevent this.
  - When asked to repeat a question, the agent paraphrased instead — the LLM's helpfulness training overrode the assessment constraint.
  - The agent could not randomize case selection despite being instructed to. It fixated on one case 86% of the time.

- **Their proposed fix: programmatic turn validation** — rejecting agent outputs that contain multiple question marks, for example. This is a post-generation auditor pattern (our Architecture 5), which they're treating as an interim solution.

- **Grading was fully separated from the conversational agent.** The examining agent never grades; the grading council never talks to the student. This is a clean implementation of evaluator/interlocutor separation, but only for grading — the real-time assessment decisions (what to ask next, how to follow up) are still inside the conversational agent.

**What they don't address:** Domain knowledge isolation. Their agents have full access to rubrics and course content. They don't discuss adversarial extraction attempts by students, likely because at 36 students in a known course, gaming incentives were low. At scale, this becomes a critical gap.

**Implications for Aver:** The phase decomposition pattern is validated. The "architecture over prompting" lesson directly supports our design direction. Their grading council pattern (multi-model deliberation for scoring) is worth adopting for the profiler. But their system has no answer to the knowledge isolation problem — the conversational agents have everything in context.

---

## Finding 2: Khanmigo — Behavioral Guardrails at Scale, and Their Limits

**Sources:** Khan Academy engineering blog, Sal Khan public talks (TED, interviews), Edutopia analysis, Chalkbeat reporting.

**Architecture:** Single-agent, GPT-4-based, with heavy system prompt engineering. Split into two subject-specific tutors (math/science and humanities) with different prompt configurations. Grounded in Khan Academy's content library for accuracy. Moderation guardrails flag inappropriate conversations to parents/teachers.

**Key finding — the model dependency problem:** Sal Khan stated publicly that GPT-3.5 could not maintain Socratic behavior: "If a student says, 'Hey, tell me the answer,' with GPT-3.5, even if you tell it not to tell the answer, it will still kind of give the answer." GPT-4 was substantially better at maintaining the Socratic constraint through prompting alone.

This reveals a fundamental fragility: **behavioral guardrails are model-version-dependent.** What works with one model version may break with the next, because the compliance with system instructions is an emergent property of training, not an architectural guarantee. An upgrade or model switch could silently degrade the security boundary.

**The "continuous arms race" framing:** Khan describes preventing answer-giving as "a continuous arms race where we are looking at what students are doing and putting in more guardrails." This is reactive security — patching prompt exploits as they're discovered — rather than structural security.

**Student engagement finding:** Teachers reported that students found Khanmigo frustrating because it wouldn't give answers. Some teachers stopped using it. This is relevant for Aver's product design: the refusal to provide answers needs to feel like good pedagogy, not like an obstructive guardrail. The assessment context (where not-giving-answers is the expected behavior) may be more natural than the tutoring context (where students want help).

**What's missing architecturally:** No published evidence of any structural separation between the model's knowledge and its conversational output. Everything is prompt-level. No domain knowledge partitioning, no ephemeral context management, no evaluator/interlocutor split.

**Implications for Aver:** Khanmigo validates that the tutoring/assessment use case generates persistent adversarial pressure from users. It also validates that prompt-level defenses are fragile and model-dependent. Both findings support an architectural approach. The student frustration finding is a product design signal: Aver's assessment framing may be more naturally compatible with not-giving-answers than Khanmigo's tutoring framing.

---

## Finding 3: Georgia Tech Socratic Mind — Scalable Socratic Assessment

**Sources:** Hung et al., ACM L@S 2024; Lee et al., arXiv:2509.16262 (2025 impact study); MIT Solve profile.

**Architecture:** LLM-powered assessment tool using Socratic questioning. Supports multi-turn questioning, short answer, role-play, and structured debate. Instructors configure opening questions, desired answers, evaluation rubrics, and common misconceptions. The tool adapts follow-up questions based on student responses. Includes AI-powered question design features that help instructors craft questions from uploaded materials.

**Key design choice — instructor-configured rubrics:** Instructors define "desired answers" and "common misconceptions" that guide the AI's adaptive questioning logic. This is essentially a pre-compiled session plan — the instructor builds the rubric, and the AI navigates it in real time.

**Scale evidence:** Deployed across 5,000+ students. 173 students in a controlled study in Spring 2025. 88.2% reported it was more educational than traditional multiple-choice assessment.

**What's architecturally interesting:** The system that the instructor configures — with opening questions, desired answers, and misconception patterns — is structurally similar to our pre-compiled session plan with rubric descriptors. They've validated that this approach works at scale for generating adaptive Socratic dialogue.

**What's missing:** No published discussion of adversarial behavior, knowledge isolation, or security architecture. The papers focus on learning outcomes and engagement, not on the system's robustness to gaming. This is likely because the deployments were formative (extra credit) rather than high-stakes summative, reducing gaming incentives.

**Implications for Aver:** Validates the instructor-configures-rubric-and-AI-navigates pattern at scale. The pre-compiled session plan approach has working precedent. But the security and adversarial robustness questions are unaddressed — Aver would be breaking new ground there.

---

## Finding 4: OWASP LLM Top 10 2025-2026 — Consensus on Architectural Security

**Sources:** OWASP LLM Top 10 2025, OWASP Top 10 for Agentic Applications 2026, multiple security analysis articles.

Prompt injection remains the #1 vulnerability in production LLM deployments. The security community's consensus has consolidated around several principles directly relevant to our architecture:

**"Teams should never treat the system prompt as a secret or rely on it as a security control."** OWASP explicitly states that system prompts are not a security boundary. If rubric criteria or answer keys are in the system prompt, they should be considered extractable.

**"The real vulnerability shows up when teams use system prompts for security functions such as privilege separation or authorization."** This is exactly what Khanmigo and most educational AI tools do — they put "don't give the answer" in the system prompt and treat it as a security control.

**Recommended pattern — least privilege + external security controls:**
- Grant agents minimal necessary permissions (least privilege)
- Main security controls should be separate from the LLM — use "predictable, easy-to-audit systems" for authorization
- Isolation and sandboxing for agent actions
- Comprehensive logging and audit trails

**The pre-retrieval vs. post-retrieval filtering consensus:** In enterprise RAG, the security community has converged on a clear principle: never let the LLM see unauthorized data, even if you plan to filter the output. Post-generation auditing is insufficient because "the LLM has already seen data the user shouldn't access, even if you filter the final output." Information leakage happens through subtle synthesis, not just direct quotation.

**The "fundamental limitation" framing:** Multiple sources describe prompt injection as "a consequence of the dominant architectural paradigm itself" — LLMs cannot reliably separate instructions from data when both are concatenated in the context window. "True elimination would likely require radical architectural departures: native token-level privilege tagging, separate attention pathways for trusted vs. untrusted content."

**Implications for Aver:** This is the strongest external validation of our architectural approach. The entire security community consensus says: don't rely on prompts for security, enforce access control before the LLM sees the data, use external systems for authorization decisions. Our ephemeral domain window + rules engine architecture aligns with all of these principles. The pre-retrieval filtering analogy maps directly: injecting only the current node's domain packet is the assessment equivalent of pre-retrieval permission filtering.

---

## Finding 5: Enterprise RAG Access Control — The Closest Architectural Analogue

**Sources:** Pinecone documentation, RAGAboutIt security analyses, OWASP RAG guidance.

Enterprise RAG systems face a structurally analogous problem: the LLM needs document content to generate accurate answers, but some documents are restricted to certain users. Three approaches exist:

**Approach 1 — Post-retrieval filtering:** Retrieve all relevant documents, then filter unauthorized ones before showing the response. **Problem:** The LLM has already processed restricted data in its reasoning chain. Even if the output is filtered, the LLM's response may be shaped by restricted content in ways that leak information. This is analogous to our Architecture 5 (post-hoc auditor).

**Approach 2 — Pre-retrieval filtering:** Only retrieve documents the user is authorized to see. The LLM never encounters restricted content. **This is the consensus best practice.** It's structurally equivalent to our ephemeral domain window — scope what the LLM can see before inference, not after.

**Approach 3 — Separate RAG instances per permission level.** Most secure but creates fragmentation and cost explosion. Analogous to our Architecture 12 (micro-agents with zero domain knowledge in the composer).

**The "synthesis leakage" problem:** Even when direct content is filtered, LLMs can leak restricted information through synthesis. If the model saw restricted data during reasoning, its word choices, emphasis, and framing may be influenced by that data in ways a post-hoc filter can't detect. This is the strongest argument for pre-inference filtering (our approach) over post-inference auditing.

**Implications for Aver:** The RAG access control literature provides the clearest validation that our architecture is on the right track. Pre-retrieval filtering (equivalent to our ephemeral domain window injection) is consensus best practice. Post-generation auditing (equivalent to our rejected Architecture 5) is known to be insufficient. The "synthesis leakage" concept is directly applicable — an assessment AI that has seen the full answer key will produce subtly different questions than one that hasn't, even if it never explicitly states an answer.

---

## Finding 6: AI Interview Platforms — Validated Format, Opaque Architecture

**Sources:** Mercor documentation, HeyMilo user reports, Jabarian & Henkel field experiment (SSRN, 2025).

The employer-side AI interview market validates the format and produces strong outcome data (Jabarian/Henkel: AI-interviewed candidates were 12% more likely to receive job offers, 18% more likely to start, 17% more likely to remain employed at 30 days). However, **no AI interview platform has published meaningful architectural details.** This is the least architecturally informative domain despite being the most commercially validated.

What we can infer from user accounts of Mercor interviews:
- Adaptive follow-up questions are generated in real-time based on candidate responses
- The AI pushes back on design choices and challenges assumptions (suggesting it has enough domain knowledge to evaluate in real-time)
- Sessions are structured into phases
- Extended silence triggers AI interjection (similar to the NYU silence handling problem)

**The gaming gap:** No published research on adversarial behavior in AI interviews. This is likely because (a) platforms treat their anti-gaming measures as proprietary, and (b) the incentive structure is different — job candidates want to perform well, not extract answers. In education, students may want to extract answers to use on other assessments. The threat model is different.

**Implications for Aver:** The format works. The outcome data is strong. But there's nothing architecturally transferable from published sources. Expert conversations with engineers at these companies would be the only way to learn from their experience. The different threat model (candidates want to impress vs. students may want to extract) means Aver faces a harder security problem than hiring platforms.

---

## Finding 7: Poker AI — Conceptual Analogue for Information Asymmetry

**Sources:** DeepStack (Science, 2017), Libratus/Pluribus (Brown & Sandholm), INRIA FAIRPLAY team.

Poker AI operates under strict information asymmetry: the AI knows all cards but must act as if it only knows its own hand. The solution is mathematically elegant — Nash equilibrium strategies are, by definition, non-exploitable and information-leakage-free. If you play the equilibrium strategy, your actions reveal nothing about your private information because the strategy is independent of the private cards you hold.

**The key insight for our context:** Poker AI doesn't prevent leakage through behavioral rules ("don't reveal your cards"). It prevents leakage through structural design — the strategy computation itself produces actions that are provably independent of private information. The agent doesn't need willpower to avoid leaking; the architecture makes leaking impossible.

**The limitation of the analogy:** Poker AI strategies are computed across the entire game tree in advance. Our assessment agent needs to generate novel natural language in real time, which can't be pre-computed to the same degree. But the principle transfers: **design the architecture so that leakage is structurally impossible, rather than relying on the agent to resist leaking.**

**Implications for Aver:** The poker AI precedent is the strongest conceptual argument for structural over behavioral security. It won't give us implementation patterns (the domains are too different), but it provides the right mental model. Our ephemeral domain window architecture is the assessment equivalent of this principle: the conversational agent doesn't need to resist leaking domain knowledge because the architecture ensures it only has the minimum necessary knowledge at any given moment.

---

## Synthesis: Patterns Across Domains

### Pattern 1: "Architecture Over Prompting" is Convergent Wisdom

Every domain — educational AI (NYU), tutoring AI (Khanmigo), enterprise security (OWASP/RAG), game AI (poker) — converges on the same principle: behavioral constraints are insufficient; structural constraints are necessary. The NYU team states it explicitly. The OWASP framework codifies it. The RAG community demonstrates it empirically. The poker AI community proves it mathematically.

**Confidence level: High.** This is the single most robust finding. Our architecture's emphasis on structural knowledge isolation over prompt-based guardrails is well-supported.

### Pattern 2: Pre-Computation of Assessment Structure Works at Scale

Both the NYU system (phase-based decomposition) and Georgia Tech Socratic Mind (instructor-configured rubrics with adaptive follow-ups) validate that pre-computing session structure — and having the AI navigate a pre-built plan at runtime — produces good assessment conversations at scale. This is the foundation of our pre-compiled session plan architecture.

**Confidence level: High.** Multiple implementations at 36–5,000+ students.

### Pattern 3: No Published System Has Implemented Ephemeral Context Scoping

None of the systems we reviewed implement anything resembling our ephemeral domain window pattern — temporally scoping domain knowledge so the agent only sees one question's context at a time, with previous context stripped. The closest analogue is pre-retrieval filtering in RAG, which scopes at the document level rather than the temporal level.

**Confidence level: Medium.** This could mean we've identified a genuinely novel approach, or it could mean the problem hasn't been framed this way in published literature. Expert conversations would help disambiguate.

### Pattern 4: Post-Generation Auditing Is Known to Be Insufficient

The RAG security literature provides the strongest evidence here: even when you filter the output, the LLM's reasoning has already been shaped by restricted data. "Synthesis leakage" — where the model's word choices and framing are influenced by data that never appears in the output — is a documented failure mode. This directly argues against our rejected Architecture 5 (post-hoc auditor) and Architecture 9 (streaming evaluation with runtime guardrails).

**Confidence level: High.** Well-documented in enterprise RAG deployments.

### Pattern 5: The Grading/Evaluation Function Should Be Fully Separated From the Conversational Agent

The NYU system's multi-model grading council, operating post-session on transcripts, is the cleanest implementation of this. Their inter-rater reliability (Krippendorff's α = 0.86 after deliberation) is strong. Separating grading from the conversation means the grading models can have full domain knowledge without any risk of leakage, because they never interact with the student.

**Confidence level: High.** The NYU implementation provides validated reliability metrics.

---

## Failure Mode Inventory

Based on precedent systems, these are documented or plausible failure modes mapped to our architecture:

| # | Failure Mode | Source | Our Exposure | Mitigation |
|---|---|---|---|---|
| 1 | Question stacking (multiple questions per turn) | NYU paper | Medium — single-agent architecture could produce this | Rules engine validates agent output before delivery; reject multi-question turns |
| 2 | Paraphrasing instead of repeating (LLM helpfulness overrides assessment constraint) | NYU paper | Medium | Explicit "repeat verbatim" handling in rules engine, not just prompting |
| 3 | Non-random selection fixation (LLM can't randomize) | NYU paper | Low — our session plan pre-computes question selection, LLM doesn't choose | Session plan handles randomization before runtime |
| 4 | Silence misinterpretation (thinking treated as disconnection) | NYU paper | High — voice-based product | Platform-level timeout configuration, structural move taxonomy includes wait prompts |
| 5 | Model-version regression (guardrails break with model updates) | Khanmigo experience | Low — our security is structural, not prompt-dependent | Ephemeral domain window is model-agnostic; test across model versions |
| 6 | Student answer extraction via "just tell me" requests | Khanmigo, general | Low — agent lacks full domain knowledge to give answers | Structural limitation, not behavioral |
| 7 | Synthesis leakage (rubric criteria subtly shaping question phrasing) | RAG security literature | Medium — ephemeral window contains rubric descriptors that are compressed domain knowledge | Monitor for correlation between descriptor content and question phrasing; keep descriptors abstract |
| 8 | System prompt extraction | OWASP LLM01 | Medium — system prompt contains taxonomy instructions, scaffold config | System prompt doesn't contain domain answers; domain knowledge is in ephemeral windows that are stripped |
| 9 | Cross-turn information accumulation via transcript | Novel to our architecture | Low-Medium — transcript persists, but contains student responses, not domain knowledge | Transcript contains what was said, not what the correct answer was; limited leakage vector |
| 10 | Grading council anchoring bias (models converge on wrong grade) | NYU paper | Medium for profiler | Multi-model deliberation with explicit evidence requirements; flag high-disagreement cases for human review |
| 11 | Agent producing evaluative feedback during session ("great job") | Aver spec constraint | Medium — LLMs are trained to be encouraging | Rules engine filters evaluative language; scaffold configuration sets tone |
| 12 | Student using scaffolding moves to extract conceptual information | Inherent to Socratic scaffolds | Medium — scaffold moves in formative mode inherently teach | Knowledge provenance tagging distinguishes demonstrated vs. scaffolded competency |

---

## Open Questions Not Resolved by Research

1. **Has anyone tried temporal context scoping?** No published evidence found. Expert conversations with enterprise RAG security teams or LLM safety researchers might reveal unpublished experiments.

2. **How robust are rubric descriptors as a leakage vector?** Our ephemeral domain window contains descriptors like "mentions equilibrium adjustment mechanism." These are compressed domain knowledge. No published research quantifies how much information learners could extract from the pattern of follow-up questions shaped by such descriptors over a full session.

3. **What's the failure rate of rules-engine-based output validation?** The NYU team proposes programmatic turn validation but hasn't published results on its effectiveness. How often does the rules engine need to reject and regenerate, and what does that do to latency?

4. **How do students actually game voice-based AI assessments at scale?** No published adversarial behavior data from any educational AI voice assessment system. The NYU deployment was too small (36 students) and the Georgia Tech deployments were formative (low stakes). The gaming patterns will only emerge at scale with summative stakes.

5. **Does multi-model grading deliberation work across diverse domains?** The NYU council achieved α = 0.86, but only in one course (AI/ML Product Management). Whether this transfers to humanities, sciences, or professional domains is untested.

---

## Recommendations

1. **Proceed with the ephemeral domain window architecture.** The research strongly validates structural over behavioral security, and pre-inference knowledge scoping over post-inference auditing. No published system contradicts our approach; the gap is that no one has published this specific pattern.

2. **Adopt the NYU grading council pattern for the profiler.** Multi-model deliberation with evidence requirements achieves strong reliability. Separate the profiler entirely from the conversational agent — it runs post-session on the transcript with full domain knowledge.

3. **Build programmatic output validation into the rules engine.** The NYU paper's failure modes (question stacking, paraphrasing, evaluative feedback) are predictable and detectable. Pattern-matching validation before delivery is low-cost and high-value.

4. **Pre-compute question selection and randomization in the session plan.** The NYU paper's randomization failure is entirely avoidable by not asking the LLM to randomize at runtime. Our architecture already handles this.

5. **Run a red-team study focused on rubric descriptor leakage.** This is our architecture's most uncertain risk surface. Before launch, test whether savvy learners can extract meaningful domain knowledge from the pattern of questions asked across a full session.

6. **Pursue expert conversations with the NYU team (Ipeirotis/Rizakos) and Georgia Tech team (Hung/Goel).** Both are academic and likely responsive. The NYU paper's candor about failure modes suggests they'd be open to sharing further lessons. Focus questions on adversarial behavior they observed but didn't publish, and on architectural changes they're planning for the next iteration.

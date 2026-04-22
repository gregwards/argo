# Qualitative Signal System: Implementation Guidance

*Decision context for the Aver assessment engine's section progression logic. This document summarizes the outcome of architectural research and stress-testing to determine how the LLM's per-turn evaluation should communicate qualitative contextual signals to the rules engine.*

---

## The Decision

The LLM communicates qualitative signals through two new fields in the `evaluate_response()` function call, each serving a different consumer:

1. **`confidence_adjustment`** (engine-consumed) — a single float expressing magnitude of qualitative concern
2. **`observation`** (profiler-consumed) — a typed, described object for post-session diagnostic narrative

The engine never reads the observation. The profiler reads both. If either field is malformed or missing on a given turn, the other still works. Both degrade gracefully and independently.

---

## Schema Changes to `evaluate_response()`

Add two fields to the existing function call schema:

```python
# Engine-consumed: reduces belief model confidence when qualitative concerns exist
"confidence_adjustment": {
    "type": "number",
    "minimum": -0.5,
    "maximum": 0,
    "default": 0,
    "description": (
        "Adjust confidence downward when qualitative concerns reduce your trust "
        "in the quantitative score. 0 means no qualitative concerns. Use approximate "
        "scale: -0.1 = minor concern (e.g., hedging language on a correct answer), "
        "-0.2 to -0.3 = moderate concern (e.g., answer conflicts with something said "
        "earlier), -0.4 to -0.5 = major concern (e.g., textbook-perfect answer but "
        "completely unable to explain reasoning)."
    )
}

# Profiler-consumed: typed observation for post-session diagnostic narrative
"observation": {
    "type": "object",
    "nullable": true,
    "default": null,
    "description": (
        "Optional. Record a qualitative observation when you notice something the "
        "quantitative evaluation doesn't capture. Most turns will have no observation."
    ),
    "properties": {
        "type": {
            "type": "string",
            "enum": [
                "inconsistency",
                "rote_memorization",
                "hedging_on_correct",
                "sophisticated_misconception",
                "guessing"
            ],
            "description": (
                "inconsistency: current response conflicts with something said in a prior turn. "
                "rote_memorization: textbook-accurate language with no evidence of understanding. "
                "hedging_on_correct: correct content delivered with excessive uncertainty. "
                "sophisticated_misconception: coherent but wrong mental model. "
                "guessing: correct answer with absent or incoherent reasoning."
            )
        },
        "description": {
            "type": "string",
            "description": "One sentence describing what you observed."
        }
    }
}
```

All existing fields (`descriptor_matches`, `descriptor_misses`, `response_quality`, `belief_update`, `next_action`, `key_moment`, `flags`) remain unchanged.

---

## Rules Engine Changes

### Confidence adjustment processing

One addition to the state machine's `process_evaluation()` method:

```python
def process_evaluation(self, eval_data):
    # ... existing logic: parse descriptor matches, update belief model ...

    # NEW: apply qualitative confidence adjustment
    confidence_adj = eval_data.get("confidence_adjustment", 0)
    if confidence_adj:
        current_lo = eval_data["belief_update"]["learning_outcome_id"]
        self.belief_model[current_lo]["confidence"] += confidence_adj

    # ... existing logic: threshold check, navigation decision ...
```

The existing threshold-based advancement logic handles the rest. A -0.3 adjustment on a 0.7 confidence drops it to 0.4, which falls below the advancement threshold naturally.

### Observation passthrough

The engine does NOT process the `observation` field. It writes it to the session log alongside other per-turn data:

```python
    # Log observation for profiler (no processing)
    if eval_data.get("observation"):
        self.session_log.append_observation(
            turn=self.turn_count,
            observation=eval_data["observation"]
        )
```

No branching, no type-checking, no severity mapping. The observation flows through to the session log and is consumed only by the post-session profiler.

---

## How This Interacts with Existing Architecture

### Pre-compiled qualitative paths (already in the session plan)

Most qualitative scenarios (~85%) are predictable and should be handled by the session plan compiler, not by real-time annotations. During session plan compilation, the evaluator encodes anticipated qualitative scenarios as conditional follow-up edges:

- "IF descriptor_matches includes 'textbook definition' AND descriptor_misses includes 'explains mechanism' → follow_up: application_probe"
- "IF response_quality is 'strong' on this node AND response_quality was 'weak' on the related node → follow_up: coherence_probe"

These are deterministic rules using the session plan's existing conditional edge structure. They handle the qualitative moments the compiler can anticipate without any real-time signal.

The `confidence_adjustment` + `observation` system handles the residual unpredictable moments — the ones the compiler couldn't foresee.

### Belief model

The `confidence_adjustment` modifies the same belief model confidence scores that the existing `belief_update` field populates. It's an additive modifier on top of the LLM's primary assessment, not a separate tracking system.

### Profiler

The profiler agent receives:
- The full belief model history (per-concept claims, gaps, understanding levels, confidence trajectories)
- The observation log (typed, described qualitative observations with turn numbers)
- The full transcript

The observations give the profiler typed data it can aggregate ("3 instances of hedging on correct answers across the session") and described evidence it can reference ("noted in the elasticity discussion that the student's language suggested memorization rather than understanding"). This supports evidence-linked narrative findings without the profiler needing to re-analyze the raw transcript.

---

## Observation Taxonomy (MVP)

Five types. Each has a clear diagnostic meaning. The engine doesn't know these types exist.

| Type | What the LLM is detecting | Example `description` |
|---|---|---|
| `inconsistency` | Current response conflicts with a claim made in a prior turn | "Described photosynthesis as energy-consuming in the earlier question, energy-producing now" |
| `rote_memorization` | Textbook-accurate language with no evidence of genuine understanding; can state but not explain or apply | "Gave textbook definition of elasticity but couldn't explain why insulin demand is inelastic" |
| `hedging_on_correct` | Correct content delivered with excessive uncertainty, suggesting anxiety rather than knowledge gap | "Said 'I'm probably wrong but I think price rises because of competition among buyers' — reasoning is sound" |
| `sophisticated_misconception` | Coherent but wrong mental model that produces correct answers in simple cases but breaks in complex ones | "Treats supply and demand as sequential rather than simultaneous — works for basic questions, fails for equilibrium" |
| `guessing` | Answer happens to be correct but reasoning is absent, incoherent, or disconnected from the conclusion | "Said demand is inelastic, which is correct, but the explanation referenced unrelated concepts" |

### Adding new types later

Adding a new observation type (e.g., `domain_transfer_gap`) requires:
1. Add the value to the `type` enum in the function schema
2. Add its description to the LLM prompt
3. No engine changes — the engine never reads the type field
4. The profiler automatically picks it up from the session log

---

## LLM Prompt Changes

Add to the system prompt's evaluation instructions:

```
QUALITATIVE SIGNALS — In addition to your standard evaluation:

- confidence_adjustment: If something qualitative reduces your trust in the score 
  (hedging, inconsistency with earlier answers, signs of memorization without 
  understanding, guessing), express the magnitude as a negative number. Most turns 
  this is 0. Scale: -0.1 minor, -0.3 moderate, -0.5 major.

- observation: When you notice something the rubric descriptors don't capture, 
  record it. Type it and describe it in one sentence. Most turns have no 
  observation. Don't force one.
```

---

## Design Rationale (for context, not implementation)

This design was validated through research across six parallel domains (evidence-centered design in psychometrics, SIEM alert correlation, chess engine evaluation, compiler diagnostics, medical clinical exams, observability systems) and stress-tested against seven alternative architectures through a structured creative process.

The core insight: the engine and the profiler need fundamentally different representations of the same qualitative event. The engine needs actionable magnitude (a number). The profiler needs diagnostic narrative (a typed description). Forcing both through one data structure — such as typed annotations with severity levels that the engine must parse — creates unnecessary coupling and reliability risk. The two-field approach resolves this by giving each consumer exactly what it needs.

Key architectural principles this implements:
- **LLM evaluates, engine decides.** The float adjusts a number; the engine decides what to do with it through existing threshold logic. No suggested probes, no navigation hints.
- **Graceful degradation.** If the observation is malformed, the engine is unaffected. If the float is missing, it defaults to 0 and navigation proceeds on quantitative evaluation alone.
- **Extensibility without engine changes.** New observation types are a schema + prompt change. The engine's one line of arithmetic never changes.
- **Pre-compiled handles the predictable; real-time handles the residual.** The session plan's conditional edges cover anticipated qualitative scenarios. This system covers what the compiler couldn't foresee.

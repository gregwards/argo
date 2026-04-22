"""Evaluation function schema for LLM function calling.

The LLM calls evaluate_response() alongside its text response on every turn.
This provides structured assessment data to the rules engine without fragile XML parsing.
"""

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
                "description": "Which rubric descriptors the learner's response matched",
            },
            "descriptor_misses": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Which rubric descriptors were not addressed",
            },
            "response_quality": {
                "type": "string",
                "enum": ["strong", "partial", "weak", "off_topic", "silence"],
                "description": "Overall quality of the learner's response",
            },
            "belief_update": {
                "type": "object",
                "properties": {
                    "learning_outcome_id": {"type": "string"},
                    "claims": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "New claims the learner made this turn",
                    },
                    "gaps": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "New gaps identified this turn",
                    },
                    "understanding_level": {
                        "type": "string",
                        "enum": ["strong", "partial", "weak"],
                    },
                    "scaffolding_needed": {
                        "type": "string",
                        "enum": ["none", "light", "heavy"],
                    },
                    "confidence_signal": {
                        "type": "string",
                        "description": "Brief note on learner's confidence level",
                    },
                },
                "description": "Updates to the learner belief model",
            },
            "next_action": {
                "type": "string",
                "enum": [
                    "advance",
                    "follow_up",
                    "scaffold",
                    "redirect",
                    "move_on",
                    "end_phase",
                ],
                "description": "What the assessment should do next",
            },
            "follow_up_type": {
                "type": "string",
                "enum": [
                    "causal_interrogation",
                    "specificity_probe",
                    "counterfactual_challenge",
                    "extension",
                    "redirect_reframe",
                    "boundary_test",
                    "assumption_surfacing",
                    "contradiction_probe",
                    "precision_push",
                    "steelman",
                    "scaffold",
                ],
                "description": "If next_action is follow_up, which taxonomy type",
            },
            "key_moment": {
                "type": "string",
                "description": "Brief description if notable, empty string otherwise",
            },
            "flags": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": [
                        "extraction_attempt",
                        "anxiety_pattern",
                        "tangent",
                        "surface_level_fluency",
                        "overachiever",
                        "i_dont_know",
                        "self_correction",
                        "articulation_gap",
                    ],
                },
                "description": "Edge case patterns detected this turn",
            },
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
                ),
            },
            "observation": {
                "type": "object",
                "nullable": True,
                "default": None,
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
                            "guessing",
                        ],
                        "description": (
                            "inconsistency: current response conflicts with something said in a prior turn. "
                            "rote_memorization: textbook-accurate language with no evidence of understanding. "
                            "hedging_on_correct: correct content delivered with excessive uncertainty. "
                            "sophisticated_misconception: coherent but wrong mental model. "
                            "guessing: correct answer with absent or incoherent reasoning."
                        ),
                    },
                    "description": {
                        "type": "string",
                        "description": "One sentence describing what you observed.",
                    },
                },
            },
        },
        "required": ["descriptor_matches", "response_quality", "next_action"],
    },
}

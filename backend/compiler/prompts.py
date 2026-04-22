"""Prompts for the session plan compiler."""

RUBRIC_GENERATION_PROMPT = """Generate an assessment rubric for oral examination based on the following learning outcomes.

RUBRIC STRUCTURE (CRITICAL — follow this exactly):
- For each learning outcome, generate 1-3 CRITERIA (Bloom's-informed):
  * Simple LOs (remember/understand verbs like "define", "describe") -> 1 criterion
  * Moderate LOs (apply verbs like "apply", "solve") -> 1-2 criteria
  * Complex LOs (analyze/evaluate/create verbs like "analyze", "design", "evaluate") -> 2-3 criteria
- Each criterion has exactly 3 ATTAINMENT LEVELS: strong, partial, weak
  * Describe what a student would DEMONSTRATE at each level during a voice conversation
  * Be specific and observable — not "shows understanding" but "explains the causal mechanism linking X to Y"
- Each criterion has a POINT WEIGHT. All weights across all criteria must sum to exactly 100.
  * Higher Bloom's complexity LOs should receive proportionally more weight
  * Simple recall criteria: 5-10 points each
  * Application criteria: 10-20 points each
  * Analysis/evaluation/creation criteria: 15-30 points each

LEARNING OUTCOMES:
{formatted_learning_outcomes}

SCAFFOLD TYPE: {scaffold_type}

ADDITIONAL INSTRUCTIONS FROM INSTRUCTOR:
{additional_instructions}

For each learning outcome, also generate a coverage_summary (1-2 sentences describing how this LO will be assessed).

Respond with this exact JSON structure:
{{
  "rubric": [
    {{
      "learning_outcome_id": "lo_1",
      "criteria": [
        {{
          "name": "Criterion name (e.g., Causal Mechanism Explanation)",
          "weight": 25,
          "bloom_level": "analyze/evaluate/create",
          "attainment_levels": [
            {{"level": "strong", "description": "Explains full causal chain including..."}},
            {{"level": "partial", "description": "Identifies directional effect but..."}},
            {{"level": "weak", "description": "States outcome without causal..."}}
          ],
          "question_pool": {{
            "foundational": ["Question for baseline assessment"],
            "probing": ["Follow-up question for deeper assessment"]
          }}
        }}
      ]
    }}
  ],
  "coverage_summary": [
    {{
      "learning_outcome_id": "lo_1",
      "description": "How this LO will be assessed"
    }}
  ]
}}"""

SESSION_PLAN_COMPILATION_PROMPT = """Compile an oral assessment session plan from the following
learning outcomes and rubric.

Your output is a structured JSON session plan that an AI assessor will navigate during a live
voice assessment. The assessor will see ONE question node at a time and must be able to conduct
the assessment using only that node's information plus the learner's transcript.

CRITICAL CONSTRAINTS:
- Each node's domain_packet must contain ONLY the knowledge needed to evaluate responses to
  THAT node's questions. Do not include answers to other nodes.
- Domain packets should be 150-400 tokens. Enough to evaluate, not enough to lecture.
- Rubric descriptors must be evaluative criteria, not answers.
  GOOD: "explains causal mechanism linking demand shift to price change"
  BAD: "the answer is that increased demand creates a shortage which drives price up"
- Follow-up rules must cover: strong, partial, weak, off_topic, and silence responses.
- Sample questions should be natural and conversational. Generate 2-3 per node.
- The plan must cover all provided learning outcomes across 5 phases.
- Each criterion from the rubric should map to one or more nodes. Foundational questions at
  difficulty_level=1, probing questions at difficulty_level=2-3.
- Not all starter/foundational questions need to be asked — the rules engine may skip based
  on student performance.
- Include criteria_name in each node to link it back to the rubric criterion.
- Each node MUST include a "priority" field set to "required" or "if_time_permits" based on
  the learning outcome's priority. The rules engine uses this to skip if_time_permits nodes
  when the session runs long.
- For follow_up_rules, include descriptor-pattern-based entries (D-16) that anticipate
  qualitative moments: when specific descriptor_matches AND descriptor_misses combinations
  suggest rote memorization, inconsistency, or surface understanding, encode a conditional
  follow_up_type (e.g., application_probe, consistency_check) with an instruction explaining
  the qualitative concern. Aim for 1-2 pattern-based entries per criterion where applicable.
  The engine matches these patterns at runtime against the LLM's actual
  descriptor_matches/descriptor_misses output.

LEARNING OUTCOMES:
{formatted_learning_outcomes}

RUBRIC:
{formatted_rubric}

SCAFFOLD TYPE: {scaffold_type}
DURATION TARGET: {duration_target} minutes
ADDITIONAL INSTRUCTIONS: {additional_instructions}

Generate a session plan with this JSON structure:
{{
  "scaffold_type": "{scaffold_type}",
  "duration_target_minutes": {duration_target},
  "start_node_id": "node_1",
  "nodes": {{
    "node_1": {{
      "id": "node_1",
      "learning_outcome_id": "lo_1",
      "criteria_name": "Causal Mechanism Explanation",
      "phase": 2,
      "difficulty_level": 1,
      "priority": "required",
      "question_type": "teach_back",
      "question_instructions": "Ask the learner to explain...",
      "sample_questions": ["question 1", "question 2"],
      "domain_packet": "Scoped domain knowledge for evaluation...",
      "rubric_descriptors": ["descriptor from attainment levels"],
      "follow_up_rules": [
        {{"condition": "strong", "action": "advance", "target_node_id": "node_2", "follow_up_type": null, "instruction": "Scale up"}},
        {{"condition": "partial", "action": "follow_up", "target_node_id": null, "follow_up_type": "specificity_probe", "instruction": "Ask for example"}},
        {{"condition": "weak", "action": "scaffold", "target_node_id": null, "follow_up_type": "scaffold", "instruction": "Reframe"}},
        {{"condition": "descriptor_pattern", "pattern": {{"descriptor_matches": ["textbook definition"], "descriptor_misses": ["explains mechanism"]}}, "action": "follow_up", "follow_up_type": "application_probe", "instruction": "Student can recite but may not understand — probe with application scenario"}}
      ],
      "cross_reference_inject": [],
      "structural_move_before": "signpost"
    }}
  }},
  "orientation_script": "Opening text for phase 1...",
  "closing_script": "Closing text for phase 5..."
}}"""

"""Session plan compiler — generates rubrics and compiles session plans from LOs."""

import json
from loguru import logger
from services.llm import call_claude
from compiler.prompts import RUBRIC_GENERATION_PROMPT, SESSION_PLAN_COMPILATION_PROMPT


def _normalize_weights(rubric: list[dict], total_weight: float):
    """Normalize criteria weights to sum to exactly 100 using largest-remainder method."""
    scale = 100.0 / total_weight
    # Collect all criteria references and their raw scaled weights
    criteria_refs = []
    raw = []
    for row in rubric:
        for c in row.get("criteria", []):
            criteria_refs.append(c)
            raw.append(c.get("weight", 0) * scale)
    floored = [int(w) for w in raw]
    remainder = 100 - sum(floored)
    # Distribute remainder to items with largest fractional parts
    fracs = sorted(range(len(raw)), key=lambda i: -(raw[i] - floored[i]))
    for i in range(remainder):
        floored[fracs[i]] += 1
    # Write back
    for i, c in enumerate(criteria_refs):
        c["weight"] = floored[i]


async def generate_rubric(
    learning_outcomes: list[dict],
    scaffold_type: str,
    additional_instructions: str = "",
) -> dict:
    """Generate assessment rubric from learning outcomes using Claude Sonnet."""
    # Include Bloom's level and estimated minutes so the prompt can calibrate criterion count and weights
    formatted_los = "\n".join(
        f"- {lo['id']}: {lo['text']} [Bloom's: {lo.get('bloom_level', 'unknown')}] [Est: {lo.get('estimated_minutes', 3)} min]"
        for lo in learning_outcomes
    )

    prompt = RUBRIC_GENERATION_PROMPT.format(
        formatted_learning_outcomes=formatted_los,
        scaffold_type=scaffold_type,
        additional_instructions=additional_instructions or "None provided.",
    )

    response = await call_claude(
        prompt=prompt,
        system="You are an expert assessment designer. Respond with JSON only, no preamble or markdown.",
        max_tokens=16384,
    )

    try:
        # Strip markdown code fences if present
        clean = response.strip().removeprefix("```json").removesuffix("```").strip()
        data = json.loads(clean)
        rubric = data.get("rubric", [])
        logger.info(f"Rubric generated: {len(rubric)} rows, {sum(len(r.get('criteria', [])) for r in rubric)} criteria")

        # Validate criteria weight sum and normalize to 100 if needed
        total_weight = sum(
            c.get("weight", 0)
            for row in rubric
            for c in row.get("criteria", [])
        )
        if rubric and total_weight != 100:
            logger.warning(f"Rubric criteria weights sum to {total_weight}, expected 100. Normalizing.")
            if total_weight > 0:
                _normalize_weights(rubric, total_weight)

        return {
            "rubric": rubric,
            "coverage_summary": data.get("coverage_summary", []),
        }
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse rubric JSON: {e}\nResponse: {response[:500]}")
        return {"rubric": [], "coverage_summary": []}


async def generate_rubric_streamed(
    learning_outcomes: list[dict],
    scaffold_type: str,
    additional_instructions: str = "",
    on_progress=None,
) -> dict:
    """Generate rubric with streaming for progress tracking. Same output as generate_rubric."""
    import os
    from anthropic import AsyncAnthropic

    formatted_los = "\n".join(
        f"- {lo['id']}: {lo['text']} [Bloom's: {lo.get('bloom_level', 'unknown')}] [Est: {lo.get('estimated_minutes', 3)} min]"
        for lo in learning_outcomes
    )

    prompt = RUBRIC_GENERATION_PROMPT.format(
        formatted_learning_outcomes=formatted_los,
        scaffold_type=scaffold_type,
        additional_instructions=additional_instructions or "None provided.",
    )

    client = AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    collected = ""

    async with client.messages.stream(
        model="claude-sonnet-4-6",
        max_tokens=16384,
        system="You are an expert assessment designer. Respond with JSON only, no preamble or markdown.",
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        async for text in stream.text_stream:
            collected += text

    try:
        clean = collected.strip().removeprefix("```json").removesuffix("```").strip()
        data = json.loads(clean)
        rubric = data.get("rubric", [])
        logger.info(f"Rubric streamed: {len(rubric)} rows, {sum(len(r.get('criteria', [])) for r in rubric)} criteria")

        total_weight = sum(
            c.get("weight", 0) for row in rubric for c in row.get("criteria", [])
        )
        if rubric and total_weight != 100:
            logger.warning(f"Rubric criteria weights sum to {total_weight}, expected 100. Normalizing.")
            if total_weight > 0:
                _normalize_weights(rubric, total_weight)

        return {
            "rubric": rubric,
            "coverage_summary": data.get("coverage_summary", []),
        }
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse streamed rubric JSON: {e}\nResponse: {collected[:500]}")
        return {"rubric": [], "coverage_summary": []}


async def compile_session_plan(
    learning_outcomes: list[dict],
    rubric: list[dict],
    scaffold_type: str,
    duration_target_minutes: int,
    additional_instructions: str = "",
) -> dict:
    """Compile a full session plan from LOs and rubric using Claude Sonnet."""
    # Include Bloom's level and priority so the LLM can set node priority ("required" vs "if_time_permits")
    # and calibrate question depth — rules engine reads priority to skip if_time_permits nodes under time pressure
    formatted_los = "\n".join(
        f"- {lo['id']}: {lo['text']} [Bloom's: {lo.get('bloom_level', 'unknown')}] [Priority: {lo.get('priority', 'required')}]"
        for lo in learning_outcomes
    )
    formatted_rubric = json.dumps(rubric, indent=2)

    prompt = SESSION_PLAN_COMPILATION_PROMPT.format(
        formatted_learning_outcomes=formatted_los,
        formatted_rubric=formatted_rubric,
        scaffold_type=scaffold_type,
        duration_target=duration_target_minutes,
        additional_instructions=additional_instructions or "None provided.",
    )

    response = await call_claude(
        prompt=prompt,
        system="You are an expert assessment designer. Respond with JSON only, no preamble or markdown.",
        max_tokens=16384,
    )

    try:
        clean = response.strip().removeprefix("```json").removesuffix("```").strip()
        plan = json.loads(clean)

        # Ensure max_duration_seconds is set for hard time limit enforcement (D-12)
        # Target + 5 min buffer, capped at 20 min absolute maximum
        if "max_duration_seconds" not in plan:
            plan["max_duration_seconds"] = duration_target_minutes * 60 + 300
            plan["max_duration_seconds"] = min(plan["max_duration_seconds"], 20 * 60)

        return plan
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse session plan JSON: {e}\nResponse: {response[:500]}")
        raise ValueError(f"Session plan compilation failed: could not parse LLM response as JSON")

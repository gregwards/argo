"""Competency profile generator — runs post-session on transcript + state."""

import asyncio
import json
from loguru import logger
from services.llm import call_claude
from profiler.prompts import PROFILER_PROMPT

# Seconds to wait for Claude before giving up — prevents indefinite pipeline hang (T-04-02)
_PROFILER_TIMEOUT_SECONDS = 120.0

_ERROR_FALLBACK = {
    "criteria_scores": [],
    "narrative_assessment": "Profile generation failed. Please review the transcript.",
    "strengths": [],
    "growth_areas": [],
    "belief_model_notes": "",
}


async def generate_profile(
    transcript: list[dict],
    competency_state: dict,
    belief_model: dict,
    evaluation_log: list[dict],
    key_moments: list[dict],
    rubric: list[dict],
    learning_outcomes: list[dict],
) -> dict:
    """Generate a per-criterion competency profile from session data.

    Returns a dict matching the criteria_scores shape expected by CompetencyProfile.
    Falls back to _ERROR_FALLBACK on timeout, JSON parse failure, or schema mismatch.
    """
    prompt = PROFILER_PROMPT.format(
        transcript=json.dumps(transcript, indent=2),
        competency_state=json.dumps(competency_state, indent=2),
        belief_model=json.dumps(belief_model, indent=2),
        evaluation_log=json.dumps(evaluation_log, indent=2),
        key_moments=json.dumps(key_moments, indent=2),
        rubric=json.dumps(rubric, indent=2),
        learning_outcomes=json.dumps(learning_outcomes, indent=2),
    )

    # Wrap in timeout to prevent indefinite hang if Claude API stalls (T-04-02)
    try:
        response = await asyncio.wait_for(
            call_claude(
                prompt=prompt,
                system="You are an assessment profiler generating per-criterion competency scores from an oral assessment transcript. Respond with valid JSON only, no markdown.",
            ),
            timeout=_PROFILER_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.error(f"Profiler timed out after {_PROFILER_TIMEOUT_SECONDS}s — returning error fallback")
        return _ERROR_FALLBACK

    # Parse JSON response
    try:
        clean = response.strip().removeprefix("```json").removesuffix("```").strip()
        profile = json.loads(clean)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse profile JSON: {e}")
        return _ERROR_FALLBACK

    # Validate criteria_scores shape before returning (T-04-01)
    criteria_scores = profile.get("criteria_scores")
    if not isinstance(criteria_scores, list):
        logger.error(
            f"Profile validation failed: criteria_scores is {type(criteria_scores).__name__}, expected list"
        )
        return _ERROR_FALLBACK

    required_keys = {"criterion_id", "ai_score", "evidence_turns", "level"}
    for i, entry in enumerate(criteria_scores):
        missing = required_keys - set(entry.keys())
        if missing:
            logger.error(
                f"Profile validation failed: criteria_scores[{i}] missing keys {missing}"
            )
            return _ERROR_FALLBACK

        # Validate level is an integer 1-5
        level = entry.get("level")
        if not isinstance(level, int) or level < 1 or level > 5:
            logger.error(
                f"Profile validation failed: criteria_scores[{i}] level={level} not in 1-5"
            )
            return _ERROR_FALLBACK

        # Validate strength/growth objects have at least a commentary field
        for field in ("strength", "growth"):
            obj = entry.get(field)
            if not isinstance(obj, dict) or "commentary" not in obj:
                logger.error(
                    f"Profile validation failed: criteria_scores[{i}].{field} missing or no commentary"
                )
                return _ERROR_FALLBACK

    return profile

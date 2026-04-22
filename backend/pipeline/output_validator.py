"""Output validator — checks LLM responses before they reach the learner."""

from loguru import logger

EVALUATIVE_PHRASES = [
    "great job", "well done", "excellent", "perfect", "that's correct",
    "that's wrong", "incorrect", "not quite right", "that's right",
    "you're doing great", "good work", "nice work", "bravo",
]


def validate_output(text: str) -> tuple[str, list[str]]:
    """
    Validate and clean the AI's text response before displaying to the learner.
    
    Returns:
        Tuple of (cleaned_text, list_of_violations)
    """
    violations = []
    text_lower = text.lower()

    # Check for multi-question turns
    question_count = text.count("?")
    if question_count > 2:
        violations.append(f"multi_question: {question_count} questions detected")

    # Check for evaluative language
    for phrase in EVALUATIVE_PHRASES:
        if phrase in text_lower:
            violations.append(f"evaluative_language: '{phrase}'")

    # Check response length (target: under 80 words)
    word_count = len(text.split())
    if word_count > 120:
        violations.append(f"response_too_long: {word_count} words")

    if violations:
        logger.warning(f"Output violations: {violations}")

    # For MVP: log violations but pass through.
    # Future: reject and regenerate, or strip evaluative phrases.
    return text, violations

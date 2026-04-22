"""Learning outcome extraction from source materials using Claude Sonnet."""

import json
from loguru import logger
from services.llm import call_claude

LO_EXTRACTION_PROMPT = """Extract learning outcomes from the following educational materials.

For each learning outcome found verbatim or near-verbatim in the materials, tag it as provenance="extracted" and include the source_excerpt (the text it was derived from).

IMPORTANT: Only synthesize additional learning outcomes if the materials contain FEWER than 3 explicit learning outcomes. If the materials already contain 3 or more explicit learning outcomes, do NOT add any synthesized ones — the instructor has already defined what they want to assess. When in doubt, extract rather than synthesize.

For learning outcomes you synthesize or infer from the materials (implied but not stated), tag them as provenance="synthesized" and set source_excerpt to null.

Also analyze each learning outcome's Bloom's taxonomy complexity:
- "remember/understand" — simple recall or comprehension LOs (define, describe, identify, list)
- "apply" — LOs requiring application to new situations (apply, demonstrate, solve, use)
- "analyze/evaluate/create" — complex reasoning, synthesis, or design LOs (analyze, evaluate, create, design, compare)

Estimate how many minutes each LO would take to assess orally (2-5 minutes typical).

Materials:
{source_text}

Respond with JSON only, no preamble or markdown:
{{
  "learning_outcomes": [
    {{
      "id": "lo_1",
      "text": "...",
      "provenance": "extracted",
      "source_excerpt": "..." ,
      "bloom_level": "remember/understand",
      "estimated_minutes": 3
    }}
  ]
}}"""


async def extract_text_from_file(content: bytes, content_type: str, filename: str) -> str:
    """Extract text from uploaded file based on content type."""
    if content_type == "application/pdf" or filename.lower().endswith(".pdf"):
        import fitz  # PyMuPDF
        doc = fitz.open(stream=content, filetype="pdf")
        text = "\n".join(page.get_text() for page in doc)
        doc.close()
        return text
    elif (content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          or filename.lower().endswith(".docx")):
        from docx import Document
        from io import BytesIO
        doc = Document(BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    else:
        # Plain text fallback
        return content.decode("utf-8", errors="replace")


async def extract_los_from_text(text: str) -> list[dict]:
    """Extract learning outcomes from text using Claude Sonnet.

    Returns list of LO dicts with: id, text, provenance, source_excerpt, bloom_level, estimated_minutes.
    Returns empty list on failure (one-shot; no retry — acceptable for MVP per RESEARCH.md Q1).
    """
    # Truncate very long texts to avoid Claude context issues
    if len(text) > 50000:
        logger.warning(f"Source text truncated from {len(text)} to 50000 chars for LO extraction")
        text = text[:50000]

    prompt = LO_EXTRACTION_PROMPT.format(source_text=text)

    response = await call_claude(
        prompt=prompt,
        system="You are an expert curriculum analyst. Extract learning outcomes with provenance. Respond with JSON only.",
        max_tokens=4096,
    )

    try:
        clean = response.strip().removeprefix("```json").removesuffix("```").strip()
        data = json.loads(clean)
        return data.get("learning_outcomes", [])
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LO extraction JSON: {e}\nResponse: {response[:500]}")
        return []

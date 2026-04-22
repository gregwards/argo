"""LLM adapter for non-pipeline calls (compiler, profiler).

Runtime LLM goes through Pipecat's GoogleLLMService in the pipeline.
This adapter handles the Claude Sonnet calls for compilation and profiling.
"""

import os
from anthropic import AsyncAnthropic
from loguru import logger


async def call_claude(
    prompt: str,
    system: str = "",
    model: str = "claude-sonnet-4-6",
    max_tokens: int = 8192,
) -> str:
    """Call Claude Sonnet for compilation or profiling tasks."""
    client = AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    message = await client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )

    return message.content[0].text

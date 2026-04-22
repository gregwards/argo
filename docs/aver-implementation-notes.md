# Aver: Implementation Best Practices & Compatibility Notes

**Purpose:** Critical notes to read before building. Covers version compatibility, correct import paths, architectural gotchas, and the order of operations that will save time.

---

## 1. Pipecat Version & Import Paths — CRITICAL

Pipecat has reorganized its import structure in recent versions. The spec's import paths need to match the current codebase (v0.0.104+, released March 2026). **Use these exact imports:**

```python
# Transport
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport
# NOT: from pipecat.transports.services.small_webrtc import SmallWebRTCTransport

# Deepgram STT
from pipecat.services.deepgram.stt import DeepgramSTTService
# NOT: from pipecat.services.deepgram import DeepgramSTTService

# Deepgram TTS (when added later)
from pipecat.services.deepgram.tts import DeepgramTTSService

# Google Gemini LLM
from pipecat.services.google.llm import GoogleLLMService
# NOT: from pipecat.services.google import GoogleLLMService
# (Note: the docs page shows `from pipecat.services.google import GoogleLLMService` 
#  but the source code lives at pipecat.services.google.llm — check which works at install time)

# Base transport
from pipecat.transports.base_transport import BaseTransport, TransportParams

# Frames
from pipecat.frames.frames import (
    TranscriptionFrame,
    TextFrame,
    LLMContextFrame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMTextFrame,
    Frame,
)

# Pipeline
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask

# Processors
from pipecat.processors.frame_processor import FrameProcessor, FrameDirection

# Context aggregation
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext

# VAD
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
```

**Install with extras:**
```bash
pip install "pipecat-ai[google,deepgram,silero,webrtc]"
pip install pipecat-ai-small-webrtc-prebuilt  # For the dev test UI
# pip install pipecat-ai-flows              # Not using for MVP — see Section 2
```

**Python version:** 3.10+ required. Recommend 3.12 for performance. Note: there was a fix for async generator cleanup with uvloop on Python 3.12+ (PR #3615) — ensure you're on the latest Pipecat.

---

## 2. Pipecat Flows — Decision: Don't Use, But Adopt Function-Call Pattern

After thorough research, the recommendation is to **not** build on Pipecat Flows but to **adopt its function-call transition pattern** for evaluation.

**Why not Flows:** The deal-breaker is context management. Flows offers three context strategies (APPEND, RESET, RESET_WITH_SUMMARY), none of which support our ephemeral domain window — which requires keeping the transcript while stripping previous domain packets. With APPEND, domain packets accumulate and the security model breaks. With RESET, the transcript is lost. Working around this means bypassing Flows' context management entirely, at which point the framework adds complexity rather than removing it.

**What we adopted from Flows:** The function-call approach for evaluation. Instead of asking the LLM to produce structured XML, we register an `evaluate_response` function that the LLM calls alongside its text response. Function calls are natively supported, structurally validated, and more reliable than XML parsing. This was the key insight from studying Flows.

**Our custom rules engine is simpler than Flows for our use case.** We don't need dynamic function registration/deregistration per node, multi-provider adapters, or action systems. We need: receive evaluation function call, update state, select next node, swap domain window. That's ~150 lines of focused code.

---

## 3. Gemini 2.5 Flash — Thinking Budget Configuration

**Critical for latency:** Gemini 2.5 Flash has a "thinking" feature that adds latency. Pipecat automatically sets `thinking_budget=0` for `gemini-2.5-flash*` models to disable this. However, verify this is working — a recent issue (#3993) notes that the automatic thinking config only applies to 2.5 Flash, not newer Gemini 3 models. If you upgrade models later, you'll need to explicitly set thinking parameters.

```python
# Current correct setup for Gemini 2.5 Flash (thinking auto-disabled by Pipecat)
llm = GoogleLLMService(
    api_key=os.getenv("GOOGLE_API_KEY"),
    model="gemini-2.5-flash",
)

# If you ever switch to Gemini 3 Flash, explicitly set thinking:
llm = GoogleLLMService(
    api_key=os.getenv("GOOGLE_API_KEY"),
    settings=GoogleLLMService.Settings(
        model="gemini-3-flash",
        thinking=GoogleLLMService.GoogleThinkingConfig(
            thinking_level="minimal",
            include_thoughts=False,
        ),
    ),
)
```

---

## 4. SmallWebRTCTransport — Setup Pattern

The standard pattern from Pipecat's examples uses a FastAPI app with an `/api/offer` endpoint for WebRTC signaling. Here's the canonical setup:

```python
# The Pipecat run.py pattern — use this as your starting point
from fastapi import FastAPI
from pipecat_ai_small_webrtc_prebuilt.frontend import SmallWebRTCPrebuiltUI

app = FastAPI()

# Mount prebuilt test UI (development only — replace with your Next.js frontend in production)
app.mount("/prebuilt", SmallWebRTCPrebuiltUI)

@app.post("/api/offer")
async def offer(request: dict):
    # This is where SmallWebRTCTransport's signaling happens
    # Your bot setup code goes here
    pass
```

**Important production notes:**
- SmallWebRTCTransport only supports **one client per transport instance**. Each session needs its own transport instance and pipeline.
- For NAT traversal in production, configure STUN/TURN servers. Google's free STUN (`stun:stun.l.google.com:19302`) works for most cases. TURN is needed only for users behind restrictive corporate firewalls.
- The prebuilt UI is for development only. In production, your Next.js frontend uses `@pipecat-ai/small-webrtc-transport` client SDK.

---

## 5. Deepgram STT — Configuration Notes

```python
from pipecat.services.deepgram.stt import DeepgramSTTService

stt = DeepgramSTTService(
    api_key=os.getenv("DEEPGRAM_API_KEY"),
    # Note: 'url' parameter is DEPRECATED — use 'base_url' if you need to override
)
```

**Endpointing:** Deepgram's endpointing (detecting when the user has stopped speaking) interacts with Pipecat's VAD (Voice Activity Detection). Use both:
- Pipecat's SileroVAD for in-pipeline voice activity detection
- Deepgram's `endpointing` parameter for server-side endpointing

**Domain vocabulary:** For academic terminology, explore Deepgram's `keywords` parameter to boost recognition of domain-specific terms. This can be populated from the session plan's domain vocabulary at session start.

---

## 6. Audio Recording Without Daily

Since we're using SmallWebRTCTransport (peer-to-peer, no server-side recording service), audio recording requires capturing frames in the pipeline. The raw audio passes through the server for STT processing — tap it there.

**Approach:** Create a custom Pipecat processor that copies `InputAudioRawFrame` to a buffer as frames flow through the pipeline. At session end, encode the buffer to WAV/MP3 and upload to S3.

```python
class AudioRecorderProcessor(FrameProcessor):
    def __init__(self):
        super().__init__()
        self.audio_chunks: list[bytes] = []
    
    async def process_frame(self, frame: Frame, direction: FrameDirection):
        if isinstance(frame, InputAudioRawFrame):
            # Capture a copy of the raw audio
            self.audio_chunks.append(frame.audio)
        # Always pass the frame through — recording is passive
        await self.push_frame(frame, direction)
    
    def get_audio_buffer(self) -> bytes:
        return b"".join(self.audio_chunks)
```

Insert this processor early in the pipeline (before STT) so it captures all audio.

---

## 7. Context Window Management

A 15-minute session with 30 turns will accumulate ~15-20K tokens of transcript. With Gemini 2.5 Flash's 1M context window, this isn't a constraint. But keep these practices:

- **Rebuild the system prompt every turn.** The ephemeral domain window changes per turn. Don't append to the previous prompt — build it fresh from the current node's data.
- **Trim old transcript turns.** After a turn has been processed by the rules engine and its evaluation data extracted, the full transcript text can be summarized. Keep the last 5-8 turns verbatim; summarize earlier turns as "Turn 3: learner explained supply/demand mechanism, strong response."
- **Monitor token usage.** Log input/output tokens per turn. Alert if a single turn exceeds 5K input tokens (something is wrong).

---

## 8. Function Call Evaluation — Setup and Verification

The spec uses LLM function calling for evaluation instead of structured XML output. The LLM produces a text response (the utterance to the learner) and calls `evaluate_response()` with structured parameters in the same turn. This is natively supported by Gemini and more reliable than XML parsing.

**Key setup for Gemini function calling in Pipecat:**

Pipecat's GoogleLLMService supports function calling via `register_function()`. The function schema is passed to Gemini as a tool definition. When the LLM calls the function, Pipecat intercepts it and routes to your handler.

```python
# Register in pipeline setup (see pipeline.py)
llm.register_function("evaluate_response", handle_evaluation)
```

**What to verify in Phase 1, Step 5:**

1. Does Gemini Flash reliably call `evaluate_response()` on every turn when instructed to in the system prompt? Test with 20+ turns.
2. Does it produce both a text response AND a function call in the same turn? (This is called "parallel function calling" — Gemini supports it but verify.)
3. Are the function call parameters well-formed and matching the schema?
4. What happens when the LLM skips the function call? (Your rules engine should handle missing evaluations gracefully — log the gap, continue without updating state for that turn.)

**Fallback if function calling is unreliable:** If Gemini Flash doesn't reliably produce both text and a function call per turn, you have two options: (a) switch to a model with stronger function calling (Claude Haiku or GPT-4o mini — both more expensive but more reliable), or (b) make the evaluation call a second inference after the text response (adds latency but guarantees structure). Option (a) is preferred.

---

## 9. Session State Persistence

Sessions are stateful and long-running (10-20 minutes). If the server crashes mid-session, the state is lost. For MVP this is acceptable, but implement defensive practices:

- **Checkpoint every N turns.** Every 5 turns, serialize the session state to Postgres. If the server restarts, you can't resume the conversation (the WebRTC connection is dead) but you have partial data for debugging.
- **Session timeout handling.** Use Pipecat's `session_timeout` parameter on the transport. If the student disconnects and doesn't return within 2 minutes, end the session gracefully and save whatever state exists.
- **Graceful shutdown.** Handle SIGTERM in your Docker container to end active sessions cleanly before the process dies.

---

## 10. Build Phase 1 — Specific Steps

Phase 1 is: "Get a voice conversation working with hardcoded questions." Here's the exact sequence:

**Step 1: Scaffold the project**
```bash
mkdir aver && cd aver
mkdir -p backend frontend

# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install "pipecat-ai[google,deepgram,silero,webrtc]"
pip install pipecat-ai-small-webrtc-prebuilt
pip install fastapi uvicorn python-dotenv

# Create .env with API keys (GOOGLE_API_KEY, DEEPGRAM_API_KEY)
```

**Step 2: Minimal bot with prebuilt UI**

Start with Pipecat's foundational example pattern. Get audio in → STT → hardcoded LLM response → text display working. Use the SmallWebRTC prebuilt test UI (not your Next.js frontend yet).

**Step 3: Add Gemini Flash as the LLM**

Replace the hardcoded response with a Gemini Flash call. System prompt: "You are an assessment agent. Ask the student to explain supply and demand." Verify latency is under 1.5 seconds end-to-end.

**Step 4: Test the conversation register**

Have a 5-minute conversation with the bot. Evaluate:
- Does it feel like talking to a sharp professor or a chatbot?
- Is the turn-taking natural? Does it wait long enough for thinking but not too long?
- Does it ask one question at a time?
- Does it maintain conversational context across turns?

**Step 5: Test function calling for evaluation**

Register the `evaluate_response` function with Gemini Flash. Run 20+ turns and verify: (a) the LLM calls the function on every turn, (b) it produces both a text response and a function call simultaneously, (c) the function parameters are well-formed and match the schema. If the LLM frequently skips the function call or produces malformed parameters, evaluate Claude Haiku or GPT-4o mini as alternatives before proceeding to Phase 2.

---

## 11. Frontend Notes

**Pipecat client SDK installation:**
```bash
npm install @pipecat-ai/client-js @pipecat-ai/small-webrtc-transport
```

**The client SDK handles:**
- WebRTC connection setup and management
- Microphone capture and audio streaming
- Receiving bot text/audio responses
- Connection state management

**What you build on top:**
- The transcript display component (render messages as they arrive via events)
- Session UI (timer, phase indicator, controls)
- Pre-session equipment check (mic permission, test audio)

**Don't build the frontend until Phase 4.** Phases 1-3 use the Pipecat prebuilt test UI. This is intentional — get the backend right before investing in the client.

---

## 12. Database Migration Strategy

Use Alembic for database migrations from day one. Even though you're the only developer, schema changes will happen frequently as you iterate on the belief model, competency state, and session plan structures. JSONB columns give you flexibility, but the relational structure (users, courses, assessments, sessions, profiles) should be migrated properly.

```bash
pip install alembic
alembic init db/migrations
# Configure alembic.ini to point to your DATABASE_URL
```

---

## 13. LLM Adapter Pattern

The spec uses Gemini for runtime, Claude for compilation and profiling. Wrap these behind a thin adapter so model swaps are config changes:

```python
# backend/services/llm.py

class LLMAdapter:
    """Thin wrapper for LLM calls. Swap models via config, not code."""
    
    @staticmethod
    async def runtime_completion(messages: list[dict], **kwargs) -> str:
        """Used by the voice pipeline. Latency-critical."""
        # Currently: Gemini 2.5 Flash via Pipecat's GoogleLLMService
        # Swappable to: GPT-4o mini, Claude Haiku
        pass
    
    @staticmethod
    async def compile(prompt: str, **kwargs) -> str:
        """Used by session plan compiler. Quality-critical."""
        # Currently: Claude Sonnet 4.6
        client = anthropic.AsyncAnthropic()
        response = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=8192,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text
    
    @staticmethod
    async def profile(prompt: str, **kwargs) -> str:
        """Used by profiler. Quality-critical."""
        # Currently: Claude Sonnet 4.6 (same as compiler)
        pass
```

Note: The runtime LLM goes through Pipecat's pipeline (GoogleLLMService), not through this adapter. The adapter is for the non-pipeline calls (compilation, profiling).

---

## 14. Key Dependency Versions to Pin

```
# requirements.txt — pin major versions to avoid breaking changes
pipecat-ai>=0.0.104
pipecat-ai-small-webrtc-prebuilt>=2.1.0
fastapi>=0.115.0
uvicorn>=0.32.0
sqlalchemy>=2.0.0
alembic>=1.14.0
asyncpg>=0.30.0
anthropic>=0.42.0
python-dotenv>=1.0.0
pyjwt>=2.12.0      # CRITICAL: versions <=2.11.0 have CVE-2026-32597
boto3>=1.35.0       # For S3
```

---

## 15. Common Gotchas from Pipecat Changelog

Issues fixed in recent versions that you should be aware of:

1. **SmallWebRTCTransport audio resampling** (PR #3698): Fixed to handle all sample rates including 8kHz. Make sure you're on a version that includes this fix.

2. **Audio overlap with rapid turns** (PR #4071): TTS now flushes remaining text before pausing on new frames. Relevant when you add TTS later.

3. **PyJWT vulnerability** (CVE-2026-32597): Pin PyJWT >= 2.12.0. The LiveKit extra previously pulled in a vulnerable version.

4. **uvloop async generator cleanup** (PR #3615): Fixed AttributeError with uvloop on Python 3.12+. If you see sporadic errors on shutdown, ensure you have the latest Pipecat.

5. **Context aggregator deprecations**: `create_context_aggregator()` parameters changed from `user_kwargs`/`assistant_kwargs` to `user_params`/`assistant_params`. The old names are removed.

6. **Service import reorganization**: Services moved into subpackages (e.g., `pipecat.services.deepgram.stt` instead of `pipecat.services.deepgram`). Check imports against the current source if you get ImportErrors.

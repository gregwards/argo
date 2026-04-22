# Phase 1 Voice Loop — Diagnostic Report

## Goal

Get a working voice loop: browser mic → Deepgram STT → Gemini Flash → text response displayed in browser.

## What works

- **Pipecat pipeline runs correctly.** STT transcribes speech, Gemini produces text responses, the evaluate_response function call works with `run_llm=True` triggering a second LLM call for text.
- **The prebuilt UI connects.** WebRTC negotiation succeeds, audio flows from browser to server, the client shows "connected" and "ready" states.
- **User transcription displays.** The prebuilt UI shows what the user says (via RTVI `user-transcription` events in the events panel).
- **Function call events display.** The prebuilt UI shows "Function Call ✓" when Gemini calls `evaluate_response`.
- **Bot-ready message gets through.** After a manual data channel flush workaround, the `bot-ready` RTVI message reaches the client.
- **`bot-llm-text` RTVI messages are produced.** The RTVI observer converts `LLMTextFrame`s into `bot-llm-text` transport messages. These flow through the pipeline as `OutputTransportMessageUrgentFrame`.

## What doesn't work

**Bot text responses never appear in the prebuilt UI.** The user sees their own transcription and function call events, but never sees what the bot says back.

## Root cause analysis

There are two separate issues that we partially solved, but a third remains:

### Issue 1: Gemini produces function calls without text (SOLVED)

**Problem:** When the `evaluate_response` tool is registered, Gemini generates ONLY a function call on each turn — no text alongside it. The system prompt instructs it to do both, but Gemini's function calling mode splits them into separate turns.

**Fix applied:** `FunctionCallResultProperties(run_llm=True)` in the callback. After the function call completes, Pipecat re-invokes the LLM, which then produces text. This adds ~0.7-1.5s latency (a second LLM call) but works.

**Status:** Working. Logs confirm `LLMTextFrame`s are produced after function calls.

### Issue 2: Data channel race condition (PARTIALLY SOLVED)

**Problem:** Pipecat's `SmallWebRTCConnection` registers `channel.on("open")` inside `on("datachannel")`, but by the time that callback fires the channel is already open. The "open" event never fires again, so `_flush_message_queue()` is never called. Initial RTVI messages (including `bot-ready`) get stuck in the queue.

**Fix applied:** Manual flush in `on_client_connected` handler:
```python
async def flush_data_channel():
    await asyncio.sleep(0.5)
    conn = transport._client._webrtc_connection
    if conn._data_channel and conn._data_channel.readyState == "open":
        conn._flush_message_queue()
```

**Status:** Partially working. The flush sends queued messages (bot-ready gets through). But subsequent messages sent via `send_app_message` after the flush also appear to work (no "not ready" log for them). The `bot-llm-text` transport messages pass through the pipeline and presumably reach the output transport's `send_message` which calls `send_app_message` — and since there's no "not ready" log for them, they are likely being sent.

### Issue 3: Prebuilt UI doesn't display bot-llm-text (UNSOLVED)

**Problem:** Even though `bot-llm-text` RTVI messages are being generated and (likely) sent over the data channel, the prebuilt UI does not display them. The UI's events panel shows `botReady`, `userTranscription`, `functionCall`, and other events — but no `botLlmText` entries.

**Possible explanations:**
1. **The prebuilt UI doesn't render `bot-llm-text` in the events panel.** It may require a separate transcript component that isn't part of the default prebuilt layout. The minified JS contains `"botLlmText"` and `"Transcript"` strings, but no transcript panel is visible.
2. **The messages are not actually reaching the client.** Despite no "not ready" log, the data channel might be silently failing. The `send_app_message` method calls `self._data_channel.send(json_message)` when `readyState == "open"` — but aiortc's send might fail silently.
3. **The RTVI protocol version mismatch.** The client reports v1.2.0, the server uses Pipecat's built-in RTVI. There might be a message format difference.

## Fixes attempted (chronological)

| # | What | Result |
|---|------|--------|
| 1 | Created `bot.py` using Pipecat's built-in runner | Server runs, UI connects |
| 2 | Fixed `DeepgramSTTService` — `LiveOptions` object instead of dict | STT works |
| 3 | Fixed tool schema — `ToolsSchema` + `FunctionSchema` instead of OpenAI format | Function calls work |
| 4 | Set `audio_out_enabled=True` | Connection fully establishes |
| 5 | Returned truthy value from function call callback | `run_llm` triggered but Gemini just called function again |
| 6 | Removed evaluation tool entirely | No function calls, but no text displayed either |
| 7 | Restored tool with `FunctionCallResultProperties(run_llm=True)` | Second LLM call produces text |
| 8 | Updated prompt to request text + function call together | Gemini still splits them |
| 9 | Raised VAD `min_volume` 0.3→0.5, lowered `stop_secs` 3.0→1.5 | Less false interruptions |
| 10 | Set `allow_interruptions=False` | Stopped cascade of cancelled responses |
| 11 | Added manual data channel flush (wrong path: `transport._client`) | AttributeError |
| 12 | Fixed path: `transport._client._webrtc_connection` | Flush works, bot-ready gets through |
| 13 | Added `FrameLogger` to pipeline | Confirmed LLMTextFrames and RTVI transport messages exist |
| 14 | Sent test `bot-llm-text` message directly on data channel | Didn't appear in UI |

## Current state of bot.py

- Uses Pipecat's built-in runner (`pipecat.runner.run.main`) with `-t webrtc`
- Pipeline: `transport.input → STT → user_agg → LLM → FrameLogger → assistant_agg → transport.output`
- Evaluation function registered with `run_llm=True` result
- `allow_interruptions=False`
- VAD: `min_volume=0.5`, `stop_secs=1.5`
- Manual data channel flush 0.5s after connection
- FrameLogger confirms text frames and transport messages flow correctly

## Recommended next steps

1. **Verify messages reach the browser.** Open browser DevTools → Network → WS tab (or check the RTCDataChannel). Look for incoming messages with type `bot-llm-text`. This definitively answers whether the server is sending or the client is ignoring.

2. **Try the Next.js frontend instead of the prebuilt UI.** The prebuilt UI is a generic Pipecat test tool — it may not render text-only bot responses. The Aver frontend (`frontend/app/assess/[sessionId]/page.tsx`) uses `@pipecat-ai/client-js` and has explicit transcript rendering. Getting that working may be the faster path.

3. **Add TTS.** The prebuilt UI is designed for voice bots. Adding even a simple TTS (Deepgram Aura or Google TTS) would make the bot produce audio, which the prebuilt UI is built to play. The bot text would also appear in the transcript. This was deferred for MVP but may be the simplest way to make the prebuilt UI work as expected.

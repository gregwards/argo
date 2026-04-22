"""Session runner — assembles and runs the Pipecat voice pipeline."""

import asyncio
import os
from datetime import datetime
from typing import Optional

from loguru import logger
from sqlalchemy import select

from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask, PipelineParams
try:
    from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
except ModuleNotFoundError:
    from pipecat.processors.aggregators.llm_context import LLMContext as OpenAILLMContext
from pipecat.services.deepgram.stt import DeepgramSTTService, LiveOptions
from pipecat.services.inworld.tts import InworldTTSService
from pipecat.services.google.llm import GoogleLLMService
from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.adapters.schemas.tools_schema import ToolsSchema
from pipecat.transports.daily.transport import DailyTransport, DailyParams
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.audio.filters.rnnoise_filter import RNNoiseFilter

from db.database import async_session, Session as SessionModel, Assessment, CompetencyProfile
from pipeline.audio_recorder import AudioRecorderProcessor
from pipeline.evaluation_schema import EVALUATE_RESPONSE_SCHEMA
from pipeline.recording_storage import save_recording
from pipeline.rules_engine import RulesEngine
from pipeline.prompts import PHASE1_TEST_PROMPT
from profiler.profiler import generate_profile


def _backfill_transcript_from_context(rules_engine, context):
    """Reconstruct transcript from LLM context messages if rules engine didn't capture it."""
    if rules_engine.state.transcript:
        return  # Already has transcript data
    try:
        # Try both .messages property and get_messages() method
        messages = []
        if hasattr(context, 'get_messages'):
            messages = context.get_messages()
        elif hasattr(context, 'messages'):
            messages = context.messages

        logger.debug(f"Backfill: found {len(messages)} context messages")
        if messages:
            # Log first message structure for debugging
            first = messages[0]
            logger.debug(f"Backfill: first message type={type(first)}, keys={first.keys() if isinstance(first, dict) else 'N/A'}")
            if isinstance(first, dict) and 'content' in first:
                logger.debug(f"Backfill: using OpenAI format (content key)")

        turn = 0
        for msg in messages:
            if not isinstance(msg, dict):
                continue
            role = msg.get("role", "")

            # Handle both Google format (parts) and OpenAI format (content)
            text = None
            if "parts" in msg:
                for part in msg["parts"]:
                    if isinstance(part, dict) and "text" in part:
                        text = part["text"]
                        break
                    elif isinstance(part, str):
                        text = part
                        break
                # Skip function call/response parts
                for part in msg.get("parts", []):
                    if isinstance(part, dict) and ("function_call" in part or "function_response" in part):
                        text = None
                        break
            elif "content" in msg:
                content = msg["content"]
                if isinstance(content, str):
                    text = content
                elif isinstance(content, list):
                    for item in content:
                        if isinstance(item, dict) and item.get("type") == "text":
                            text = item.get("text", "")
                            break

            if not text:
                continue

            # Map roles
            if role in ("user",):
                # Skip system prompt (first user message, usually long)
                if turn == 0 and len(text) > 200:
                    continue
                turn += 1
                rules_engine.state.transcript.append({
                    "turn": turn, "role": "learner", "text": text,
                    "timestamp": None,
                })
                rules_engine.state.turn_count = turn
            elif role in ("model", "assistant"):
                rules_engine.state.transcript.append({
                    "turn": turn, "role": "ai", "text": text,
                    "timestamp": None,
                })

        logger.info(f"Backfilled transcript from context: {len(rules_engine.state.transcript)} entries, {turn} turns")
    except Exception as e:
        logger.error(f"Transcript backfill failed: {e}")


async def persist_session_state(session_id: str, state_dict: dict):
    """Fire-and-forget write of session state to Postgres (D-11, D-12).

    Creates a fresh DB session -- never reuse the request-scoped session (Pitfall 1).
    """
    try:
        async with async_session() as db:
            result = await db.execute(
                select(SessionModel).where(SessionModel.id == session_id)
            )
            row = result.scalar_one_or_none()
            if row:
                row.transcript = state_dict.get("transcript", [])
                row.competency_state = state_dict.get("competency_state", {})
                row.belief_model = state_dict.get("belief_model", {})
                row.evaluation_log = state_dict.get("evaluation_log", [])
                row.turn_count = state_dict.get("turn_count", 0)
                await db.commit()
    except Exception as e:
        logger.error(f"Failed to persist session state for {session_id}: {e}")


async def finalize_session(session_id: str, state_dict: dict):
    """Write final state and mark session completed (SESS-12)."""
    try:
        async with async_session() as db:
            result = await db.execute(
                select(SessionModel).where(SessionModel.id == session_id)
            )
            row = result.scalar_one_or_none()
            if row:
                row.status = "completed"
                row.transcript = state_dict.get("transcript", [])
                row.competency_state = state_dict.get("competency_state", {})
                row.belief_model = state_dict.get("belief_model", {})
                row.evaluation_log = state_dict.get("evaluation_log", [])
                row.turn_count = state_dict.get("turn_count", 0)
                row.flags = state_dict.get("flags", [])
                row.key_moments = state_dict.get("key_moments", [])
                from datetime import timezone
                now = datetime.now(timezone.utc)
                row.completed_at = now
                if row.started_at:
                    started = row.started_at if row.started_at.tzinfo else row.started_at.replace(tzinfo=timezone.utc)
                    row.duration_seconds = int((now - started).total_seconds())
                await db.commit()
                logger.info(
                    f"Session {session_id} finalized: {row.turn_count} turns, {row.duration_seconds}s"
                )
    except Exception as e:
        logger.error(f"Failed to finalize session {session_id}: {e}")


async def _update_recording_ref(session_id: str, recording_ref: str):
    """Persist the storage reference for a session's audio recording."""
    try:
        async with async_session() as db:
            result = await db.execute(
                select(SessionModel).where(SessionModel.id == session_id)
            )
            row = result.scalar_one_or_none()
            if row:
                row.recording_ref = recording_ref
                await db.commit()
                logger.info(f"Recording ref saved for session {session_id}: {recording_ref}")
    except Exception as e:
        logger.error(f"Failed to update recording_ref for {session_id}: {e}")


async def _run_profiler(session_id: str):
    """Load session data and generate profile post-disconnect."""
    try:
        async with async_session() as db:
            # Skip if profile already exists (prevents duplicate from race conditions)
            existing = await db.execute(
                select(CompetencyProfile).where(CompetencyProfile.session_id == session_id)
            )
            if existing.scalar_one_or_none():
                logger.info(f"Profiler: profile already exists for session {session_id}, skipping")
                return

            result = await db.execute(
                select(SessionModel).where(SessionModel.id == session_id)
            )
            session_row = result.scalar_one_or_none()
            if not session_row:
                logger.error(f"Profiler: session {session_id} not found")
                return

            result = await db.execute(
                select(Assessment).where(Assessment.id == session_row.assessment_id)
            )
            assessment = result.scalar_one_or_none()
            if not assessment:
                logger.error(f"Profiler: assessment not found for session {session_id}")
                return

            profile_data = await generate_profile(
                transcript=session_row.transcript or [],
                competency_state=session_row.competency_state or {},
                belief_model=session_row.belief_model or {},
                evaluation_log=session_row.evaluation_log or [],
                key_moments=session_row.key_moments or [],
                rubric=assessment.rubric or [],
                learning_outcomes=assessment.learning_outcomes or [],
            )

            # Store criteria_scores (not legacy competency_map) per plan acceptance criteria
            criteria_scores = profile_data.get("criteria_scores", profile_data.get("competency_map", []))
            profile = CompetencyProfile(
                session_id=session_row.id,
                assessment_id=session_row.assessment_id,
                student_id=session_row.student_id,
                criteria_scores=criteria_scores,
                narrative_assessment=profile_data.get("narrative_assessment", ""),
                strengths=profile_data.get("strengths", []),
                growth_areas=profile_data.get("growth_areas", []),
                belief_model_notes=profile_data.get("belief_model_notes", ""),
                profiler_model="claude-sonnet-4",
            )
            db.add(profile)
            await db.commit()
            logger.info(f"Profile generated for session {session_id}")
    except Exception as e:
        logger.error(f"Profiler failed for session {session_id}: {e}")


async def run_bot(room_url: str, bot_token: str, session_id: str, session_plan: Optional[dict] = None, tts_enabled: bool = True, **kwargs):
    """Assemble the Pipecat pipeline and run the assessment session."""
    logger.info(f"Starting bot for session {session_id} (tts={'on' if tts_enabled else 'off'})")

    try:
        await _run_bot_inner(room_url, bot_token, session_id, session_plan, tts_enabled, **kwargs)
    except Exception as e:
        logger.error(f"Bot crashed for session {session_id}: {e}", exc_info=True)
        # Mark session as error so it doesn't stay "active" forever
        try:
            async with async_session() as db:
                result = await db.execute(select(SessionModel).where(SessionModel.id == session_id))
                sess = result.scalar_one_or_none()
                if sess and sess.status not in ("completed", "error"):
                    sess.status = "error"
                    await db.commit()
                    logger.info(f"Session {session_id} marked as error")
        except Exception as db_err:
            logger.error(f"Failed to mark session {session_id} as error: {db_err}")


async def _run_bot_inner(room_url: str, bot_token: str, session_id: str, session_plan: Optional[dict] = None, tts_enabled: bool = True, **kwargs):
    """Inner bot logic — separated so run_bot can wrap with top-level exception handling."""
    transport = DailyTransport(
        room_url,
        bot_token,
        "Argo",
        DailyParams(
            audio_in_enabled=True,
            audio_out_enabled=tts_enabled,
            audio_in_filter=RNNoiseFilter() if tts_enabled else None,
            vad_analyzer=SileroVADAnalyzer(params=VADParams(min_volume=0.5, stop_secs=5.0)),
        ),
    )

    async def on_criterion_advance(current: int, total: int):
        try:
            transport._client._client.send_app_message(
                {
                    "label": "rtvi-ai",
                    "type": "server-message",
                    "data": {"type": "criterion_advance", "current_criterion": current, "total_criteria": total},
                },
                None,
            )
            logger.debug(f"Criterion advance sent: {current}/{total}")
        except Exception as e:
            logger.warning(f"Could not send criterion advance: {e}")

    rules_engine = RulesEngine(session_plan=session_plan, on_criterion_advance=on_criterion_advance)

    # Audio recorder — passively captures student audio before STT consumes frames
    audio_recorder = AudioRecorderProcessor(sample_rate=16000, channels=1)

    # STT — 6000ms endpointing gives students time to pause mid-thought
    stt = DeepgramSTTService(
        api_key=os.getenv("DEEPGRAM_API_KEY"),
        live_options=LiveOptions(language="en", model="nova-2", interim_results=True, endpointing=6000),
    )

    # LLM
    llm = GoogleLLMService(model="gemini-2.5-flash", api_key=os.getenv("GOOGLE_API_KEY"))

    # TTS — Inworld streaming WebSocket (high quality, low latency)
    tts = None
    if tts_enabled:
        tts = InworldTTSService(
            api_key=os.getenv("INWORLD_TTS_API_KEY"),
            voice_id="Jessica",
            model="inworld-tts-1.5-max",
        )
        logger.info(f"TTS enabled for session {session_id} (inworld jessica)")

    # Smart turn detection: be patient with stalling/hedging language
    from pipecat.processors.aggregators.llm_response_universal import UserTurnCompletionConfig
    llm.set_user_turn_completion_config(UserTurnCompletionConfig(
        incomplete_short_timeout=6.0,
        incomplete_long_timeout=10.0,
        instructions=(
            "This is an oral assessment. The student is being evaluated and may need "
            "time to formulate their thoughts. Treat the following as INCOMPLETE turns "
            "that need more time: stalling phrases ('let me think about that', 'that's "
            "a good question', 'hmm', 'so basically', 'well'), short acknowledgments "
            "('yeah', 'ok', 'right'), and any response that sounds like the student is "
            "about to elaborate. Only mark a turn as complete when the student has clearly "
            "finished making a substantive point and has fallen silent."
        ),
    ))

    # Track AI text for transcript — accumulates chunks until evaluation fires
    ai_text_buffer = []

    # Register evaluation function call
    # Pipecat 1.0.0: handler receives a single FunctionCallParams object
    async def handle_evaluation(params):
        # Feed any accumulated AI text into transcript before processing evaluation
        if ai_text_buffer:
            full_ai_text = "".join(ai_text_buffer)
            ai_text_buffer.clear()
            rules_engine.on_ai_turn(full_ai_text)
        # Extract learner text from the LLM context (last user message before this function call)
        try:
            messages = params.context.messages if hasattr(params.context, 'messages') else []
            # Walk backwards to find the last user message
            for msg in reversed(messages):
                role = msg.get("role", "")
                if role == "user":
                    parts = msg.get("parts", [])
                    for part in parts:
                        if isinstance(part, dict) and "text" in part:
                            rules_engine.on_learner_turn(part["text"])
                            break
                    break
        except Exception:
            pass  # Transcript tracking is best-effort
        try:
            rules_engine.on_evaluation(params.arguments)
        except Exception as e:
            logger.error(f"Evaluation processing error: {e}")
        # D-12: fire-and-forget DB write -- do NOT await
        asyncio.create_task(persist_session_state(session_id, rules_engine.state.to_dict()))

        # Send section progress event based on response quality
        # Send section progress event
        try:
            quality = params.arguments.get("response_quality", "weak")
            next_action = params.arguments.get("next_action", "follow_up")
            quality_weights = {"strong": 3, "partial": 2, "weak": 1, "silence": 0.5}
            weight = quality_weights.get(quality, 1)
            if next_action == "advance":
                weight += 1

            # Determine section index — mirrors /connect logic
            current_node_id = rules_engine.state.current_node_id
            nodes = (session_plan or {}).get("nodes", {})
            current_node = nodes.get(current_node_id, {})
            current_lo = current_node.get("learning_outcome_id", "")

            # Build section list matching /connect: multiple LOs → LOs, single LO → criteria
            sorted_keys = sorted(nodes.keys(), key=lambda k: int(k.replace("node_", "")) if k.startswith("node_") else 0)
            seen_los = []
            for key in sorted_keys:
                lo_id = nodes[key].get("learning_outcome_id", "")
                if lo_id and lo_id not in seen_los:
                    seen_los.append(lo_id)

            if len(seen_los) == 1:
                # Single LO: sections = criteria
                seen_criteria = []
                for key in sorted_keys:
                    cn = nodes[key].get("criteria_name", "")
                    if cn and cn not in seen_criteria:
                        seen_criteria.append(cn)
                current_crit = current_node.get("criteria_name", "")
                section_index = seen_criteria.index(current_crit) if current_crit in seen_criteria else 0
            else:
                # Multiple LOs: sections = LOs
                section_index = seen_los.index(current_lo) if current_lo in seen_los else 0

            # Belief model floor: understanding_level sets minimum progress
            belief = rules_engine.state.belief_model.get(current_lo, {})
            understanding = belief.get("understanding_level", "unknown")
            floor_map = {"strong": 0.8, "partial": 0.4, "weak": 0.0, "unknown": 0.0}
            floor = floor_map.get(understanding, 0.0)

            transport._client._client.send_app_message(
                {
                    "label": "rtvi-ai",
                    "type": "server-message",
                    "data": {
                        "type": "section_progress",
                        "section_index": section_index,
                        "weight": weight,
                        "floor": floor,
                    },
                },
                None,
            )
        except Exception as e:
            logger.warning(f"Could not send progress event: {e}")

        # Check if session should end (all criteria done or time limit)
        if rules_engine.should_end_session():
            logger.info(f"Session {session_id} ending — delivering closing statement")
            await params.result_callback(
                "The assessment is now complete. Deliver a closing statement with this structure: "
                "(1) Two to three sentences summarizing what you learned about the student's understanding — "
                "mention their strongest areas specifically, referencing topics they handled well. "
                "Keep it warm but factual, not evaluative. "
                "(2) One sentence confirming the session is over: say that their competency profile "
                "will be available shortly. "
                "(3) End with exactly the phrase 'This concludes the assessment.' "
                "Do not ask any more questions."
            )
            # Schedule auto-disconnect after 5s (gives AI time to deliver closing + 3s buffer)
            async def _delayed_end():
                await asyncio.sleep(5)
                logger.info(f"Auto-ending session {session_id}")
                await task.cancel()
            asyncio.create_task(_delayed_end())
        else:
            await params.result_callback("Now respond to the learner.")

    llm.register_function("evaluate_response", handle_evaluation)

    # Context with system prompt + evaluation tool
    eval_func = FunctionSchema(
        name=EVALUATE_RESPONSE_SCHEMA["name"],
        description=EVALUATE_RESPONSE_SCHEMA["description"],
        properties=EVALUATE_RESPONSE_SCHEMA["parameters"]["properties"],
        required=EVALUATE_RESPONSE_SCHEMA["parameters"]["required"],
    )
    tools = ToolsSchema(standard_tools=[eval_func])
    system_prompt = PHASE1_TEST_PROMPT if not session_plan else rules_engine._build_system_prompt()

    context = OpenAILLMContext(
        messages=[{"role": "system", "content": system_prompt}],
        tools=tools,
    )
    try:
        context_aggregator = llm.create_context_aggregator(context)
    except AttributeError:
        from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
        context_aggregator = LLMContextAggregatorPair(context=context)

    # Pipeline — audio_recorder must precede stt so it sees frames before STT consumes them
    # Criterion advancement sent via transport data channel (send_app_message)
    # rather than RTVIProcessor which blocks the client connection handshake.
    # When TTS is enabled, it sits between LLM and context_aggregator.assistant()
    # to convert text frames into audio frames for WebRTC output.
    processors = [
        transport.input(),
        audio_recorder,   # Passively copies audio frames before STT consumes them
        stt,
        context_aggregator.user(),
        llm,
    ]
    if tts:
        processors.append(tts)
    processors.extend([
        context_aggregator.assistant(),
        transport.output(),
    ])
    pipeline = Pipeline(processors)

    task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True, enable_metrics=True))

    @transport.event_handler("on_first_participant_joined")
    async def on_connected(transport, participant):
        logger.info(f"Participant joined: session {session_id}")
        # Pipecat 1.0.0: get_context_frame() renamed to _get_context_frame()
        user_agg = context_aggregator.user()
        ctx_frame = user_agg._get_context_frame() if hasattr(user_agg, '_get_context_frame') else user_agg.get_context_frame()
        await task.queue_frames([ctx_frame])

    session_finalized = False

    @transport.event_handler("on_participant_left")
    async def on_disconnected(transport, participant, reason):
        nonlocal session_finalized
        logger.info(f"Client disconnected: session {session_id}")
        await task.cancel()

    runner = PipelineRunner()
    await runner.run(task)
    logger.info(f"Session {session_id} complete: {rules_engine.state.turn_count} turns")

    # Finalize once after pipeline exits — whether triggered by participant leaving,
    # time limit, or server-side cancel. This avoids race conditions between
    # on_participant_left, the fallback, and asyncio.create_task profiler scheduling.
    if not session_finalized:
        session_finalized = True
        _backfill_transcript_from_context(rules_engine, context)
        state_dict = rules_engine.state.to_dict()
        # Skip finalization if this bot instance captured no turns (lost race with duplicate bot)
        if rules_engine.state.turn_count == 0 and not state_dict.get("transcript"):
            logger.warning(f"Session {session_id}: 0 turns captured — skipping finalize (likely duplicate bot)")
            return
        await finalize_session(session_id, state_dict)
        wav_bytes = audio_recorder.get_wav_bytes()
        if wav_bytes and len(wav_bytes) > 44:
            recording_ref = await save_recording(session_id, wav_bytes)
            if recording_ref:
                await _update_recording_ref(session_id, recording_ref)
        await _run_profiler(session_id)

    return rules_engine.state

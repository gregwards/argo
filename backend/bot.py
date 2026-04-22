"""Phase 1 voice loop bot — Pipecat built-in runner with SmallWebRTC.

Run with:  python bot.py -t webrtc
Opens prebuilt UI at http://localhost:7860
"""

import asyncio
import os
import sys

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from loguru import logger

from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask, PipelineParams
try:
    from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
except ModuleNotFoundError:
    from pipecat.processors.aggregators.llm_context import LLMContext as OpenAILLMContext
from pipecat.services.deepgram.stt import DeepgramSTTService, LiveOptions
from pipecat.services.google.llm import GoogleLLMService
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport
from pipecat.transports.base_transport import TransportParams
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.runner.types import SmallWebRTCRunnerArguments
from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.adapters.schemas.tools_schema import ToolsSchema
from pipecat.frames.frames import FunctionCallResultProperties

from pipecat.processors.frame_processor import FrameProcessor
from pipecat.frames.frames import Frame, TextFrame, LLMTextFrame, LLMFullResponseStartFrame, LLMFullResponseEndFrame

from pipeline.evaluation_schema import EVALUATE_RESPONSE_SCHEMA
from pipeline.prompts import PHASE1_TEST_PROMPT


from pipecat.frames.frames import OutputTransportMessageFrame, OutputTransportMessageUrgentFrame

class FrameLogger(FrameProcessor):
    async def process_frame(self, frame: Frame, direction):
        await super().process_frame(frame, direction)
        if isinstance(frame, (TextFrame, LLMTextFrame, LLMFullResponseStartFrame, LLMFullResponseEndFrame)):
            logger.info(f"FRAME_LOG: {type(frame).__name__}: {getattr(frame, 'text', '')[:100]}")
        if isinstance(frame, (OutputTransportMessageFrame, OutputTransportMessageUrgentFrame)):
            logger.info(f"FRAME_LOG: TRANSPORT_MSG: {str(frame.message)[:200]}")
        await self.push_frame(frame, direction)


async def bot(runner_args: SmallWebRTCRunnerArguments):
    """Pipecat bot entry point — called by the built-in runner for each connection."""
    logger.info("Bot started — assembling pipeline")

    transport = SmallWebRTCTransport(
        webrtc_connection=runner_args.webrtc_connection,
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            vad_enabled=True,
            vad_analyzer=SileroVADAnalyzer(params=VADParams(min_volume=0.5, stop_secs=1.5)),
        ),
    )

    # STT
    stt = DeepgramSTTService(
        api_key=os.getenv("DEEPGRAM_API_KEY"),
        live_options=LiveOptions(language="en", model="nova-2", interim_results=True, endpointing=300),
    )

    # LLM
    llm = GoogleLLMService(model="gemini-2.5-flash", api_key=os.getenv("GOOGLE_API_KEY"))

    # Register evaluation function handler — run_llm=True tells Pipecat to
    # re-invoke the LLM after the function call so Gemini produces text
    async def handle_evaluation(function_name, tool_call_id, args, llm, context, result_callback):
        logger.info(f"Evaluation: quality={args.get('response_quality')}, action={args.get('next_action')}")
        await result_callback(
            {"status": "ok"},
            properties=FunctionCallResultProperties(run_llm=True),
        )

    llm.register_function("evaluate_response", handle_evaluation)

    # Context with system prompt + evaluation tool
    eval_func = FunctionSchema(
        name=EVALUATE_RESPONSE_SCHEMA["name"],
        description=EVALUATE_RESPONSE_SCHEMA["description"],
        properties=EVALUATE_RESPONSE_SCHEMA["parameters"]["properties"],
        required=EVALUATE_RESPONSE_SCHEMA["parameters"]["required"],
    )
    tools = ToolsSchema(standard_tools=[eval_func])
    context = OpenAILLMContext(
        messages=[{"role": "system", "content": PHASE1_TEST_PROMPT}],
        tools=tools,
    )
    context_aggregator = llm.create_context_aggregator(context)

    # Pipeline: mic → STT → LLM → frame logger → text output
    frame_logger = FrameLogger()
    pipeline = Pipeline([
        transport.input(),
        stt,
        context_aggregator.user(),
        llm,
        frame_logger,
        context_aggregator.assistant(),
        transport.output(),
    ])

    task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=False, enable_metrics=True))

    @transport.event_handler("on_client_connected")
    async def on_connected(transport, client):
        logger.info("Client connected")

        # Workaround: Pipecat's data channel on("open") listener misses the event
        # because the channel is already open when on("datachannel") fires.
        # Wait briefly for on_datachannel to set _data_channel, then flush manually.
        async def flush_data_channel():
            await asyncio.sleep(0.5)
            conn = transport._client._webrtc_connection
            if conn._data_channel and conn._data_channel.readyState == "open":
                conn._flush_message_queue()
                logger.info("Manually flushed data channel queue")
            else:
                logger.warning(f"Data channel state: channel={conn._data_channel}, ready={getattr(conn._data_channel, 'readyState', 'N/A')}")
        asyncio.create_task(flush_data_channel())

        await task.queue_frames([context_aggregator.user().get_context_frame()])

    @transport.event_handler("on_client_disconnected")
    async def on_disconnected(transport, client):
        logger.info("Client disconnected")
        await task.cancel()

    runner = PipelineRunner()
    await runner.run(task)


if __name__ == "__main__":
    from pipecat.runner.run import main
    main()

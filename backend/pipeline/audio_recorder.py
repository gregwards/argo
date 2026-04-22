"""AudioRecorderProcessor — passthrough FrameProcessor that captures student audio.

This processor sits before STT in the pipeline and copies incoming audio frames
into an in-memory buffer without blocking the voice loop. The buffer is assembled
into a WAV file at session end for audit trail storage.

Memory note: 16kHz 16-bit mono accumulates ~1.9MB/min; a 20-min session is ~38MB.
Accepted as reasonable for MVP (T-03-03 in threat register).
"""

import io
import wave

from loguru import logger

from pipecat.frames.frames import InputAudioRawFrame
from pipecat.processors.frame_processor import FrameProcessor, FrameDirection


class AudioRecorderProcessor(FrameProcessor):
    """Passively captures InputAudioRawFrame audio without blocking the pipeline.

    Insert this processor immediately before STT in the Pipeline list so it
    sees audio frames before STT consumes them.
    """

    def __init__(self, sample_rate: int = 16000, channels: int = 1):
        super().__init__()
        self._sample_rate = sample_rate
        self._channels = channels
        self._chunks: list[bytes] = []

    async def process_frame(self, frame, direction: FrameDirection):
        """Copy audio bytes from InputAudioRawFrame then pass frame through."""
        await super().process_frame(frame, direction)
        if isinstance(frame, InputAudioRawFrame):
            self._chunks.append(frame.audio)
        await self.push_frame(frame, direction)

    def get_wav_bytes(self) -> bytes:
        """Assemble captured audio chunks into a WAV file and return as bytes.

        Returns an empty bytes object if no audio was captured.
        """
        if not self._chunks:
            return b""

        raw_audio = b"".join(self._chunks)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(self._channels)
            wf.setsampwidth(2)  # 16-bit PCM
            wf.setframerate(self._sample_rate)
            wf.writeframes(raw_audio)
        return buf.getvalue()

    def reset(self):
        """Clear the audio buffer (e.g., between test runs)."""
        self._chunks = []
        logger.debug("AudioRecorderProcessor buffer reset")

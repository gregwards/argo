"""Recording storage — saves session audio to local filesystem or S3.

Supports two storage backends selected by environment variable:
- S3: when RECORDING_BUCKET is set, uploads to that bucket
- Local: when RECORDING_BUCKET is not set, writes to RECORDINGS_DIR (default: ./recordings)

Uses os.path.join throughout to prevent path traversal (T-03-02 in threat register).
"""

import os

from loguru import logger


async def save_recording(session_id: str, wav_bytes: bytes) -> str | None:
    """Save WAV audio for a session to S3 or local filesystem.

    Args:
        session_id: UUID string used as the filename base. Server-generated,
                    not user-controllable — safe for use in file paths.
        wav_bytes: Raw WAV file bytes to persist.

    Returns:
        The storage reference (S3 key or local path) on success, None on failure.
    """
    bucket = os.getenv("RECORDING_BUCKET")
    if bucket:
        return await _save_to_s3(session_id, wav_bytes, bucket)
    else:
        return await _save_to_filesystem(session_id, wav_bytes)


async def _save_to_s3(session_id: str, wav_bytes: bytes, bucket: str) -> str | None:
    """Upload recording to S3."""
    try:
        import boto3

        key = f"recordings/{session_id}.wav"
        s3 = boto3.client("s3")
        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=wav_bytes,
            ContentType="audio/wav",
        )
        logger.info(f"Recording for {session_id} saved to s3://{bucket}/{key}")
        return key
    except Exception as e:
        logger.error(f"Failed to save recording for {session_id} to S3: {e}")
        return None


async def _save_to_filesystem(session_id: str, wav_bytes: bytes) -> str | None:
    """Write recording to local filesystem.

    TODO: Move to R2/S3 before verification-critical use. Railway containers have
    ephemeral filesystems — recordings are lost on redeploy. See save_to_s3() above
    for the existing S3 client that needs to be wired up.
    """
    try:
        recordings_dir = os.getenv("RECORDINGS_DIR", "./recordings")
        os.makedirs(recordings_dir, exist_ok=True)
        # Use os.path.join to prevent path traversal (T-03-02)
        file_path = os.path.join(recordings_dir, f"{session_id}.wav")
        with open(file_path, "wb") as f:
            f.write(wav_bytes)
        logger.info(f"Recording for {session_id} saved to {file_path}")
        return file_path
    except Exception as e:
        logger.error(f"Failed to save recording for {session_id} to filesystem: {e}")
        return None

"""Local speech-to-text using Whisper via mlx-whisper (Apple Silicon optimized)."""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import subprocess
import tempfile
from typing import Optional

logger = logging.getLogger(__name__)

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "mlx-community/whisper-large-v3-turbo")


def _find_ffmpeg() -> str:
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        return ffmpeg
    for path in ("/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"):
        if os.path.isfile(path):
            return path
    raise FileNotFoundError("ffmpeg not found — install it with: brew install ffmpeg")


def _convert_to_wav(audio_bytes: bytes, input_format: str) -> Optional[str]:
    """Convert audio to 16kHz mono WAV via ffmpeg. Returns temp WAV path."""
    with tempfile.NamedTemporaryFile(suffix=f".{input_format}", delete=False) as f_in:
        f_in.write(audio_bytes)
        in_path = f_in.name

    out_path = in_path.replace(f".{input_format}", ".wav")
    try:
        ffmpeg = _find_ffmpeg()
        subprocess.run(
            [ffmpeg, "-y", "-i", in_path, "-ar", "16000", "-ac", "1", "-f", "wav", out_path],
            check=True,
            capture_output=True,
        )
        return out_path
    except Exception as e:
        logger.error("Audio conversion failed: %s", e)
        if os.path.exists(out_path):
            os.unlink(out_path)
        return None
    finally:
        os.unlink(in_path)


def _transcribe_sync(audio_bytes: bytes, input_format: str, lang: str) -> Optional[str]:
    try:
        import mlx_whisper

        wav_path = _convert_to_wav(audio_bytes, input_format)
        if wav_path is None:
            return None

        try:
            result = mlx_whisper.transcribe(
                wav_path,
                path_or_hf_repo=WHISPER_MODEL,
                language=lang,
                verbose=False,
            )
            return result.get("text", "").strip()
        finally:
            if os.path.exists(wav_path):
                os.unlink(wav_path)

    except Exception as e:
        logger.error("Whisper transcription error: %s", e)
        return None


async def speech_to_text(audio_bytes: bytes, audio_format: str = "webm", lang: str = "fr") -> Optional[str]:
    """Transcribe audio using mlx-whisper locally (async wrapper)."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _transcribe_sync, audio_bytes, audio_format, lang)

"""Simple Gradium text-to-speech helper with null-safe fallback."""

from __future__ import annotations

import logging
import os
import ssl

import aiohttp.connector
import certifi
from gradium import GradiumClient, TTSSetup

# On macOS with python.org builds, the system SSL certs are not linked.
# aiohttp creates its verified SSL context at module import time as a constant
# (_SSL_CONTEXT_VERIFIED). We replace it with one that uses certifi's CA bundle.
_ssl_context = ssl.create_default_context(cafile=certifi.where())
aiohttp.connector._SSL_CONTEXT_VERIFIED = _ssl_context

logger = logging.getLogger(__name__)


async def text_to_speech(text: str, voice_id: str | None = None) -> bytes | None:
    """Generate speech audio bytes, or return None when unavailable."""
    api_key = os.getenv("GRADIUM_API_KEY")
    resolved_voice_id = voice_id or os.getenv("GRADIUM_VOICE_ID")
    if not api_key or not resolved_voice_id or not text.strip():
        return None

    try:
        client = GradiumClient(api_key=api_key)
        setup = TTSSetup(voice_id=resolved_voice_id, output_format="wav")
        result = await client.tts(setup, text)
        return result.raw_data
    except Exception:
        logger.exception("Gradium TTS failed")
        return None

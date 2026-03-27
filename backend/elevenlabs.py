"""Simple ElevenLabs text-to-speech helper with null-safe fallback."""

from __future__ import annotations

import os

import httpx


async def text_to_speech(text: str) -> bytes | None:
    """Generate speech audio bytes, or return None when unavailable."""
    api_key = os.getenv("ELEVENLABS_API_KEY")
    voice_id = os.getenv("ELEVENLABS_VOICE_ID")
    if not api_key or not voice_id or not text.strip():
        return None

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    payload = {
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {"stability": 0.45, "similarity_boost": 0.75},
    }
    headers = {"xi-api-key": api_key, "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            return response.content
    except httpx.HTTPError:
        return None

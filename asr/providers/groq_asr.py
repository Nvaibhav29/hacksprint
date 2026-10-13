"""
Groq ASR provider — Whisper large v3 running on Groq hardware.
Docs: https://console.groq.com/docs/speech-to-text  (OpenAI-compatible endpoint)

* Uses plain httpx, so no extra package is needed.
* Whisper returns native script for Indian languages (Devanagari / Kannada ...),
  not Roman. The LLM prompt copies trigger phrases verbatim in the transcript's
  own script, so highlighting still works.
* Free tier uploads are capped at 25 MB, so long audio is split into chunks.
"""
import time
import shutil
import logging
from collections import Counter

import httpx
from config import get_settings
from asr.preprocess_audio import split_audio
from asr.providers.local_asr import _VOCAB_PROMPTS   # Roman hospital-vocabulary hints (faster_whisper is NOT imported here)

logger = logging.getLogger(__name__)

GROQ_ASR_URL = "https://api.groq.com/openai/v1/audio/transcriptions"

# Whisper reports the language as a name; the rest of the app uses ISO codes.
_LANG_NAME_TO_CODE = {
    "hindi": "hi", "kannada": "kn", "english": "en",
    "tamil": "ta", "telugu": "te", "malayalam": "ml",
}


def _call_groq(api_key: str, path: str, language: str) -> dict:
    s = get_settings()
    with open(path, "rb") as f:
        audio_bytes = f.read()

    data = {
        "model": s.groq_asr_model,
        "response_format": "verbose_json",   # includes the detected language
        "temperature": "0",
    }
    if language and language != "auto":
        data["language"] = language          # ISO-639-1: hi, kn, en, ta, te, ml
    prompt = _VOCAB_PROMPTS.get(language if language in _VOCAB_PROMPTS else "hi")
    if prompt:
        data["prompt"] = prompt              # vocabulary hint (billing, UHID, refund ...)

    headers = {"Authorization": f"Bearer {api_key}"}

    for attempt in (1, 2):
        with httpx.Client(timeout=120.0) as client:
            resp = client.post(
                GROQ_ASR_URL, headers=headers, data=data,
                files={"file": ("audio.wav", audio_bytes, "audio/wav")},
            )
        if resp.status_code == 429 and attempt == 1:
            # rate limited: honour a short Retry-After once, otherwise let the caller fall back
            try:
                wait = float(resp.headers.get("retry-after", "0"))
            except ValueError:
                wait = 0
            if 0 < wait <= 15:
                logger.warning(f"Groq ASR rate limited, retrying in {wait}s")
                time.sleep(wait)
                continue
        break

    if resp.status_code != 200:
        raise RuntimeError(f"Groq ASR error {resp.status_code}: {resp.text[:300]}")
    return resp.json()


def transcribe(audio_path: str, language: str = "auto") -> dict:
    """
    Returns: {"transcript": str, "language_code": str, "provider": "groq-<model>"}
    Raises on failure (caller handles fallback).
    """
    s = get_settings()
    if not s.groq_api_key:
        raise ValueError("GROQ_API_KEY not set in environment")

    chunks, tmp_dir = split_audio(audio_path, s.groq_chunk_seconds)
    try:
        texts: list[str] = []
        langs: list[str] = []
        for i, chunk in enumerate(chunks):
            result = _call_groq(s.groq_api_key, chunk, language)
            text = (result.get("text") or "").strip()
            logger.info(f"Groq ASR chunk {i + 1}/{len(chunks)}: {len(text)} chars")
            if text:
                texts.append(text)
            lang = (result.get("language") or "").strip().lower()
            if lang:
                langs.append(_LANG_NAME_TO_CODE.get(lang, lang))
    finally:
        if tmp_dir:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    transcript = " ".join(texts).strip()
    if not transcript:
        raise RuntimeError("Groq returned empty transcript")

    detected = language if language and language != "auto" else (
        Counter(langs).most_common(1)[0][0] if langs else "unknown"
    )
    return {
        "transcript": transcript,
        "language_code": detected,
        "provider": f"groq-{s.groq_asr_model}",
    }

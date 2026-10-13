"""
Sarvam AI ASR provider.
Primary ASR — handles Indian languages + code-mixing natively.
Docs: https://docs.sarvam.ai/api-reference-docs/speech-to-text

Fix #4:
  * uses saaras:v3 with mode="translit" (Roman-script output) so the transcript
    matches the Roman-script trigger phrases the LLM is asked to produce;
  * honours the language chosen in the UI instead of always "auto";
  * splits long audio into <=25 s chunks (REST limit is 30 s).
"""
import re
import shutil
import logging
from collections import Counter

import httpx
from config import get_settings
from asr.preprocess_audio import split_audio

logger = logging.getLogger(__name__)

SARVAM_ASR_URL = "https://api.sarvam.ai/speech-to-text"

# "unknown" lets Sarvam auto-detect
LANGUAGE_MAP = {
    "hi": "hi-IN",
    "kn": "kn-IN",
    "en": "en-IN",
    "ta": "ta-IN",
    "te": "te-IN",
    "ml": "ml-IN",
    "auto": "unknown",
}

_URDU_SCRIPT_RE = re.compile(r"[\u0600-\u06FF]")


def _is_urdu_script(text: str) -> bool:
    return bool(_URDU_SCRIPT_RE.search(text))


def _call_sarvam(api_key: str, audio_bytes: bytes, lang_code: str) -> dict:
    """One Sarvam API call; returns parsed JSON."""
    s = get_settings()
    headers = {"api-subscription-key": api_key}
    files = {"file": ("audio.wav", audio_bytes, "audio/wav")}
    data = {
        "language_code": lang_code,
        "model": s.sarvam_model,
    }
    # `mode` is only valid for saaras:v3 (older models ignore/reject it)
    if s.sarvam_model.startswith("saaras:v3") and s.sarvam_mode:
        data["mode"] = s.sarvam_mode

    with httpx.Client(timeout=60.0) as client:
        response = client.post(SARVAM_ASR_URL, headers=headers, files=files, data=data)
    if response.status_code != 200:
        raise RuntimeError(f"Sarvam API error {response.status_code}: {response.text}")
    return response.json()


def _transcribe_chunk(api_key: str, path: str, lang_code: str) -> tuple[str, str]:
    with open(path, "rb") as f:
        audio_bytes = f.read()

    result = _call_sarvam(api_key, audio_bytes, lang_code)
    text = (result.get("transcript") or "").strip()
    detected = result.get("language_code") or lang_code

    # Urdu-script guard (only relevant for auto-detect on Hindi audio)
    if text and _is_urdu_script(text) and lang_code == "unknown":
        logger.warning("Sarvam returned Urdu script — retrying chunk with hi-IN forced.")
        r2 = _call_sarvam(api_key, audio_bytes, "hi-IN")
        t2 = (r2.get("transcript") or "").strip()
        if t2 and not _is_urdu_script(t2):
            text, detected = t2, "hi-IN"
    return text, detected


def transcribe(audio_path: str, language: str = "auto") -> dict:
    """
    Transcribe audio using Sarvam AI.

    Returns: {"transcript": str, "language_code": str, "provider": "sarvam"}
    Raises on API failure (caller handles fallback).
    """
    settings = get_settings()
    api_key = settings.sarvam_api_key
    if not api_key:
        raise ValueError("SARVAM_API_KEY not set in environment")

    lang_code = LANGUAGE_MAP.get(language, "unknown")

    chunks, tmp_dir = split_audio(audio_path, settings.asr_chunk_seconds)
    try:
        texts: list[str] = []
        langs: list[str] = []
        for i, chunk in enumerate(chunks):
            text, detected = _transcribe_chunk(api_key, chunk, lang_code)
            logger.info(f"Sarvam chunk {i + 1}/{len(chunks)}: {len(text)} chars")
            if text:
                texts.append(text)
            if detected and detected != "unknown":
                langs.append(detected)
    finally:
        if tmp_dir:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    transcript = " ".join(texts).strip()
    if not transcript:
        raise RuntimeError("Sarvam returned empty transcript")

    detected_lang = Counter(langs).most_common(1)[0][0] if langs else lang_code
    return {
        "transcript": transcript,
        "language_code": detected_lang,
        "provider": "sarvam",
    }

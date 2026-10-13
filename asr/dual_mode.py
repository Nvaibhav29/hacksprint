"""
ASR provider chain — Groq first, local Whisper fallback.
No Sarvam. No other cloud providers.
"""
import logging
from asr.providers import groq_asr, local_asr
from config import get_settings

logger = logging.getLogger(__name__)


def transcribe(audio_path: str, language: str = "auto") -> dict:
    """
    Returns:
        {
            "transcript": str,
            "language_code": str,
            "provider": str,        # "groq-whisper-large-v3" | "whisper"
            "fallback_used": bool
        }
    """
    s = get_settings()

    # ── 1. Groq cloud ASR (fast, accurate, supports Hindi/Indian accents) ──
    if s.groq_api_key:
        try:
            logger.info("ASR: trying Groq...")
            result = groq_asr.transcribe(audio_path, language)
            result["fallback_used"] = False
            logger.info(f"ASR: Groq succeeded. Language: {result['language_code']}")
            return result
        except Exception as e:
            logger.warning(f"ASR: Groq failed ({e}). Falling back to local Whisper...")
    else:
        logger.info("ASR: Groq skipped (no GROQ_API_KEY). Using local Whisper.")

    # ── 2. Local Whisper fallback ──────────────────────────────────────────
    try:
        logger.info("ASR: trying local Whisper...")
        result = local_asr.transcribe(audio_path, language)
        result["fallback_used"] = True
        logger.info(f"ASR: Whisper succeeded. Language: {result['language_code']}")
        return result
    except Exception as e:
        logger.error(f"ASR: local Whisper failed ({e})")
        raise RuntimeError(
            f"Transcription failed. Groq: no key or error. Whisper: {e}"
        )

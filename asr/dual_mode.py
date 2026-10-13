"""
ASR provider chain.
Tries the providers in ASR_ORDER (default: groq, sarvam, whisper) and returns the
first transcript that works. Providers without an API key are skipped.
Returns a unified result dict regardless of which provider was used.
"""
import logging
from asr.providers import groq_asr, sarvam_api, local_asr
from config import get_settings, parse_order

logger = logging.getLogger(__name__)

_PROVIDERS = {
    "groq": groq_asr.transcribe,
    "sarvam": sarvam_api.transcribe,
    "whisper": local_asr.transcribe,       # local faster-whisper, no key needed
}


def _configured_chain() -> list[str]:
    s = get_settings()
    keys = {"groq": s.groq_api_key, "sarvam": s.sarvam_api_key}   # whisper needs none
    chain = []
    for name in parse_order(s.asr_order):
        if name not in _PROVIDERS:
            logger.warning(f"ASR: unknown provider '{name}' in ASR_ORDER — ignored")
        elif name in keys and not keys[name]:
            logger.info(f"ASR: {name} skipped (no API key set)")
        else:
            chain.append(name)
    return chain


def transcribe(audio_path: str, language: str = "auto") -> dict:
    """
    Returns:
        {
            "transcript": str,
            "language_code": str,
            "provider": str,            # e.g. "groq-whisper-large-v3" | "sarvam" | "whisper"
            "fallback_used": bool       # True if the first provider in the chain did not run
        }
    """
    errors: list[str] = []
    for i, name in enumerate(_configured_chain()):
        try:
            logger.info(f"ASR: trying {name}...")
            result = _PROVIDERS[name](audio_path, language)
            result["fallback_used"] = i > 0
            logger.info(f"ASR: {name} succeeded. Language: {result['language_code']}")
            return result
        except Exception as e:
            logger.warning(f"ASR: {name} failed ({e}). Trying next provider...")
            errors.append(f"{name}: {e}")

    logger.error(f"ASR: all providers failed: {errors}")
    raise RuntimeError(
        "Transcription failed on every provider"
        + (f" ({' | '.join(errors)})" if errors else " — none are configured (check GROQ_API_KEY / SARVAM_API_KEY).")
    )

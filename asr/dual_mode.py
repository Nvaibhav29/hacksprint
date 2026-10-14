"""
ASR provider chain:
  1. Groq cloud (whisper-large-v3) — fastest, most accurate
  2. Local proxy ASR (/asr/transcribe via ngrok tunnel) — uses your GPU/local Whisper
  3. Fallback: import faster-whisper locally (only works if installed)
"""
import logging
import httpx
from asr.providers import groq_asr, local_asr
from config import get_settings

logger = logging.getLogger(__name__)


def _proxy_transcribe(audio_path: str, language: str = "auto") -> dict:
    """Call the local proxy server's ASR endpoint via ngrok tunnel."""
    s = get_settings()
    url = s.local_proxy_url.rstrip("/") + "/asr/transcribe"
    headers = {}
    if s.asr_token:
        headers["Authorization"] = f"Bearer {s.asr_token}"

    lang = language if (language and language != "auto") else "auto"
    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    with httpx.Client(timeout=180.0) as client:
        resp = client.post(
            url,
            headers=headers,
            files={"file": ("audio.wav", audio_bytes, "audio/wav")},
            data={"language": lang},
        )
    if resp.status_code != 200:
        raise RuntimeError(f"Local ASR proxy error {resp.status_code}: {resp.text[:200]}")
    data = resp.json()
    data["fallback_used"] = True
    return data


def transcribe(audio_path: str, language: str = "auto") -> dict:
    """
    Returns:
        {
            "transcript": str,
            "language_code": str,
            "provider": str,
            "fallback_used": bool
        }
    """
    s = get_settings()

    # ── 1. Groq cloud ASR ─────────────────────────────────────────────────
    if s.groq_api_key:
        try:
            logger.info("ASR: trying Groq...")
            result = groq_asr.transcribe(audio_path, language)
            result["fallback_used"] = False
            logger.info(f"ASR: Groq succeeded. Language: {result['language_code']}")
            return result
        except Exception as e:
            logger.warning(f"ASR: Groq failed ({e}). Trying local proxy...")

    # ── 2. Local proxy ASR (ngrok → local Whisper GPU) ────────────────────
    if s.local_proxy_url:
        try:
            logger.info(f"ASR: trying local proxy at {s.local_proxy_url}...")
            result = _proxy_transcribe(audio_path, language)
            result["fallback_used"] = True
            logger.info(f"ASR: local proxy succeeded. Language: {result.get('language_code')}")
            return result
        except Exception as e:
            logger.warning(f"ASR: local proxy failed ({e}). Trying inline Whisper...")

    # ── 3. Inline local Whisper (only if faster-whisper is installed) ──────
    try:
        logger.info("ASR: trying inline local Whisper...")
        result = local_asr.transcribe(audio_path, language)
        result["fallback_used"] = True
        logger.info(f"ASR: Whisper succeeded. Language: {result['language_code']}")
        return result
    except Exception as e:
        logger.error(f"ASR: all providers failed. Last error: {e}")
        raise RuntimeError(
            f"Transcription failed. Groq: no key. Proxy: {'not configured' if not s.local_proxy_url else 'failed'}. Whisper: {e}"
        )

"""
Remote ASR provider: your laptop's Whisper, reached through a tunnel.

The laptop runs `asr_server.py` (faster-whisper) and a tunnel (ngrok / cloudflared)
exposes it. The backend on Railway posts the WAV to  <ASR_REMOTE_URL>/transcribe.
Errors are turned into one short readable line (no HTML pages from the tunnel).
"""
import logging

import httpx

from config import get_settings

logger = logging.getLogger(__name__)


def _short_error(resp: httpx.Response) -> str:
    ctype = resp.headers.get("content-type", "")
    body = resp.text or ""
    if "json" in ctype:
        try:
            detail = resp.json().get("detail")
            if detail:
                return f"HTTP {resp.status_code}: {str(detail)[:150]}"
        except ValueError:
            pass
    if "<html" in body[:500].lower() or "ERR_NGROK" in body:
        return (f"HTTP {resp.status_code}: the tunnel is offline or ASR_REMOTE_URL is wrong "
                "(is the laptop on and start-asr.ps1 running?)")
    return f"HTTP {resp.status_code}: {body[:150]}"


def transcribe(audio_path: str, language: str = "auto") -> dict:
    """
    Returns {"transcript", "language_code", "provider": "whisper-laptop"}.
    Raises RuntimeError / ValueError on any failure (the caller handles fallback).
    """
    s = get_settings()
    if not s.asr_remote_url:
        raise ValueError("ASR_REMOTE_URL not set")

    url = s.asr_remote_url.rstrip("/") + "/transcribe"
    headers = {"X-ASR-Token": s.asr_token, "ngrok-skip-browser-warning": "true"}
    timeout = httpx.Timeout(s.asr_remote_timeout_seconds, connect=5.0)   # fail fast if the tunnel is down

    try:
        with open(audio_path, "rb") as f, httpx.Client(timeout=timeout) as client:
            resp = client.post(
                url, headers=headers,
                files={"file": ("audio.wav", f, "audio/wav")},
                data={"language": language or "auto"},
            )
    except (httpx.ConnectError, httpx.ConnectTimeout):
        raise RuntimeError("laptop ASR unreachable (is the laptop on and the tunnel running?)")
    except httpx.ReadTimeout:
        raise RuntimeError(f"laptop ASR took longer than {s.asr_remote_timeout_seconds}s")
    except httpx.HTTPError as e:
        raise RuntimeError(f"laptop ASR connection error: {type(e).__name__}")

    if resp.status_code != 200:
        raise RuntimeError(_short_error(resp))

    try:
        data = resp.json()
    except ValueError:
        raise RuntimeError("laptop ASR returned a non-JSON answer (wrong URL?)")

    transcript = (data.get("transcript") or "").strip()
    if not transcript:
        raise RuntimeError("laptop ASR returned an empty transcript")

    logger.info(f"Remote ASR ok: {len(transcript)} chars, lang={data.get('language_code')}")
    return {
        "transcript": transcript,
        "language_code": data.get("language_code") or language or "unknown",
        "provider": "whisper-laptop",
    }

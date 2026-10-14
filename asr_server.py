"""
Laptop ASR server. Runs Whisper (faster-whisper) on YOUR machine and shares it with the
Railway backend through a tunnel.

    python asr_server.py            (or: start-asr.ps1, which also starts the tunnel)

Endpoints
  POST /transcribe   multipart: file (WAV), language (auto|hi|kn|en|ta|te|ml)   header X-ASR-Token
  GET  /health       model + device info
  /api/generate, /api/chat, /api/tags, /api/show, /api/version
                     forwarded to local Ollama, so ONE tunnel URL serves both the ASR and the
                     LLM fallback (OLLAMA_BASE_URL on Railway can stay the same address).
                     Model management paths (pull / delete / create ...) are NOT forwarded.

Requires ASR_TOKEN in .env (same value as on Railway). The server refuses to start without it,
because the tunnel address is public.
"""
import hmac
import logging
import os
import shutil
import sys
import tempfile
import threading
from contextlib import asynccontextmanager

import httpx
import uvicorn
from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, Response

from asr.providers import local_asr
from config import get_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("asr_server")

settings = get_settings()
ALLOWED_LANGUAGES = {"auto", "hi", "kn", "en", "ta", "te", "ml"}
MAX_UPLOAD_MB = 100
OLLAMA_PATHS = {"api/generate", "api/chat", "api/tags", "api/show", "api/version"}

# One transcription at a time: Whisper on a laptop CPU/GPU should not run in parallel.
_busy = threading.Lock()
_state = {"model_loaded": False, "load_error": ""}


@asynccontextmanager
async def lifespan(_: FastAPI):
    if not settings.asr_token:
        raise RuntimeError("ASR_TOKEN is empty. Set it in .env (same value as on Railway) and start again.")
    try:                                     # load now, so the first call is not slow
        local_asr._load_model()
        _state["model_loaded"] = True
        logger.info(f"Whisper '{settings.whisper_model}' ready on {settings.whisper_device}")
    except Exception as e:
        _state["load_error"] = str(e)[:200]
        logger.error(f"Whisper could not be loaded: {e}")
    yield


app = FastAPI(title="MedRoute laptop ASR", docs_url=None, redoc_url=None, lifespan=lifespan)


def _check_token(token: str) -> None:
    if not hmac.compare_digest(token.encode(), settings.asr_token.encode()):
        raise HTTPException(401, "Bad or missing X-ASR-Token")


@app.get("/health")
def health():
    return {
        "status": "ok" if _state["model_loaded"] else "degraded",
        "model": settings.whisper_model,
        "device": settings.whisper_device,
        "model_loaded": _state["model_loaded"],
        "error": _state["load_error"] or None,
    }


@app.post("/transcribe")
def transcribe(
    file: UploadFile = File(...),
    language: str = Form("auto"),
    x_asr_token: str = Header(default=""),
):
    _check_token(x_asr_token)
    if language not in ALLOWED_LANGUAGES:
        raise HTTPException(400, f"Unsupported language '{language}'")
    if not _state["model_loaded"]:
        raise HTTPException(503, f"Whisper is not available on the laptop: {_state['load_error'] or 'not loaded'}")

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    try:
        with tmp:
            shutil.copyfileobj(file.file, tmp)
        size_mb = os.path.getsize(tmp.name) / (1024 * 1024)
        if size_mb > MAX_UPLOAD_MB:
            raise HTTPException(413, f"Audio too large ({size_mb:.0f} MB)")
        if size_mb == 0:
            raise HTTPException(400, "Empty audio file")

        logger.info(f"Transcribing {size_mb:.1f} MB, language={language}")
        with _busy:
            result = local_asr.transcribe(tmp.name, language)
        result["provider"] = "whisper-laptop"
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise HTTPException(500, str(e)[:200])
    finally:
        if os.path.exists(tmp.name):
            os.unlink(tmp.name)


# ── Ollama pass-through (so one tunnel serves ASR + LLM) ────────────────────────
@app.api_route("/{path:path}", methods=["GET", "POST"])
async def ollama_passthrough(path: str, request: Request):
    base = (settings.asr_server_ollama_url or "").rstrip("/")
    if not base or path not in OLLAMA_PATHS:
        raise HTTPException(404, "Not found")
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=5.0)) as client:
            upstream = await client.request(
                request.method, f"{base}/{path}",
                content=await request.body(),
                headers={"content-type": request.headers.get("content-type", "application/json")},
            )
    except httpx.HTTPError:
        return JSONResponse({"detail": "Ollama is not running on the laptop (start it with: ollama serve)"}, status_code=502)
    return Response(upstream.content, status_code=upstream.status_code,
                    media_type=upstream.headers.get("content-type", "application/json"))


if __name__ == "__main__":
    # 127.0.0.1: only the local tunnel can reach it, not other devices on your Wi-Fi.
    uvicorn.run("asr_server:app", host="127.0.0.1", port=settings.asr_server_port, log_level="info")

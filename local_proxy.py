"""
Local proxy server — runs on port 8888, tunnelled via ngrok.
Handles two things:
  POST /asr/transcribe   — local Whisper ASR (returns transcript JSON)
  ALL  /ollama/*         — proxies to Ollama on localhost:11434

Protected by Bearer token (ASR_TOKEN env var).
"""
import os
import io
import tempfile
import threading
import httpx
import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse, JSONResponse

app = FastAPI(title="MedRoute Local Proxy", docs_url=None)
security = HTTPBearer(auto_error=False)

ASR_TOKEN = os.getenv("ASR_TOKEN", "")
OLLAMA_BASE = "http://localhost:11434"

_model = None
_model_lock = threading.Lock()

VOCAB_PROMPT = (
    "Hospital call about billing, appointment, pharmacy, refund, "
    "prescription, UHID, patient ID, doctor. Namaste, main hospital se bol raha hoon."
)


def _check_token(creds: HTTPAuthorizationCredentials = Depends(security)):
    if ASR_TOKEN and (not creds or creds.credentials != ASR_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid or missing token")
    return True


def _get_model():
    global _model
    with _model_lock:
        if _model is None:
            from faster_whisper import WhisperModel
            model_name = os.getenv("WHISPER_MODEL", "small")
            device = os.getenv("WHISPER_DEVICE", "cpu")
            compute = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
            print(f"[ASR] Loading Whisper {model_name} on {device}...")
            _model = WhisperModel(model_name, device=device, compute_type=compute)
            print("[ASR] Model ready.")
    return _model


# ── ASR endpoint ──────────────────────────────────────────────────────────────
@app.post("/asr/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form("auto"),
    _: bool = Depends(_check_token),
):
    """Receive audio file, return transcript JSON."""
    audio_bytes = await file.read()
    suffix = os.path.splitext(file.filename or "audio.wav")[1] or ".wav"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        model = _get_model()
        lang = None if (not language or language == "auto") else language
        segments, info = model.transcribe(
            tmp_path,
            language=lang,
            task="transcribe",
            initial_prompt=VOCAB_PROMPT,
            beam_size=5,
            vad_filter=True,
            condition_on_previous_text=False,
        )
        transcript = " ".join(s.text.strip() for s in segments).strip()
        if not transcript:
            raise HTTPException(status_code=422, detail="Empty transcript")
        return {
            "transcript": transcript,
            "language_code": info.language or lang or "unknown",
            "provider": "whisper-local",
        }
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


# ── Ollama proxy endpoint ─────────────────────────────────────────────────────
@app.api_route("/ollama/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def ollama_proxy(path: str, request: Request, _: bool = Depends(_check_token)):
    """Forward all /ollama/* requests to local Ollama."""
    url = f"{OLLAMA_BASE}/{path}"
    body = await request.body()
    async with httpx.AsyncClient(timeout=300.0) as client:
        resp = await client.request(
            method=request.method,
            url=url,
            headers={k: v for k, v in request.headers.items() if k.lower() != "host"},
            content=body,
            params=dict(request.query_params),
        )
    return StreamingResponse(
        content=iter([resp.content]),
        status_code=resp.status_code,
        headers=dict(resp.headers),
    )


@app.get("/health")
def health():
    return {"status": "ok", "service": "medroute-local-proxy"}


if __name__ == "__main__":
    port = int(os.getenv("PROXY_PORT", 8888))
    print(f"[Proxy] Starting on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")

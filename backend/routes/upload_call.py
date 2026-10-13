"""
Upload call routes.
POST /api/calls/upload        — accepts audio, starts a background job, returns job_id (202)
GET  /api/calls/jobs/{job_id} — job status / progress / result
"""
import os
import tempfile
import logging
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
import aiofiles

from backend import jobs
from config import get_settings

router = APIRouter()
logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".flac", ".webm"}
ALLOWED_LANGUAGES = {"auto", "hi", "kn", "en", "ta", "te", "ml"}


@router.post("/upload", status_code=202)
async def upload_call(file: UploadFile = File(...), language: str = Form("auto")):
    """Validate + save the file, then process it in the background."""
    settings = get_settings()

    if language not in ALLOWED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Unsupported language '{language}'.")

    _, ext = os.path.splitext(file.filename or "")
    if ext.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {sorted(ALLOWED_EXTENSIONS)}",
        )

    contents = await file.read()
    size_mb = len(contents) / (1024 * 1024)
    if size_mb > settings.max_audio_size_mb:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({size_mb:.1f} MB). Max: {settings.max_audio_size_mb} MB",
        )

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    tmp.close()
    async with aiofiles.open(tmp.name, "wb") as f:
        await f.write(contents)

    logger.info(f"Received file: {file.filename} ({size_mb:.2f} MB), language={language}")
    job_id = jobs.submit(tmp.name, file.filename or "upload", language)
    return JSONResponse(content={"job_id": job_id, "status": "queued"}, status_code=202)


@router.get("/jobs/{job_id}")
async def job_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found (it may have expired).")
    return JSONResponse(content={
        "job_id": job["job_id"],
        "status": job["status"],
        "stage": job["stage"],
        "stage_index": jobs.STAGE_ORDER.index(job["stage"]) if job["stage"] in jobs.STAGE_ORDER else 0,
        "stage_count": len(jobs.STAGE_ORDER) - 1,
        "providers": job["providers"],
        "result": job["result"],
        "error": job["error"],
    })

"""
Tiny in-memory job store + thread pool (Fix #3).

Uploads are processed in a worker thread so the async event loop (and the
dashboard) never blocks. State is in-memory: fine for a single-process
hackathon/demo server; use Redis/DB if you ever run several workers.
"""
import os
import time
import uuid
import logging
import threading
from concurrent.futures import ThreadPoolExecutor

from config import get_settings
from pipeline.orchestrator import run

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(
    max_workers=get_settings().max_concurrent_jobs, thread_name_prefix="pipeline"
)
_jobs: dict[str, dict] = {}
_lock = threading.Lock()
_JOB_TTL_SECONDS = 3600

STAGE_ORDER = ["queued", "preprocessing", "asr", "llm", "routing", "saving", "done"]


def _prune():
    cutoff = time.time() - _JOB_TTL_SECONDS
    with _lock:
        for jid in [j for j, v in _jobs.items() if v["updated_at"] < cutoff]:
            del _jobs[jid]


def _update(job_id: str, **fields):
    with _lock:
        if job_id in _jobs:
            _jobs[job_id].update(fields, updated_at=time.time())


def submit(tmp_path: str, filename: str, language: str) -> str:
    _prune()
    job_id = uuid.uuid4().hex
    with _lock:
        _jobs[job_id] = {
            "job_id": job_id,
            "status": "queued",        # queued | processing | done | error
            "stage": "queued",
            "detail": "",
            "providers": {},           # filled as stages report them
            "result": None,
            "error": None,
            "created_at": time.time(),
            "updated_at": time.time(),
        }

    def on_stage(stage: str, detail: str = "", **extra):
        with _lock:
            job = _jobs.get(job_id)
            if job:
                if stage == "llm" and detail:
                    job["providers"]["asr"] = detail
                    job["providers"]["asr_fallback"] = bool(extra.get("asr_fallback", False))
                if stage == "routing" and detail:
                    job["providers"]["llm"] = detail
                    job["providers"]["llm_fallback"] = bool(extra.get("llm_fallback", False))
        _update(job_id, status="processing", stage=stage, detail=detail)

    def work():
        try:
            result = run(tmp_path, original_filename=filename, language=language, on_stage=on_stage)
            _update(job_id, status="done", stage="done", result=result)
        except Exception as e:
            logger.exception("Job failed")
            msg = str(e) if isinstance(e, (RuntimeError, ValueError)) else "Internal processing error"
            _update(job_id, status="error", error=msg)
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    _executor.submit(work)
    return job_id


def get(job_id: str) -> dict | None:
    with _lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None

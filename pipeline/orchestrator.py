"""
Pipeline orchestrator — the single entry point for the entire pipeline.

Flow:
  audio file path
    → preprocess (ffmpeg → 16kHz mono WAV)
    → ASR dual-mode (Sarvam → Whisper)
    → LLM dual-mode (Gemini → Qwen)
    → Router (validate dept + priority + explainability)
    → Supabase (save call + actions)
    → return full result dict

Fix #3: run() accepts an optional `on_stage(stage, detail)` callback so the job
runner can report real progress. Fix #4: accepts `language` from the UI.
"""
import os
import re
import logging
from typing import Callable, Optional

from asr import dual_mode as asr
from asr.preprocess_audio import preprocess_audio, get_duration_seconds
from llm import extract_actions
from routing import router
from database.supabase_client import get_client
from config import get_settings

logger = logging.getLogger(__name__)

StageCallback = Callable[..., None]


def _norm(text: str) -> list[str]:
    """Lower-case, strip punctuation (keeps Indic letters), split to tokens."""
    text = re.sub(r"[^\w\s]", " ", (text or "").lower(), flags=re.UNICODE)
    return text.split()


def _trigger_in_transcript(trigger: str, transcript: str) -> bool:
    """True if the trigger phrase (roughly) appears in the transcript."""
    t_tokens = _norm(trigger)
    if not t_tokens:
        return False
    tr_tokens = set(_norm(transcript))
    hits = sum(1 for tok in t_tokens if tok in tr_tokens)
    return hits / len(t_tokens) >= 0.7


def _flag_unverified_triggers(actions: list[dict], transcript: str) -> None:
    """
    Fix #4: if an action's trigger phrase can't be found in the transcript
    (script mismatch or LLM paraphrase), cap its confidence below the review
    threshold so the call is flagged 'needs review' instead of silently trusted.
    """
    cap = get_settings().confidence_threshold - 0.01
    for a in actions:
        if not _trigger_in_transcript(a.get("trigger_phrase", ""), transcript):
            a["confidence"] = round(min(float(a.get("confidence", 0.8)), cap), 3)
            logger.warning(f"Trigger phrase not found in transcript: {a.get('trigger_phrase')!r}")


def run(
    audio_path: str,
    original_filename: str = "",
    language: str = "auto",
    on_stage: Optional[StageCallback] = None,
) -> dict:
    """
    Run the full pipeline on an audio file.

    Args:
        audio_path:        Absolute path to uploaded audio file.
        original_filename: Original filename for logging.
        language:          "auto" | "hi" | "kn" | "en" | "ta" | "te" | "ml"
        on_stage:          optional callback(stage, detail) for progress.
    """
    def stage(name: str, detail: str = "", **extra):
        if on_stage:
            try:
                on_stage(name, detail, **extra)
            except Exception:
                logger.exception("on_stage callback failed")

    wav_path = None

    try:
        # ── 1. Preprocess ───────────────────────────────────────────────
        stage("preprocessing")
        logger.info(f"Pipeline: Preprocessing {original_filename}")
        wav_path = preprocess_audio(audio_path)
        duration = get_duration_seconds(wav_path)
        logger.info(f"Pipeline: Duration = {duration}s")

        # ── 2. ASR ──────────────────────────────────────────────────────
        stage("asr")
        logger.info(f"Pipeline: Starting ASR (language={language})...")
        asr_result = asr.transcribe(wav_path, language=language)
        transcript = asr_result["transcript"]
        language_code = asr_result["language_code"]
        asr_provider = asr_result["provider"]
        asr_fallback = bool(asr_result.get("fallback_used", False))
        logger.info(f"Pipeline: ASR done. Provider={asr_provider}, lang={language_code}")

        # ── 3. LLM Extraction ───────────────────────────────────────────
        stage("llm", asr_provider, asr_fallback=asr_fallback)
        logger.info("Pipeline: Starting LLM extraction...")
        extracted = extract_actions.extract(transcript)
        logger.info(f"Pipeline: LLM done. Actions={len(extracted['actions'])}")

        # ── 4. Routing ──────────────────────────────────────────────────
        stage("routing", extracted.get("llm_provider", ""), llm_fallback=bool(extracted.get("llm_fallback", False)))
        logger.info("Pipeline: Routing actions...")
        _flag_unverified_triggers(extracted["actions"], transcript)
        threshold = get_settings().confidence_threshold
        extracted["needs_review"] = any(
            float(a.get("confidence", 1.0)) < threshold for a in extracted["actions"]
        )
        routed_actions = router.route(extracted)

        # ── 5. Save to Supabase ─────────────────────────────────────────
        stage("saving")
        logger.info("Pipeline: Saving to Supabase...")
        db = get_client()

        call_record = {
            "audio_filename": original_filename,
            "duration_seconds": duration,
            "language_detected": extracted.get("language_detected", language_code),
            "patient_name": extracted.get("patient_name"),
            "patient_id": extracted.get("patient_id"),
            "sentiment": extracted.get("sentiment", "neutral"),
            "sentiment_score": extracted.get("sentiment_score", 0.5),
            "raw_transcript": transcript,
            "ai_summary": extracted.get("summary", ""),
            "asr_provider": asr_provider,
            "llm_provider": extracted.get("llm_provider", "unknown"),
            "confidence_score": _avg_confidence(routed_actions),
            "needs_review": extracted.get("needs_review", False),
            "status": "needs_review" if extracted.get("needs_review") else "routed",
        }

        call_resp = db.table("calls").insert(call_record).execute()
        call_id = call_resp.data[0]["id"]
        logger.info(f"Pipeline: Call saved with id={call_id}")

        for action in routed_actions:
            action["call_id"] = call_id

        if routed_actions:
            db.table("actions").insert(routed_actions).execute()
            logger.info(f"Pipeline: {len(routed_actions)} actions saved.")

        return {
            "call_id": call_id,
            "duration_seconds": duration,
            "language_detected": call_record["language_detected"],
            "patient_name": call_record["patient_name"],
            "patient_id": call_record["patient_id"],
            "sentiment": call_record["sentiment"],
            "sentiment_score": call_record["sentiment_score"],
            "summary": call_record["ai_summary"],
            "transcript": transcript,
            "asr_provider": asr_provider,
            "asr_fallback_used": asr_fallback,
            "llm_provider": call_record["llm_provider"],
            "needs_review": call_record["needs_review"],
            "actions": routed_actions,
            "action_count": len(routed_actions),
        }

    finally:
        if wav_path and os.path.exists(wav_path):
            os.unlink(wav_path)
            logger.debug(f"Pipeline: Cleaned up temp file {wav_path}")


def _avg_confidence(actions: list[dict]) -> float:
    if not actions:
        return 1.0
    return round(sum(float(a.get("confidence", 1.0)) for a in actions) / len(actions), 3)

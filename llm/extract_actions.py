"""
Action extractor — core intelligence module.
Loads the prompt, injects transcript, calls LLM, parses JSON output.
"""
import json
import re
import logging
from pathlib import Path
from llm import dual_mode
from config import get_settings

logger = logging.getLogger(__name__)

PROMPT_PATH = Path(__file__).parent / "prompts" / "action_extraction.txt"


def _load_prompt(transcript: str) -> str:
    template = PROMPT_PATH.read_text(encoding="utf-8")
    return template.replace("{transcript}", transcript)


def _clean_json(raw: str) -> str:
    """Strip markdown fences if LLM wraps output in ```json ... ```"""
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return raw.strip()


def _parse_and_validate(raw: str) -> dict:
    """Parse LLM output and validate shape. Raises ValueError on bad output."""
    try:
        data = json.loads(_clean_json(raw))
    except json.JSONDecodeError as e:
        raise ValueError(f"invalid JSON: {e}")

    if not isinstance(data, dict):
        raise ValueError("top-level JSON is not an object")
    if not isinstance(data.get("actions", []), list):
        raise ValueError("'actions' is not a list")
    for i, a in enumerate(data.get("actions", [])):
        if not isinstance(a, dict) or not a.get("action_text"):
            raise ValueError(f"action #{i} is missing 'action_text'")
        try:
            float(a.get("confidence", 1.0))
        except (TypeError, ValueError):
            raise ValueError(f"action #{i} has non-numeric confidence")
    return data


def extract(transcript: str) -> dict:
    """
    Run the full extraction pipeline on a transcript.

    Returns:
        {
            "summary": str,
            "sentiment": str,
            "sentiment_score": float,
            "language_detected": str,
            "actions": [...],
            "llm_provider": str,
            "needs_review": bool
        }
    """
    settings = get_settings()
    prompt = _load_prompt(transcript)

    # dual_mode.complete returns (parsed_dict, provider_name, fallback_used)
    data, provider, llm_fallback = dual_mode.complete(prompt, _parse_and_validate)

    # Normalise required fields
    data.setdefault("patient_name", None)
    data.setdefault("patient_id", None)
    data.setdefault("summary", "")
    data.setdefault("sentiment", "neutral")
    data.setdefault("sentiment_score", 0.5)
    data.setdefault("language_detected", "unknown")
    data.setdefault("urgent_clinical_flag", False)
    data.setdefault("entities", {"medications": [], "doctors": [], "dates": [], "amounts": []})
    data.setdefault("actions", [])

    # Remove internal debug fields the LLM may have added
    for key in ("patient_name_evidence", "patient_id_evidence", "caller_name", "caller_is_patient"):
        data.pop(key, None)

    threshold = settings.confidence_threshold
    needs_review = any(
        float(a.get("confidence", 1.0)) < threshold for a in data["actions"]
    )

    data["llm_provider"] = provider
    data["llm_fallback"] = llm_fallback
    data["needs_review"] = needs_review

    logger.info(
        f"Extraction complete: {len(data['actions'])} actions, "
        f"provider={provider}, fallback={llm_fallback}, needs_review={needs_review}"
    )
    return data

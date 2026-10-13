"""
Router — takes extracted actions and enriches each with:
- Validated department
- Priority score (overrides LLM if keyword signal is stronger)
- Explainability reason
- Assignee from departments.json
"""
import json
import logging
from pathlib import Path
from routing import priority_engine, explainability

logger = logging.getLogger(__name__)

_DEPT_CONFIG = None


def _load_config() -> dict:
    global _DEPT_CONFIG
    if _DEPT_CONFIG is None:
        path = Path(__file__).parent / "departments.json"
        _DEPT_CONFIG = json.loads(path.read_text(encoding="utf-8"))
    return _DEPT_CONFIG


def _valid_depts() -> set:
    """Valid departments = the keys of departments.json (add one there and it works everywhere)."""
    return set(_load_config().get("departments", {}))


def _validate_department(dept: str) -> str:
    """Return dept if valid, else 'Admin' as safe default."""
    if dept in _valid_depts():
        return dept
    logger.warning(f"Unknown department '{dept}' — routing to Admin")
    return "Admin"


def route(extracted: dict) -> list[dict]:
    """
    Enrich extracted actions with routing metadata.

    Args:
        extracted: Output from llm.extract_actions.extract()

    Returns:
        List of enriched action dicts ready for Supabase insert.
    """
    config = _load_config()
    departments = config.get("departments", {})
    sentiment = extracted.get("sentiment", "neutral")
    enriched = []

    for raw in extracted.get("actions", []):
        dept = _validate_department(raw.get("department", "Admin"))
        trigger = raw.get("trigger_phrase", "")
        action_text = raw.get("action_text", "")
        llm_reasoning = raw.get("reasoning", "")
        llm_priority = raw.get("priority", "medium")
        confidence = float(raw.get("confidence", 0.8))

        # Re-score priority using keyword engine (may upgrade LLM estimate)
        kw_priority = priority_engine.score(action_text, trigger, sentiment)

        # Take higher of the two (high > medium > low)
        priority_rank = {"high": 3, "medium": 2, "low": 1}
        final_priority = (
            kw_priority
            if priority_rank.get(kw_priority, 0) >= priority_rank.get(llm_priority, 0)
            else llm_priority
        )

        # Build explainability string
        reason = explainability.build_reason(dept, trigger, action_text, llm_reasoning)

        # Get default assignee
        assignee = departments.get(dept, {}).get("default_assignee", dept)

        enriched.append({
            "action_text": action_text,
            "department": dept,
            "priority": final_priority,
            "trigger_phrase": trigger,
            "reasoning": reason,
            "confidence": confidence,
            "assigned_to": assignee,
            "status": "open",
        })

    return enriched

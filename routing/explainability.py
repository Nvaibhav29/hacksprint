"""
Explainability module.
Generates human-readable "Why was this routed here?" text
shown in the dashboard next to each action card.
"""
import json
from pathlib import Path

_DEPT_CONFIG = None


def _get_dept_config() -> dict:
    global _DEPT_CONFIG
    if _DEPT_CONFIG is None:
        path = Path(__file__).parent / "departments.json"
        _DEPT_CONFIG = json.loads(path.read_text(encoding="utf-8"))
    return _DEPT_CONFIG


def build_reason(
    department: str,
    trigger_phrase: str,
    action_text: str,
    llm_reasoning: str = "",
) -> str:
    """
    Compose a short, plain-English reason string for the dashboard.

    Priority:
    1. Use LLM-provided reasoning if present and non-empty
    2. Fall back to keyword-match explanation
    """
    if llm_reasoning and len(llm_reasoning.strip()) > 10:
        return llm_reasoning.strip()

    config = _get_dept_config()
    dept_info = config.get("departments", {}).get(department, {})
    desc = dept_info.get("description", f"Handled by {department}")

    if trigger_phrase:
        return (
            f"Routed to {department} because the patient mentioned "
            f'"{trigger_phrase}". {desc}.'
        )

    return f"Routed to {department}. {desc}."

"""
Priority engine — scores each action's urgency.
High / Medium / Low based on keyword signals and sentiment.
"""

HIGH_KEYWORDS = [
    "urgent", "emergency", "critical", "immediately", "right now",
    "very angry", "serious", "wrong medicine", "wrong dose",
    "allergic", "adverse", "duplicate charge", "overcharged",
]

MEDIUM_KEYWORDS = [
    "refund", "invoice", "follow-up", "appointment overdue",
    "not called", "waiting", "rescheduled", "incorrect bill",
    "prescription refill",
]

LOW_KEYWORDS = [
    "feedback", "suggestion", "general query", "information",
    "when will", "can you tell",
]


def score(action_text: str, trigger_phrase: str, sentiment: str) -> str:
    """
    Determine priority for a single action item.

    Returns: "high" | "medium" | "low"
    """
    combined = (action_text + " " + trigger_phrase).lower()

    for kw in HIGH_KEYWORDS:
        if kw in combined:
            return "high"

    # Frustrated sentiment bumps medium → high
    if sentiment == "frustrated":
        for kw in MEDIUM_KEYWORDS:
            if kw in combined:
                return "high"

    for kw in MEDIUM_KEYWORDS:
        if kw in combined:
            return "medium"

    for kw in LOW_KEYWORDS:
        if kw in combined:
            return "low"

    return "medium"  # safe default

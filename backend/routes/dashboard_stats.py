"""
Dashboard stats route.
GET /api/stats — aggregated numbers for the dashboard header cards + dept load.
"""
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from database.supabase_client import get_client
from datetime import datetime, timedelta, timezone

router = APIRouter()

# Fix #8: "today" must be the Indian calendar day, not the UTC day, otherwise calls
# made before 5:30 AM IST count as yesterday. (India has no DST, so a fixed
# offset is exact and avoids needing the tzdata package on Windows.)
IST = timezone(timedelta(hours=5, minutes=30))


def _start_of_today_utc_iso() -> str:
    start_ist = datetime.now(IST).replace(hour=0, minute=0, second=0, microsecond=0)
    return start_ist.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@router.get("/stats")
async def get_stats():
    db = get_client()

    # Start of today in IST, expressed in UTC for the query
    since = _start_of_today_utc_iso()

    # Total calls today
    calls_today = (
        db.table("calls")
        .select("id", count="exact")
        .gte("created_at", since)
        .execute()
    )

    # Total open actions
    open_actions = (
        db.table("actions")
        .select("id", count="exact")
        .eq("status", "open")
        .execute()
    )

    # Needs review count
    needs_review = (
        db.table("calls")
        .select("id", count="exact")
        .eq("needs_review", True)
        .eq("status", "needs_review")
        .execute()
    )

    # Avg processing duration today (duration_seconds)
    calls_with_duration = (
        db.table("calls")
        .select("duration_seconds")
        .gte("created_at", since)
        .execute()
    )
    durations = [c["duration_seconds"] for c in calls_with_duration.data if c["duration_seconds"]]
    avg_duration = round(sum(durations) / len(durations)) if durations else 0

    # Department load — open actions per department
    all_open = (
        db.table("actions")
        .select("department")
        .eq("status", "open")
        .execute()
    )
    dept_counts: dict[str, int] = {}
    for row in all_open.data:
        d = row["department"]
        dept_counts[d] = dept_counts.get(d, 0) + 1

    dept_load = [
        {"department": dept, "open_count": count}
        for dept, count in sorted(dept_counts.items(), key=lambda x: -x[1])
    ]

    return JSONResponse(content={
        "calls_today": calls_today.count or 0,
        "open_actions": open_actions.count or 0,
        "needs_review": needs_review.count or 0,
        "avg_duration_seconds": avg_duration,
        "department_load": dept_load,
    })

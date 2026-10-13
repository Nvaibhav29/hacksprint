"""
Tickets / calls read routes.
GET /api/calls          — list calls (paginated, filter: q, status, sentiment, department, priority)
GET /api/calls/{id}     — single call with all actions
PATCH /api/calls/{id}   — edit patient name / mark verified
GET /api/actions        — routed tickets for the department queue board
PATCH /api/actions/{id} — update action status
"""
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from database.supabase_client import get_client
from pydantic import BaseModel
import logging
import re

logger = logging.getLogger(__name__)

router = APIRouter()

PRIORITY_RANK = {"high": 3, "medium": 2, "low": 1}


# ── List all calls ───────────────────────────────────────────────────────────

@router.get("/calls")
async def list_calls(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    q: str | None = Query(None, max_length=100),
    status: str | None = None,
    sentiment: str | None = None,
    department: str | None = None,
    priority: str | None = None,
):
    db = get_client()
    offset = (page - 1) * per_page

    # Department / priority live on the actions table: find matching call ids first.
    id_filter: list[str] | None = None
    if department or priority:
        aq = db.table("actions").select("call_id")
        if department:
            aq = aq.eq("department", department)
        if priority:
            aq = aq.eq("priority", priority)
        id_filter = sorted({r["call_id"] for r in aq.execute().data})
        if not id_filter:
            return JSONResponse(content={"calls": [], "page": page, "per_page": per_page})

    query = db.table("calls").select(
        "id, created_at, audio_filename, duration_seconds, language_detected, patient_name, "
        "patient_id, sentiment, ai_summary, asr_provider, llm_provider, needs_review, status"
    )
    if status:
        query = query.eq("status", status)
    if sentiment:
        query = query.eq("sentiment", sentiment)
    if id_filter is not None:
        query = query.in_("id", id_filter)
    if q:
        # strip characters that have meaning in PostgREST filter syntax
        term = re.sub(r"[,()%*\\]", " ", q).strip()
        if term:
            query = query.or_(
                f"patient_name.ilike.%{term}%,patient_id.ilike.%{term}%,"
                f"audio_filename.ilike.%{term}%,ai_summary.ilike.%{term}%"
            )

    resp = query.order("created_at", desc=True).range(offset, offset + per_page - 1).execute()
    calls = resp.data

    # Fix #8: dashboard "Actions" column needs action_count per call.
    # Also returns the departments each call touches so the list can show them.
    counts: dict[str, int] = {}
    depts: dict[str, set] = {}
    ids = [c["id"] for c in calls]
    if ids:
        rows = db.table("actions").select("call_id, department").in_("call_id", ids).execute().data
        for r in rows:
            counts[r["call_id"]] = counts.get(r["call_id"], 0) + 1
            depts.setdefault(r["call_id"], set()).add(r["department"])
    for c in calls:
        c["action_count"] = counts.get(c["id"], 0)
        c["departments"] = sorted(depts.get(c["id"], []))

    return JSONResponse(content={"calls": calls, "page": page, "per_page": per_page})


# ── Routed tickets (department queue board) ──────────────────────────────────
@router.get("/actions")
async def list_actions(
    department: str | None = None,
    status: str | None = None,
    limit: int = Query(500, ge=1, le=1000),
):
    db = get_client()
    query = db.table("actions").select("*")
    if department:
        query = query.eq("department", department)
    if status:
        query = query.eq("status", status)
    actions = query.order("created_at", desc=True).limit(limit).execute().data

    # attach patient + call info so a ticket makes sense on its own
    call_ids = list({a["call_id"] for a in actions if a.get("call_id")})
    calls: dict[str, dict] = {}
    if call_ids:
        rows = (
            db.table("calls")
            .select("id, patient_name, patient_id, created_at, sentiment")
            .in_("id", call_ids)
            .execute()
            .data
        )
        calls = {r["id"]: r for r in rows}
    for a in actions:
        c = calls.get(a.get("call_id"), {})
        a["patient_name"] = c.get("patient_name")
        a["patient_id"] = c.get("patient_id")
        a["call_created_at"] = c.get("created_at")
        a["call_sentiment"] = c.get("sentiment")

    actions.sort(
        key=lambda a: PRIORITY_RANK.get((a.get("priority") or "").lower(), 0),
        reverse=True,
    )
    return JSONResponse(content={"actions": actions})


# ── Single call with actions ─────────────────────────────────────────────────
@router.get("/calls/{call_id}")
async def get_call(call_id: str):
    db = get_client()

    call_resp = db.table("calls").select("*").eq("id", call_id).execute()
    if not call_resp.data:
        raise HTTPException(status_code=404, detail="Call not found")

    # Fix #2: sorting the text column alphabetically gave medium, low, high.
    # Fetch in creation order and sort by real priority rank in Python.
    actions_resp = (
        db.table("actions")
        .select("*")
        .eq("call_id", call_id)
        .order("created_at")
        .execute()
    )
    actions = sorted(
        actions_resp.data,
        key=lambda a: PRIORITY_RANK.get((a.get("priority") or "").lower(), 0),
        reverse=True,   # high first; sort is stable so ties keep creation order
    )

    return JSONResponse(content={
        "call": call_resp.data[0],
        "actions": actions,
    })


# ── Edit patient header (name / verified) ────────────────────────────────────
class CallUpdate(BaseModel):
    patient_name: str | None = None
    patient_verified: bool | None = None


@router.patch("/calls/{call_id}")
async def update_call(call_id: str, body: CallUpdate):
    db = get_client()
    data: dict = {}
    if body.patient_name is not None:
        name = body.patient_name.strip()
        if len(name) > 120:
            raise HTTPException(status_code=400, detail="Name is too long.")
        data["patient_name"] = name or None
    if not data and body.patient_verified is None:
        raise HTTPException(status_code=400, detail="Nothing to update.")

    verified_saved = False
    if body.patient_verified is not None:
        try:
            resp = db.table("calls").update({**data, "patient_verified": body.patient_verified}).eq("id", call_id).execute()
            verified_saved = True
        except Exception:
            # patient_verified column not migrated yet — still save the name.
            logger.warning("calls.patient_verified missing; run database/migrations/002_patient_verified.sql")
            resp = db.table("calls").update(data).eq("id", call_id).execute() if data else None
    else:
        resp = db.table("calls").update(data).eq("id", call_id).execute()

    if resp is None or not resp.data:
        raise HTTPException(status_code=404, detail="Call not found")
    return JSONResponse(content={"updated": resp.data[0], "verified_saved": verified_saved})


# ── Update action status ─────────────────────────────────────────────────────
class ActionUpdate(BaseModel):
    status: str | None = None       # open | in_progress | resolved
    assigned_to: str | None = None
    department: str | None = None   # manual re-route by staff


@router.patch("/actions/{action_id}")
async def update_action(action_id: str, body: ActionUpdate):
    db = get_client()

    update_data: dict = {}
    if body.status is not None:
        if body.status not in ("open", "in_progress", "resolved"):
            raise HTTPException(status_code=400, detail="Invalid status.")
        update_data["status"] = body.status
    if body.assigned_to is not None:
        update_data["assigned_to"] = body.assigned_to
    if body.department is not None:
        # same source of truth the router uses
        from routing.router import _valid_depts, _load_config
        if body.department not in _valid_depts():
            raise HTTPException(status_code=400, detail="Unknown department.")
        update_data["department"] = body.department
        if body.assigned_to is None:
            update_data["assigned_to"] = (
                _load_config()["departments"][body.department].get("default_assignee", body.department)
            )
    if not update_data:
        raise HTTPException(status_code=400, detail="Nothing to update.")

    resp = db.table("actions").update(update_data).eq("id", action_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Action not found")

    return JSONResponse(content={"updated": resp.data[0]})

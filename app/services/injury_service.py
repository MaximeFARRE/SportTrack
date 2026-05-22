"""Injury tracking service.

Provides CRUD operations on the ``injuries`` Supabase table, ACWR context
computation for a given reference date, and suggestion detection based on
``body_feeling_tags`` (douleur_* keys) in recent activities.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

# body_feeling_tags keys that signal pain, mapped to their canonical zone label
_PAIN_TAG_ZONES: dict[str, str] = {
    "douleur_genou_droit": "genou_droit",
    "douleur_genou_gauche": "genou_gauche",
    "douleur_dos": "dos",
    "douleur_cheville": "cheville",
    "douleur_hanche": "hanche",
    "douleur_epaule": "epaule",
}


def _get_supabase():  # type: ignore[return]
    try:
        from supabase import create_client
        return create_client(settings.supabase_url, settings.supabase_service_role_key)
    except Exception as exc:
        raise RuntimeError(f"Cannot create Supabase client: {exc}") from exc


def _avg(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


# ─── CRUD ────────────────────────────────────────────────────────────────────

def list_injuries(user_id: str) -> list[dict]:
    client = _get_supabase()
    response = (
        client.table("injuries")
        .select("*")
        .eq("user_id", user_id)
        .order("start_date", desc=True)
        .execute()
    )
    return response.data or []


def get_injury(user_id: str, injury_id: str) -> dict | None:
    client = _get_supabase()
    response = (
        client.table("injuries")
        .select("*")
        .eq("user_id", user_id)
        .eq("id", injury_id)
        .maybe_single()
        .execute()
    )
    return response.data


def create_injury(user_id: str, payload: dict[str, Any]) -> dict:
    client = _get_supabase()
    data: dict[str, Any] = {**payload, "user_id": user_id}
    for key in ("start_date", "end_date"):
        if isinstance(data.get(key), date):
            data[key] = data[key].isoformat()
    response = client.table("injuries").insert(data).execute()
    return response.data[0]


def update_injury(user_id: str, injury_id: str, payload: dict[str, Any]) -> dict:
    client = _get_supabase()
    data = {k: v for k, v in payload.items() if v is not None}
    for key in ("start_date", "end_date"):
        if isinstance(data.get(key), date):
            data[key] = data[key].isoformat()
    response = (
        client.table("injuries")
        .update(data)
        .eq("user_id", user_id)
        .eq("id", injury_id)
        .execute()
    )
    if not response.data:
        raise LookupError("Blessure introuvable")
    return response.data[0]


def delete_injury(user_id: str, injury_id: str) -> None:
    client = _get_supabase()
    client.table("injuries").delete().eq("user_id", user_id).eq("id", injury_id).execute()


# ─── ACWR context ─────────────────────────────────────────────────────────────

def get_acwr_context(user_id: str, reference_date: date) -> dict[str, Any]:
    """Return ACWR and 14-day load trend ending on reference_date.

    Uses 28 days of daily_metrics to compute chronic load and the last 7 days
    for acute load, consistent with the overtraining_detection algorithm.
    """
    since = (reference_date - timedelta(days=28)).isoformat()
    client = _get_supabase()
    response = (
        client.table("daily_metrics")
        .select("metric_date, training_load")
        .eq("user_id", user_id)
        .gte("metric_date", since)
        .lte("metric_date", reference_date.isoformat())
        .order("metric_date")
        .execute()
    )
    rows = response.data or []
    loads = [r["training_load"] for r in rows if r.get("training_load") is not None]

    chronic = _avg(loads)
    acute = _avg(loads[-7:] if len(loads) >= 7 else loads)
    acwr = round(acute / chronic, 2) if chronic > 0 else 0.0

    trend = [
        {"date": r["metric_date"], "load": r["training_load"]}
        for r in rows[-14:]
    ]
    return {
        "reference_date": reference_date.isoformat(),
        "acwr": acwr,
        "acute_load_7d": round(acute, 1),
        "chronic_load_28d": round(chronic, 1),
        "trend_14d": trend,
    }


# ─── Suggestion detection ─────────────────────────────────────────────────────

def get_injury_suggestions(user_id: str) -> list[dict[str, Any]]:
    """Detect zones where 3+ recent activities carry a douleur_* tag.

    Queries activities from the last 30 days and inspects body_feeling_tags
    (a JSON array of tag keys). Returns one suggestion per zone with >= 3 hits.
    """
    since = (date.today() - timedelta(days=30)).isoformat()
    client = _get_supabase()
    response = (
        client.table("activities")
        .select("id, name, start_date, body_feeling_tags")
        .eq("user_id", user_id)
        .gte("start_date", since)
        .order("start_date")
        .execute()
    )
    activities = response.data or []

    zone_hits: dict[str, list[dict]] = {}
    for act in activities:
        tags = act.get("body_feeling_tags") or []
        if not isinstance(tags, list):
            continue
        for tag in tags:
            zone = _PAIN_TAG_ZONES.get(tag)
            if zone:
                zone_hits.setdefault(zone, []).append(act)

    suggestions = []
    for zone, acts in zone_hits.items():
        if len(acts) >= 3:
            suggestions.append({
                "body_zone": zone,
                "activity_count": len(acts),
                "first_date": acts[0]["start_date"][:10],
                "last_date": acts[-1]["start_date"][:10],
                "message": (
                    f"Voulez-vous déclarer une blessure ? "
                    f"{len(acts)} activités signalent une douleur : {zone.replace('_', ' ')}"
                ),
            })
    return suggestions


# ─── Scheduler utility ────────────────────────────────────────────────────────

def get_active_user_ids() -> list[str]:
    """Return distinct user IDs with at least one activity in the last 30 days."""
    client = _get_supabase()
    since = (date.today() - timedelta(days=30)).isoformat()
    response = (
        client.table("activities")
        .select("user_id")
        .gte("start_date", since)
        .execute()
    )
    seen: set[str] = set()
    result: list[str] = []
    for row in response.data or []:
        uid = row["user_id"]
        if uid not in seen:
            seen.add(uid)
            result.append(uid)
    return result

"""Strava integration router.

User-facing:
  POST /strava/sync          — import recent Strava activities (JWT auth)
  GET  /strava/sync/history  — import up to N days of history (JWT auth)

Internal (called by Next.js server-side):
  POST /internal/strava/exchange   — exchange OAuth code for tokens (INTERNAL_SECRET)
  POST /internal/strava/activity   — sync one activity by ID (INTERNAL_SECRET, for webhooks)
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from supabase import create_client

from app.auth.supabase_auth import get_current_user_id, require_internal_secret
from app.config import settings
from app.services.strava_service import (
    ensure_valid_access_token_for_user,
    exchange_code_for_token,
    fetch_athlete_activities,
    get_strava_connection,
    upsert_strava_connection,
)

router = APIRouter(prefix="/strava", tags=["strava"])
internal_router = APIRouter(prefix="/internal", tags=["internal"])


def _service_client():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


# ── Internal endpoints ────────────────────────────────────────────────────────

class ExchangePayload(BaseModel):
    code: str
    user_id: str


@internal_router.post("/strava/exchange", dependencies=[Depends(require_internal_secret)])
def exchange_strava_oauth(body: ExchangePayload) -> dict:
    """Exchange an OAuth authorization code for tokens and store them."""
    try:
        uid = UUID(body.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="user_id invalide") from exc

    try:
        token_payload = exchange_code_for_token(body.code)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    client = _service_client()
    connection = upsert_strava_connection(client, uid, token_payload)
    return {"connected": True, "provider_user_id": connection["provider_user_id"]}


class SingleActivityPayload(BaseModel):
    user_id: str
    activity_id: int


@internal_router.post("/strava/activity", dependencies=[Depends(require_internal_secret)])
def sync_single_strava_activity(body: SingleActivityPayload) -> dict:
    """Sync one specific Strava activity (called from webhook handler)."""
    try:
        uid = UUID(body.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="user_id invalide") from exc

    client = _service_client()

    try:
        access_token = ensure_valid_access_token_for_user(client, uid)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    # Fetch the single activity from Strava
    import json
    from urllib.request import Request, urlopen

    url = f"https://www.strava.com/api/v3/activities/{body.activity_id}"
    req = Request(url, headers={"Authorization": f"Bearer {access_token}"}, method="GET")
    try:
        with urlopen(req, timeout=20) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Échec fetch Strava") from exc

    activity = _map_strava_activity(str(uid), raw)
    if activity:
        client.table("activities").upsert(
            activity, on_conflict="user_id,provider,provider_activity_id"
        ).execute()

    return {"synced": 1 if activity else 0}


# ── User-facing endpoints ─────────────────────────────────────────────────────

@router.post("/sync")
def sync_strava_activities(
    per_page: int = Query(default=30, ge=1, le=200),
    user_id: UUID = Depends(get_current_user_id),
) -> dict:
    """Import the most recent activities from Strava for the authenticated user."""
    client = _service_client()

    try:
        access_token = ensure_valid_access_token_for_user(client, user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    try:
        activities_raw = fetch_athlete_activities(access_token, per_page=per_page)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    synced = 0
    for raw in activities_raw:
        activity = _map_strava_activity(str(user_id), raw)
        if activity:
            client.table("activities").upsert(
                activity, on_conflict="user_id,provider,provider_activity_id"
            ).execute()
            synced += 1

    client.table("provider_connections").update({
        "last_sync_at": datetime.now(UTC).isoformat(),
    }).eq("user_id", str(user_id)).eq("provider", "strava").execute()

    return {"synced": synced}


@router.get("/sync/history")
def sync_strava_history(
    days: int = Query(default=90, ge=1, le=365),
    user_id: UUID = Depends(get_current_user_id),
) -> dict:
    """Import historical activities going back up to `days` days."""
    from datetime import timedelta

    client = _service_client()

    try:
        access_token = ensure_valid_access_token_for_user(client, user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    after_ts = int((datetime.now(UTC) - timedelta(days=days)).timestamp())

    page = 1
    total_synced = 0
    while True:
        try:
            batch = fetch_athlete_activities(
                access_token, per_page=200, page=page, after=after_ts
            )
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

        if not batch:
            break

        for raw in batch:
            activity = _map_strava_activity(str(user_id), raw)
            if activity:
                client.table("activities").upsert(
                    activity, on_conflict="user_id,provider,provider_activity_id"
                ).execute()
                total_synced += 1

        if len(batch) < 200:
            break
        page += 1

    client.table("provider_connections").update({
        "last_sync_at": datetime.now(UTC).isoformat(),
    }).eq("user_id", str(user_id)).eq("provider", "strava").execute()

    return {"synced": total_synced}


# ── Mapping helper ────────────────────────────────────────────────────────────

def _map_strava_activity(user_id: str, raw: dict[str, Any]) -> dict | None:
    activity_id = raw.get("id")
    start_date = raw.get("start_date")
    sport_type = raw.get("sport_type") or raw.get("type") or "unknown"

    if not activity_id or not start_date:
        return None

    return {
        "user_id": user_id,
        "provider": "strava",
        "provider_activity_id": str(activity_id),
        "name": raw.get("name"),
        "sport_type": sport_type,
        "start_date": start_date,
        "timezone": raw.get("timezone"),
        "duration_sec": raw.get("elapsed_time"),
        "moving_time_sec": raw.get("moving_time"),
        "distance_m": raw.get("distance"),
        "elevation_gain_m": raw.get("total_elevation_gain"),
        "average_speed": raw.get("average_speed"),
        "max_speed": raw.get("max_speed"),
        "average_heartrate": raw.get("average_heartrate"),
        "max_heartrate": raw.get("max_heartrate"),
        "average_cadence": raw.get("average_cadence"),
        "average_power": raw.get("average_watts"),
        "calories": raw.get("kilojoules"),
        "source": "strava",
    }

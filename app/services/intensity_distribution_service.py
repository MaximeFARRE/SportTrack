"""Time-in-zones computation from Strava HR streams.

Main public function:
  compute_time_in_zones(user_id, activity_id) -> list[dict] | None

The function fetches the heartrate stream from the Strava API, classifies
each second against the user's HR zone boundaries (Supabase ``hr_zones``),
and persists the result in ``activities.time_in_zones_json``.

Returns None when the activity has no HR stream or is not a Strava activity.
"""
from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any
from urllib.request import Request, urlopen

from app.config import settings
from app.services.hr_zones_service import FRIEL_ZONES

logger = logging.getLogger(__name__)

STRAVA_STREAMS_URL = "https://www.strava.com/api/v3/activities/{id}/streams"
TOKEN_REFRESH_BUFFER_SECONDS = 5 * 60

# Static zone metadata keyed by zone_number
_ZONE_META: dict[int, dict[str, str]] = {
    z[0]: {"name": z[1], "color": z[4]}
    for z in FRIEL_ZONES
}


def _get_supabase():  # type: ignore[return]
    try:
        from supabase import create_client
        return create_client(settings.supabase_url, settings.supabase_service_role_key)
    except Exception as exc:
        raise RuntimeError(f"Cannot create Supabase client: {exc}") from exc


# ─── Strava token helpers ─────────────────────────────────────────────────────

def _get_strava_token(user_id: str) -> str | None:
    """Return a valid Strava access token for user_id, refreshing if needed."""
    client = _get_supabase()
    result = (
        client.table("provider_connections")
        .select("access_token, refresh_token, token_expires_at")
        .eq("user_id", user_id)
        .eq("provider", "strava")
        .eq("is_active", True)
        .maybe_single()
        .execute()
    )
    conn = result.data
    if not conn or not conn.get("access_token"):
        return None

    now_ts = int(datetime.now(UTC).timestamp())
    expires_at = conn.get("token_expires_at") or 0
    if expires_at > now_ts + TOKEN_REFRESH_BUFFER_SECONDS:
        return conn["access_token"]

    # Token expired — refresh
    refresh_token = conn.get("refresh_token")
    if not refresh_token:
        return conn["access_token"]

    try:
        from app.services.strava_service import refresh_access_token
        refreshed = refresh_access_token(refresh_token)
    except Exception as exc:
        logger.warning("intensity_distribution: token refresh failed for user=%s: %s", user_id, exc)
        return conn["access_token"]

    new_access = refreshed.get("access_token")
    new_refresh = refreshed.get("refresh_token", refresh_token)
    new_expires = refreshed.get("expires_at", expires_at)

    client.table("provider_connections").update({
        "access_token": new_access,
        "refresh_token": new_refresh,
        "token_expires_at": new_expires,
    }).eq("user_id", user_id).eq("provider", "strava").execute()

    return new_access


# ─── Strava stream fetch ──────────────────────────────────────────────────────

def _fetch_hr_stream(access_token: str, strava_activity_id: str) -> list[int] | None:
    """Return HR values (one per second) from the Strava streams endpoint."""
    url = STRAVA_STREAMS_URL.format(id=strava_activity_id)
    url += "?keys=heartrate&key_by_type=true"
    request = Request(url, headers={"Authorization": f"Bearer {access_token}"}, method="GET")
    try:
        with urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        logger.warning("intensity_distribution: stream fetch failed for activity=%s: %s", strava_activity_id, exc)
        return None

    if not isinstance(payload, dict):
        return None
    heartrate = payload.get("heartrate")
    if not heartrate or not isinstance(heartrate.get("data"), list):
        return None
    return heartrate["data"]


# ─── Zone classification ──────────────────────────────────────────────────────

def _get_user_zones(user_id: str) -> list[dict[str, Any]]:
    """Return the user's HR zones from Supabase, ordered by zone_number."""
    client = _get_supabase()
    result = (
        client.table("hr_zones")
        .select("zone_number, zone_name, hr_min, hr_max, color_hex")
        .eq("user_id", user_id)
        .order("zone_number")
        .execute()
    )
    return result.data or []


def _classify_seconds(
    hr_data: list[int],
    zones: list[dict[str, Any]],
) -> dict[int, int]:
    """Return {zone_number: seconds_count} from an HR time series."""
    counts: dict[int, int] = {z["zone_number"]: 0 for z in zones}
    sorted_zones = sorted(zones, key=lambda z: z["zone_number"])
    for bpm in hr_data:
        for zone in sorted_zones:
            z_min = zone["hr_min"]
            z_max = zone["hr_max"]
            if z_max is None or bpm < z_max:
                if bpm >= z_min:
                    counts[zone["zone_number"]] += 1
                    break
    return counts


def _build_zones_json(
    counts: dict[int, int],
    zones: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Build the JSON array stored in activities.time_in_zones_json."""
    result = []
    for zone in sorted(zones, key=lambda z: z["zone_number"]):
        zn = zone["zone_number"]
        meta = _ZONE_META.get(zn, {})
        result.append({
            "zone": zn,
            "name": zone.get("zone_name") or meta.get("name", f"Z{zn}"),
            "color": zone.get("color_hex") or meta.get("color", "#888888"),
            "sec": counts.get(zn, 0),
        })
    return result


# ─── Public API ───────────────────────────────────────────────────────────────

def compute_time_in_zones(user_id: str, activity_id: str) -> list[dict[str, Any]] | None:
    """Compute time-in-zones for a Supabase activity and persist the result.

    Returns the zones list (5 entries) or None if computation is not possible
    (non-Strava activity, missing access token, or no HR data in stream).
    """
    client = _get_supabase()
    act_result = (
        client.table("activities")
        .select("provider, provider_activity_id, duration_sec")
        .eq("id", activity_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    activity = act_result.data
    if not activity:
        raise LookupError(f"Activité {activity_id} introuvable pour user {user_id}")

    if activity.get("provider") != "strava":
        return None

    strava_id = activity.get("provider_activity_id")
    if not strava_id:
        return None

    token = _get_strava_token(user_id)
    if not token:
        return None

    hr_data = _fetch_hr_stream(token, strava_id)
    if not hr_data:
        return None

    zones = _get_user_zones(user_id)
    if not zones:
        return None

    counts = _classify_seconds(hr_data, zones)
    zones_json = _build_zones_json(counts, zones)

    client.table("activities").update(
        {"time_in_zones_json": zones_json}
    ).eq("id", activity_id).eq("user_id", user_id).execute()

    logger.info(
        "intensity_distribution: computed zones for activity=%s user=%s",
        activity_id,
        user_id,
    )
    return zones_json


def compute_polarization_ratio(zones_json: list[dict[str, Any]]) -> dict[str, float]:
    """Return low/medium/high percentages for a polarization analysis.

    Low  = Z1 + Z2  (endurance base)
    Mid  = Z3        (tempo)
    High = Z4 + Z5  (threshold/anaerobic)
    """
    secs: dict[int, int] = {z["zone"]: z["sec"] for z in zones_json}
    low = secs.get(1, 0) + secs.get(2, 0)
    mid = secs.get(3, 0)
    high = secs.get(4, 0) + secs.get(5, 0)
    total = low + mid + high

    if total == 0:
        return {"low_pct": 0.0, "mid_pct": 0.0, "high_pct": 0.0}

    return {
        "low_pct": round(low / total * 100, 1),
        "mid_pct": round(mid / total * 100, 1),
        "high_pct": round(high / total * 100, 1),
    }

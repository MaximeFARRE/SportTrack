"""Terra API integration service.

Terra routes Garmin/Polar/Fitbit/Apple Health data via webhooks into our
daily_metrics table and provider_connections table.

Widget session flow:
  1. Next.js calls /terra/widget-session (JWT-authenticated)
  2. FastAPI calls Terra to generate a widget URL
  3. User authenticates with their device provider through Terra's widget
  4. Terra calls our webhook with type="auth" and reference_id=user_id

Daily data flow:
  Terra sends webhooks with type="daily" or type="sleep" containing
  health metrics, which are upserted into daily_metrics.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import urllib.request
from datetime import date
from typing import Any
from uuid import UUID

from app.config import settings

TERRA_BASE_URL = "https://api.tryterra.co/v2"


def _terra_headers() -> dict[str, str]:
    return {
        "dev-id": settings.terra_dev_id,
        "x-api-key": settings.terra_api_key,
        "Content-Type": "application/json",
    }


def generate_widget_session(user_id: UUID, success_redirect_url: str) -> str:
    """Call Terra to obtain a widget session URL for the given user.

    The reference_id is set to the Supabase user_id so Terra includes it
    in the auth webhook, letting us link the terra_user_id back to our user.
    """
    if not settings.terra_dev_id or not settings.terra_api_key:
        raise ValueError("TERRA_DEV_ID / TERRA_API_KEY manquants.")

    payload = json.dumps({
        "reference_id": str(user_id),
        "providers": "GARMIN,POLAR,FITBIT,APPLE",
        "auth_success_redirect_url": success_redirect_url,
        "language": "fr",
    }).encode()

    req = urllib.request.Request(
        f"{TERRA_BASE_URL}/auth/generateWidgetSession",
        data=payload,
        headers=_terra_headers(),
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read())

    widget_url: str | None = data.get("url")
    if not widget_url:
        raise ValueError(f"Terra widget session error: {data}")
    return widget_url


def verify_webhook_signature(raw_body: bytes, header: str) -> bool:
    """Return True if the Terra-Signature header is valid.

    Terra uses HMAC-SHA256: signature = HMAC(secret, f"{timestamp}.{raw_body}").
    Header format: "t=<timestamp>,v1=<hex_signature>"
    """
    secret = settings.terra_webhook_secret
    if not secret:
        return False

    parts: dict[str, str] = {}
    for part in header.split(","):
        k, _, v = part.partition("=")
        parts[k.strip()] = v.strip()

    timestamp = parts.get("t", "")
    received_sig = parts.get("v1", "")
    if not timestamp or not received_sig:
        return False

    message = f"{timestamp}.".encode() + raw_body
    expected = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, received_sig)


def upsert_terra_connection(supabase_client: Any, user_id: UUID, terra_user_id: str, provider: str) -> None:
    """Create or reactivate a Terra provider connection for the given user."""
    supabase_client.table("provider_connections").upsert(
        {
            "user_id": str(user_id),
            "provider": "terra",
            "provider_user_id": terra_user_id,
            "is_active": True,
        },
        on_conflict="user_id,provider",
    ).execute()


def resolve_user_id(supabase_client: Any, terra_user_id: str) -> UUID | None:
    """Look up the Supabase user_id for a given Terra user_id."""
    result = (
        supabase_client.table("provider_connections")
        .select("user_id")
        .eq("provider", "terra")
        .eq("provider_user_id", terra_user_id)
        .eq("is_active", True)
        .maybe_single()
        .execute()
    )
    if result.data:
        return UUID(result.data["user_id"])
    return None


def normalize_daily(data_entry: dict[str, Any]) -> dict[str, Any]:
    """Extract daily metric fields from a single Terra daily data entry."""
    meta = data_entry.get("metadata") or {}
    start_time: str = meta.get("start_time") or meta.get("end_time") or ""

    hr_summary = (data_entry.get("heart_rate_data") or {}).get("summary") or {}
    hrv_summary = (data_entry.get("hrv_data") or {}).get("summary") or {}
    stress = data_entry.get("stress_data") or {}
    oxygen = data_entry.get("oxygen_data") or {}
    respiration = (data_entry.get("respiration_data") or {}).get("breaths_data") or {}
    vo2 = data_entry.get("vo2max_data") or {}

    resting_hr = hr_summary.get("resting_hr_bpm")
    hrv_rmssd = hrv_summary.get("rmssd_sdnn") or hrv_summary.get("avg_rmssd_ms")
    stress_avg = stress.get("avg_stress_level")
    spo2_avg = oxygen.get("avg_saturation_percentage")
    resp_avg = respiration.get("avg_breaths_per_min")
    vo2max = vo2.get("vo2max_ml_per_min_per_kg")

    return {
        "metric_date": start_time[:10] if start_time else None,
        "resting_hr": round(resting_hr) if resting_hr is not None else None,
        "hrv_rmssd": hrv_rmssd,
        "stress_score_avg": round(stress_avg) if stress_avg is not None else None,
        "spo2_avg": spo2_avg,
        "respiration_avg": resp_avg,
        "vo2max_estimated": vo2max,
    }


def normalize_sleep(data_entry: dict[str, Any]) -> dict[str, Any]:
    """Extract sleep metric fields from a single Terra sleep data entry."""
    meta = data_entry.get("metadata") or {}
    start_time: str = meta.get("start_time") or ""

    durations = data_entry.get("sleep_durations_data") or {}
    readiness = data_entry.get("readiness_data") or {}
    score_raw = readiness.get("readiness_score_percentage")

    # Terra returns readiness as 0-1 float or 0-100 int depending on provider
    sleep_score: int | None = None
    if score_raw is not None:
        sleep_score = round(score_raw * 100) if score_raw <= 1 else round(score_raw)

    def _to_min(seconds: float | None) -> int | None:
        return round(seconds / 60) if seconds is not None else None

    awake_sec = (durations.get("awake") or {}).get("duration_awake_state_seconds")
    light_sec = (durations.get("light_sleep") or {}).get("duration_light_sleep_state_seconds")
    deep_sec = (durations.get("deep_sleep") or {}).get("duration_deep_sleep_state_seconds")
    rem_sec = (durations.get("rem_sleep") or {}).get("duration_REM_sleep_state_seconds")

    parts = [awake_sec, light_sec, deep_sec, rem_sec]
    total_min = round(sum(p for p in parts if p is not None) / 60) if any(p is not None for p in parts) else None

    return {
        "metric_date": start_time[:10] if start_time else None,
        "sleep_score": sleep_score,
        "sleep_duration_min": total_min,
        "sleep_awake_min": _to_min(awake_sec),
        "sleep_light_min": _to_min(light_sec),
        "sleep_deep_min": _to_min(deep_sec),
        "sleep_rem_min": _to_min(rem_sec),
    }

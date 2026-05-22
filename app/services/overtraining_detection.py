"""Multivariate overtraining detection service.

Algorithm from DESIGN_NEXT.md §7.2:

  raw_score = 0
  if ACWR > 1.5:                    raw_score += 3   # charge aiguë trop haute
  if TSB < -20:                     raw_score += 2   # fatigue accumulée
  if HRV < baseline_28d - 10:       raw_score += 3   # SNA perturbé
  if resting_hr > baseline_28d + 5: raw_score += 2   # FC repos élevée
  if sleep_score < 50:              raw_score += 2   # récupération nocturne insuffisante
  if body_battery < 40:             raw_score += 1   # réserves faibles

  Max raw = 13. Normalized: score = round(raw * 10 / 13), clamped 0–10.

  Level mapping:
    0      → none
    1–2    → low
    3–4    → moderate
    5–7    → high
    8–10   → critical
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)


# ─── Supabase client helper ───────────────────────────────────────────────────

def _get_supabase():  # type: ignore[return]
    """Return a Supabase client using the service-role key."""
    try:
        from supabase import create_client
        return create_client(settings.supabase_url, settings.supabase_service_role_key)
    except Exception as exc:
        raise RuntimeError(f"Cannot create Supabase client: {exc}") from exc


# ─── Pure helpers ─────────────────────────────────────────────────────────────

def _avg(values: list[float | None]) -> float | None:
    valid = [v for v in values if v is not None]
    return sum(valid) / len(valid) if valid else None


def _score_to_level(score: int) -> str:
    if score == 0:
        return "none"
    if score <= 2:
        return "low"
    if score <= 4:
        return "moderate"
    if score <= 7:
        return "high"
    return "critical"


# ─── Core algorithm ───────────────────────────────────────────────────────────

def compute_risk(user_id: str, target_date: date | None = None) -> dict[str, Any]:
    """Compute the overtraining risk score for *user_id* on *target_date*.

    Queries the last 28 days of ``daily_metrics`` from Supabase, applies the
    multivariate algorithm, and returns a result dict ready for upsert.

    Returns:
        {user_id, assessment_date, score (0–10), level, reasons (list[str])}
    """
    if target_date is None:
        target_date = date.today()

    since = (target_date - timedelta(days=28)).isoformat()
    client = _get_supabase()

    response = (
        client.table("daily_metrics")
        .select(
            "metric_date, training_load, hrv_rmssd, resting_hr,"
            " sleep_score, body_battery_morning"
        )
        .eq("user_id", user_id)
        .gte("metric_date", since)
        .lte("metric_date", target_date.isoformat())
        .order("metric_date")
        .execute()
    )

    rows: list[dict] = response.data or []

    if not rows:
        return {
            "user_id": user_id,
            "assessment_date": target_date.isoformat(),
            "score": 0,
            "level": "none",
            "reasons": [],
        }

    # Extract time-series
    loads: list[float | None] = [r["training_load"] for r in rows]
    hrv_values: list[float | None] = [r["hrv_rmssd"] for r in rows]
    hr_values: list[float | None] = [r["resting_hr"] for r in rows]

    # 28-day baselines
    baseline_hrv = _avg(hrv_values)
    baseline_hr = _avg(hr_values)

    # Latest day
    latest = rows[-1]
    hrv_today: float | None = latest["hrv_rmssd"]
    rhr_today: float | None = latest["resting_hr"]
    sleep_today: float | None = latest["sleep_score"]
    battery_today: float | None = latest["body_battery_morning"]

    # ACWR: 7-day avg / 28-day avg training load
    loads_28 = [v for v in loads if v is not None]
    loads_7 = [v for v in loads[-7:] if v is not None]
    chronic = _avg(loads_28) or 0.0
    acute = _avg(loads_7) or 0.0
    acwr = acute / chronic if chronic > 0 else 0.0

    # Pseudo-TSB: chronic load − acute load
    # Positive = rested, negative = fatigued (like CTL − ATL)
    tsb = chronic - acute

    # ── Scoring ───────────────────────────────────────────────────────────────
    raw_score = 0
    reasons: list[str] = []

    if acwr > 1.5:
        raw_score += 3
        reasons.append(
            f"ACWR à {acwr:.2f} — charge aiguë trop élevée (seuil critique : 1.5)"
        )

    if tsb < -20:
        raw_score += 2
        reasons.append(
            f"Balance charge à {tsb:.1f} — fatigue accumulée importante"
        )

    if hrv_today is not None and baseline_hrv is not None and baseline_hrv > 0:
        if hrv_today < baseline_hrv - 10:
            raw_score += 3
            reasons.append(
                f"HRV ({hrv_today:.0f} ms) bien en dessous de la baseline 28j"
                f" ({baseline_hrv:.0f} ms) — SNA perturbé"
            )

    if rhr_today is not None and baseline_hr is not None:
        if rhr_today > baseline_hr + 5:
            raw_score += 2
            reasons.append(
                f"FC repos ({rhr_today:.0f} bpm) au-dessus de la baseline 28j"
                f" ({baseline_hr:.0f} bpm)"
            )

    if sleep_today is not None and sleep_today < 50:
        raw_score += 2
        reasons.append(
            f"Score sommeil faible ({sleep_today:.0f}/100) — récupération nocturne insuffisante"
        )

    if battery_today is not None and battery_today < 40:
        raw_score += 1
        reasons.append(
            f"Body Battery à {battery_today:.0f} — réserves énergétiques basses"
        )

    # Normalize 0–13 → 0–10
    score = round(raw_score * 10 / 13)
    score = max(0, min(10, score))

    return {
        "user_id": user_id,
        "assessment_date": target_date.isoformat(),
        "score": score,
        "level": _score_to_level(score),
        "reasons": reasons,
    }


# ─── Persistence ──────────────────────────────────────────────────────────────

def upsert_assessment(assessment: dict[str, Any]) -> None:
    """Upsert a risk assessment row in ``risk_assessments``."""
    client = _get_supabase()
    client.table("risk_assessments").upsert(
        {
            "user_id": assessment["user_id"],
            "assessment_date": assessment["assessment_date"],
            "score": assessment["score"],
            "level": assessment["level"],
            "reasons": assessment["reasons"],
        },
        on_conflict="user_id,assessment_date",
    ).execute()


def assess_and_persist(user_id: str, target_date: date | None = None) -> dict[str, Any]:
    """Compute risk score and persist it. Returns the result dict."""
    result = compute_risk(user_id, target_date)
    upsert_assessment(result)
    return result


# ─── Notification ─────────────────────────────────────────────────────────────

def notify_if_critical(assessment: dict[str, Any]) -> None:
    """Log a warning for high/critical risk levels.

    Full email delivery requires a Supabase Edge Function 'send-risk-alert'
    to be deployed. Until then this logs the event so it can be monitored.

    To enable email delivery:
      1. Deploy `supabase/functions/send-risk-alert/index.ts`
      2. Uncomment the `client.functions.invoke(...)` call below
    """
    if assessment["level"] not in ("high", "critical"):
        return

    logger.warning(
        "[RISK ALERT] user=%s date=%s score=%d level=%s reasons=%s",
        assessment["user_id"],
        assessment["assessment_date"],
        assessment["score"],
        assessment["level"],
        assessment["reasons"],
    )

    # Uncomment once Edge Function is deployed:
    # client = _get_supabase()
    # client.functions.invoke(
    #     "send-risk-alert",
    #     invoke_options={"body": {
    #         "user_id": assessment["user_id"],
    #         "score": assessment["score"],
    #         "level": assessment["level"],
    #         "reasons": assessment["reasons"],
    #         "dashboard_url": settings.web_base_url + "/dashboard",
    #     }},
    # )


# ─── Scheduler utility ────────────────────────────────────────────────────────

def get_active_user_ids() -> list[str]:
    """Return distinct user IDs with at least one daily_metric in the last 30 days."""
    client = _get_supabase()
    since = (date.today() - timedelta(days=30)).isoformat()
    response = (
        client.table("daily_metrics")
        .select("user_id")
        .gte("metric_date", since)
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

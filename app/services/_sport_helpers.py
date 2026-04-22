"""Shared sport/activity computation helpers.

Used by goal_service, group_service, and metrics_service to avoid
duplicating SPORT_COEFFICIENTS, normalization, and load formulas.
"""
from datetime import UTC, datetime, date

from app.models import Activity


SPORT_COEFFICIENTS: dict[str, float] = {
    "run": 1.0,
    "trailrun": 1.1,
    "ride": 0.8,
    "swim": 0.9,
    "workout": 0.7,
}


def _safe_utc_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _activity_date(activity: Activity) -> date:
    return _safe_utc_datetime(activity.start_date).date()


def _normalize_sport_type(sport_type: str | None) -> str:
    if not sport_type:
        return "unknown"
    normalized = sport_type.strip().lower().replace(" ", "")
    if "trail" in normalized:
        return "trailrun"
    if normalized in {"run", "running"}:
        return "run"
    if normalized in {"ride", "virtualride", "ebikeride", "bike", "cycling"}:
        return "ride"
    if normalized in {"swim", "swimming"}:
        return "swim"
    if normalized in {"workout", "strengthtraining", "weighttraining", "gym"}:
        return "workout"
    return normalized


def _sport_matches(activity: Activity, sport_type: str | None) -> bool:
    if not sport_type:
        return True
    return _normalize_sport_type(activity.sport_type) == _normalize_sport_type(sport_type)


def _intensity_coefficient(activity: Activity) -> float:
    avg_hr = float(activity.average_heartrate or 0.0)
    max_hr = float(activity.max_heartrate or 0.0)
    if avg_hr <= 0 or max_hr <= 0 or avg_hr > max_hr:
        return 1.0
    ratio = avg_hr / max_hr
    if ratio < 0.70:
        return 0.75
    if ratio < 0.78:
        return 0.85
    if ratio < 0.86:
        return 1.00
    if ratio < 0.92:
        return 1.15
    return 1.30


def _activity_load(activity: Activity) -> float:
    duration_min = max(float(activity.duration_sec), 0.0) / 60.0
    sport_coef = SPORT_COEFFICIENTS.get(_normalize_sport_type(activity.sport_type), 1.0)
    intensity_coef = _intensity_coefficient(activity)
    elevation_coef = 1.0
    if _normalize_sport_type(activity.sport_type) in {"run", "trailrun"}:
        elevation_coef += (max(float(activity.elevation_gain_m or 0.0), 0.0) / 1000.0) * 0.20
        elevation_coef = min(elevation_coef, 1.35)
    return round(duration_min * sport_coef * intensity_coef * elevation_coef, 2)


def _variation_pct(current_value: float, previous_value: float) -> float | None:
    if previous_value <= 0:
        if current_value <= 0:
            return 0.0
        return None
    return round(((current_value - previous_value) / previous_value) * 100.0, 1)


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))

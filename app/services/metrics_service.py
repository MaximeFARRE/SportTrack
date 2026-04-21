from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlmodel import Session, select

from app.models import Activity, Athlete, DailyMetric, User, WeeklyMetric


ATL_ALPHA = 2.0 / (7 + 1)
CTL_ALPHA = 2.0 / (42 + 1)
LONG_SESSION_MINUTES = 90
DPLUS_BONUS_FACTOR = 0.20
TIMELINE_DAYS = 120

SPORT_COEFFICIENTS = {
    "run": 1.0,
    "trailrun": 1.1,
    "ride": 0.8,
    "swim": 0.9,
    "workout": 0.7,
}

TRAIL_LIKE_SPORTS = {"run", "trailrun"}


def _normalize_sport_type(sport_type: str | None) -> str:
    if not sport_type:
        return "unknown"
    normalized = sport_type.strip().lower().replace(" ", "")
    if "trail" in normalized:
        return "trailrun"
    if normalized in {"run", "running"}:
        return "run"
    if normalized in {"ride", "virtualride", "ebikeride", "cycling", "bike"}:
        return "ride"
    if normalized in {"swim", "swimming"}:
        return "swim"
    if normalized in {"workout", "weighttraining", "strengthtraining", "gym"}:
        return "workout"
    return normalized


def _sport_coefficient(sport_type: str | None) -> float:
    normalized = _normalize_sport_type(sport_type)
    return SPORT_COEFFICIENTS.get(normalized, 1.0)


def _intensity_coefficient(activity: Activity) -> float:
    average_heartrate = float(activity.average_heartrate or 0)
    max_heartrate = float(activity.max_heartrate or 0)

    if average_heartrate <= 0 or max_heartrate <= 0 or average_heartrate > max_heartrate:
        return 1.0

    ratio = average_heartrate / max_heartrate
    if ratio < 0.70:
        return 0.75
    if ratio < 0.78:
        return 0.85
    if ratio < 0.86:
        return 1.00
    if ratio < 0.92:
        return 1.15
    return 1.30


def _elevation_coefficient(activity: Activity) -> float:
    normalized_sport = _normalize_sport_type(activity.sport_type)
    if normalized_sport not in TRAIL_LIKE_SPORTS:
        return 1.0

    elevation_gain_m = max(float(activity.elevation_gain_m or 0.0), 0.0)
    bonus = 1.0 + (elevation_gain_m / 1000.0) * DPLUS_BONUS_FACTOR
    return min(bonus, 1.35)


def _compute_training_load(activity: Activity) -> float:
    duration_minutes = max(float(activity.duration_sec), 0.0) / 60.0
    raw_load = (
        duration_minutes
        * _sport_coefficient(activity.sport_type)
        * _intensity_coefficient(activity)
        * _elevation_coefficient(activity)
    )
    return round(raw_load, 2)


def _safe_utc_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _activity_metric_date(activity: Activity) -> date:
    return _safe_utc_datetime(activity.start_date).date()


def _is_in_range(metric_date: date, start_date: date | None, end_date: date | None) -> bool:
    if start_date and metric_date < start_date:
        return False
    if end_date and metric_date > end_date:
        return False
    return True


def _week_start(metric_date: date) -> date:
    return metric_date - timedelta(days=metric_date.weekday())


def _build_daily_aggregates(activities: list[Activity]) -> dict[date, dict[str, float | int]]:
    daily_aggregates: dict[date, dict[str, float | int]] = {}
    for activity in activities:
        metric_date = _activity_metric_date(activity)
        if metric_date not in daily_aggregates:
            daily_aggregates[metric_date] = {
                "sessions_count": 0,
                "duration_sec": 0,
                "distance_m": 0.0,
                "elevation_gain_m": 0.0,
                "training_load": 0.0,
            }

        day_data = daily_aggregates[metric_date]
        day_data["sessions_count"] += 1
        day_data["duration_sec"] += max(int(activity.duration_sec), 0)
        day_data["distance_m"] += max(float(activity.distance_m), 0.0)
        day_data["elevation_gain_m"] += max(float(activity.elevation_gain_m), 0.0)
        day_data["training_load"] += _compute_training_load(activity)
    return daily_aggregates


def _aggregate_window(
    daily_aggregates: dict[date, dict[str, float | int]],
    start_date: date,
    end_date: date,
) -> dict[str, float | int]:
    aggregate = {
        "sessions_count": 0,
        "duration_sec": 0,
        "distance_m": 0.0,
        "elevation_gain_m": 0.0,
        "training_load": 0.0,
    }
    for metric_date, day_data in daily_aggregates.items():
        if metric_date < start_date or metric_date > end_date:
            continue
        aggregate["sessions_count"] += int(day_data["sessions_count"])
        aggregate["duration_sec"] += int(day_data["duration_sec"])
        aggregate["distance_m"] += float(day_data["distance_m"])
        aggregate["elevation_gain_m"] += float(day_data["elevation_gain_m"])
        aggregate["training_load"] += float(day_data["training_load"])
    return aggregate


def _compute_consistency_score(
    daily_aggregates: dict[date, dict[str, float | int]],
    reference_date: date,
) -> float:
    active_days_14 = 0
    for day_offset in range(14):
        metric_date = reference_date - timedelta(days=day_offset)
        if metric_date in daily_aggregates:
            active_days_14 += 1

    sessions_per_week: dict[date, int] = {}
    for metric_date, row in daily_aggregates.items():
        if metric_date < (reference_date - timedelta(days=7 * 8 - 1)) or metric_date > reference_date:
            continue
        week = _week_start(metric_date)
        sessions_per_week[week] = sessions_per_week.get(week, 0) + int(row["sessions_count"])

    weeks_with_three_sessions = 0
    current_week_start = _week_start(reference_date)
    for week_offset in range(8):
        week = current_week_start - timedelta(days=7 * week_offset)
        if sessions_per_week.get(week, 0) >= 3:
            weeks_with_three_sessions += 1

    score = 100.0 * (
        0.5 * (active_days_14 / 14.0)
        + 0.5 * (weeks_with_three_sessions / 8.0)
    )
    return round(score, 1)


def _compute_load_timeline(
    daily_aggregates: dict[date, dict[str, float | int]],
    end_date: date,
    days: int = TIMELINE_DAYS,
) -> list[dict[str, float | date]]:
    if days <= 0:
        return []

    start_date = end_date - timedelta(days=days - 1)
    timeline: list[dict[str, float | date]] = []

    atl = 0.0
    ctl = 0.0
    is_first_day = True

    for offset in range(days):
        metric_date = start_date + timedelta(days=offset)
        daily_load = float(daily_aggregates.get(metric_date, {}).get("training_load", 0.0))
        if is_first_day:
            atl = daily_load
            ctl = daily_load
            is_first_day = False
        else:
            atl = atl + ATL_ALPHA * (daily_load - atl)
            ctl = ctl + CTL_ALPHA * (daily_load - ctl)
        tsb = ctl - atl
        timeline.append(
            {
                "metric_date": metric_date,
                "daily_load": round(daily_load, 2),
                "ctl": round(ctl, 2),
                "atl": round(atl, 2),
                "tsb": round(tsb, 2),
            }
        )

    return timeline


def _compute_load_change_vs_previous_week(timeline: list[dict[str, float | date]]) -> float | None:
    if not timeline:
        return None

    loads = [float(item["daily_load"]) for item in timeline]
    last_week_load = sum(loads[-7:])
    previous_week_load = sum(loads[-14:-7]) if len(loads) >= 14 else 0.0

    if previous_week_load <= 0:
        return None
    return round((last_week_load - previous_week_load) / previous_week_load, 4)


def _compute_acwr(timeline: list[dict[str, float | date]]) -> float | None:
    if not timeline:
        return None

    loads = [float(item["daily_load"]) for item in timeline]
    acute = sum(loads[-7:]) / 7.0
    chronic = sum(loads[-28:]) / 28.0 if len(loads) >= 28 else 0.0
    if chronic <= 0:
        return None
    return round(acute / chronic, 2)


def _build_global_status(tsb: float, acwr: float | None, load_change_pct: float | None) -> str:
    if tsb <= -15 or (acwr is not None and acwr > 1.5):
        return "en surcharge"
    if acwr is not None and acwr < 0.8:
        return "semaine legere"
    if tsb >= 10:
        return "frais"
    if load_change_pct is not None and 0.05 <= load_change_pct <= 0.20 and tsb > -10:
        return "progression stable"
    return "en charge normale"


def _compute_current_streak_days(active_dates: set[date], reference_date: date) -> int:
    if not active_dates:
        return 0

    if reference_date in active_dates:
        cursor = reference_date
    elif (reference_date - timedelta(days=1)) in active_dates:
        cursor = reference_date - timedelta(days=1)
    else:
        return 0

    streak = 0
    while cursor in active_dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _compute_badge(streak_days: int, snapshot_7d: dict[str, float | int], load_change_pct: float | None) -> str:
    if streak_days >= 14:
        return "Badge: metronome 14j"
    if streak_days >= 7:
        return "Badge: streak 7j"
    if load_change_pct is not None and 0.10 <= load_change_pct <= 0.30:
        return "Badge: progression maitrisee"
    if int(snapshot_7d["sessions_count"]) >= 4:
        return "Badge: semaine solide"
    return "Badge: cap regulier"


def _compute_weekly_challenge(
    fitness_status: str,
    snapshot_7d: dict[str, float | int],
    has_long_session_alert: bool,
) -> str:
    if fitness_status == "en surcharge":
        return "Defi: 2 jours faciles consecutifs."
    if int(snapshot_7d["sessions_count"]) < 3:
        return "Defi: atteindre 3 seances cette semaine."
    if has_long_session_alert:
        return f"Defi: ajouter une seance longue (> {LONG_SESSION_MINUTES} min)."
    return "Defi: maintenir 4 seances regulieres cette semaine."


def _build_weekly_trends(
    daily_aggregates: dict[date, dict[str, float | int]],
    reference_date: date,
    weeks_count: int = 8,
) -> list[dict[str, float | int | date]]:
    if weeks_count <= 0:
        return []

    weekly_by_start: dict[date, dict[str, float | int | date]] = {}
    for metric_date, row in daily_aggregates.items():
        week_start = _week_start(metric_date)
        if week_start not in weekly_by_start:
            weekly_by_start[week_start] = {
                "week_start_date": week_start,
                "sessions_count": 0,
                "duration_sec": 0,
                "distance_m": 0.0,
                "elevation_gain_m": 0.0,
                "training_load": 0.0,
            }
        week_row = weekly_by_start[week_start]
        week_row["sessions_count"] += int(row["sessions_count"])
        week_row["duration_sec"] += int(row["duration_sec"])
        week_row["distance_m"] += float(row["distance_m"])
        week_row["elevation_gain_m"] += float(row["elevation_gain_m"])
        week_row["training_load"] += float(row["training_load"])

    result: list[dict[str, float | int | date]] = []
    current_week = _week_start(reference_date)
    for week_offset in range(weeks_count - 1, -1, -1):
        week_start = current_week - timedelta(days=7 * week_offset)
        week_row = weekly_by_start.get(week_start)
        if week_row:
            week_row["training_load"] = round(float(week_row["training_load"]), 2)
            result.append(week_row)
            continue
        result.append(
            {
                "week_start_date": week_start,
                "sessions_count": 0,
                "duration_sec": 0,
                "distance_m": 0.0,
                "elevation_gain_m": 0.0,
                "training_load": 0.0,
            }
        )
    return result


def _build_dashboard_alerts(
    activities: list[Activity],
    timeline: list[dict[str, float | date]],
    reference_date: date,
    load_change_pct: float | None,
    streak_days: int,
) -> list[dict[str, str]]:
    alerts: list[dict[str, str]] = []

    if load_change_pct is not None and load_change_pct >= 0.28:
        alerts.append(
            {
                "code": "load_spike",
                "severity": "warning",
                "message": f"Charge +{round(load_change_pct * 100)}% vs semaine precedente.",
            }
        )

    if streak_days >= 5:
        alerts.append(
            {
                "code": "streak_high",
                "severity": "info",
                "message": f"{streak_days} jours d'entrainement consecutifs.",
            }
        )

    latest_long_session_date: date | None = None
    for activity in activities:
        if int(activity.duration_sec) >= LONG_SESSION_MINUTES * 60:
            latest_long_session_date = _activity_metric_date(activity)
            break
    if latest_long_session_date:
        days_without_long = (reference_date - latest_long_session_date).days
        if days_without_long >= 12:
            alerts.append(
                {
                    "code": "no_long_session",
                    "severity": "warning",
                    "message": f"Aucune seance longue depuis {days_without_long} jours.",
                }
            )

    if len(timeline) >= 4 and all(float(item["tsb"]) <= -10 for item in timeline[-4:]):
        alerts.append(
            {
                "code": "high_fatigue",
                "severity": "warning",
                "message": "Fatigue elevee depuis 4 jours (TSB negatif).",
            }
        )

    last_7_loads = [float(item["daily_load"]) for item in timeline[-7:]]
    active_days_7 = len([load for load in last_7_loads if load > 0])
    total_load_7 = sum(last_7_loads)
    if total_load_7 > 0 and active_days_7 <= 4 and max(last_7_loads) >= 0.55 * total_load_7:
        alerts.append(
            {
                "code": "irregular_week",
                "severity": "info",
                "message": "Semaine irreguliere: charge tres concentree sur peu de jours.",
            }
        )

    severity_order = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda item: severity_order.get(item["severity"], 99))
    return alerts[:4]


def _build_mini_leaderboard(
    session: Session,
    current_user_id: int | None,
    start_datetime: datetime,
    end_datetime: datetime,
    sport_type: str | None = None,
) -> list[dict[str, Any]]:
    athletes = list(session.exec(select(Athlete)).all())
    athlete_to_user: dict[int, int] = {}
    for athlete in athletes:
        athlete_to_user[athlete.id] = athlete.user_id

    if not athlete_to_user:
        return []

    user_ids_with_athletes = set(athlete_to_user.values())
    users_statement = (
        select(User)
        .where(User.is_active == True)
        .where(User.id.in_(list(user_ids_with_athletes)))
        .order_by(User.display_name.asc(), User.id.asc())
    )
    users = list(session.exec(users_statement).all())
    if not users:
        return []

    activities_statement = (
        select(Activity)
        .where(Activity.athlete_id.in_(list(athlete_to_user.keys())))
        .where(Activity.start_date >= start_datetime)
        .where(Activity.start_date <= end_datetime)
        .order_by(Activity.start_date.desc())
    )
    activities = list(session.exec(activities_statement).all())

    normalized_filter = _normalize_sport_type(sport_type) if sport_type else None
    if normalized_filter:
        activities = [
            activity for activity in activities
            if _normalize_sport_type(activity.sport_type) == normalized_filter
        ]

    aggregates_by_user_id: dict[int, dict[str, Any]] = {
        user.id: {
            "user_id": user.id,
            "display_name": user.display_name,
            "sessions_count": 0,
            "distance_m": 0.0,
            "training_load": 0.0,
        }
        for user in users
    }

    for activity in activities:
        user_id = athlete_to_user.get(activity.athlete_id)
        if user_id not in aggregates_by_user_id:
            continue
        row = aggregates_by_user_id[user_id]
        row["sessions_count"] += 1
        row["distance_m"] += float(activity.distance_m)
        row["training_load"] += _compute_training_load(activity)

    ranking_rows = list(aggregates_by_user_id.values())
    ranking_rows.sort(
        key=lambda item: (item["training_load"], item["distance_m"], item["sessions_count"]),
        reverse=True,
    )

    leaderboard: list[dict[str, Any]] = []
    for index, row in enumerate(ranking_rows, start=1):
        leaderboard.append(
            {
                "rank": index,
                "user_id": row["user_id"],
                "display_name": row["display_name"],
                "sessions_count": row["sessions_count"],
                "training_load": round(float(row["training_load"]), 2),
                "distance_m": round(float(row["distance_m"]), 2),
                "is_current_user": row["user_id"] == current_user_id,
            }
        )

    top_rows = leaderboard[:5]
    if current_user_id is None:
        return top_rows

    if any(row["user_id"] == current_user_id for row in top_rows):
        return top_rows

    current_row = next((row for row in leaderboard if row["user_id"] == current_user_id), None)
    if current_row:
        top_rows.append(current_row)
    return top_rows


def _variation_pct(current_value: float, previous_value: float) -> float | None:
    if previous_value <= 0:
        if current_value <= 0:
            return 0.0
        return None
    return round(((current_value - previous_value) / previous_value) * 100.0, 1)


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _compute_period_regularity_score(
    daily_aggregates: dict[date, dict[str, float | int]],
    start_date: date,
    end_date: date,
    sessions_target: int,
) -> float:
    period_days = (end_date - start_date).days + 1
    if period_days <= 0:
        return 0.0

    active_days = 0
    for day_offset in range(period_days):
        metric_date = start_date + timedelta(days=day_offset)
        if metric_date in daily_aggregates:
            active_days += 1

    full_weeks = max(period_days // 7, 1)
    weeks_with_target = 0
    for week_index in range(full_weeks):
        week_start_date = start_date + timedelta(days=week_index * 7)
        sessions = 0
        for day_offset in range(7):
            metric_date = week_start_date + timedelta(days=day_offset)
            sessions += int(daily_aggregates.get(metric_date, {}).get("sessions_count", 0))
        if sessions >= sessions_target:
            weeks_with_target += 1

    score = 100.0 * (
        0.5 * (active_days / period_days)
        + 0.5 * (weeks_with_target / full_weeks)
    )
    return round(score, 1)


def _compute_longest_active_streak(active_dates: set[date]) -> int:
    if not active_dates:
        return 0

    longest_streak = 0
    current_streak = 0
    previous_date: date | None = None
    for metric_date in sorted(active_dates):
        if previous_date and metric_date == previous_date + timedelta(days=1):
            current_streak += 1
        else:
            current_streak = 1
        previous_date = metric_date
        longest_streak = max(longest_streak, current_streak)
    return longest_streak


def _add_moving_average_to_weekly_trends(
    weekly_trends: list[dict[str, float | int | date]],
    window: int = 3,
) -> list[dict[str, float | int | date]]:
    if window <= 1:
        return weekly_trends

    result = [dict(item) for item in weekly_trends]
    for index, row in enumerate(result):
        start_index = max(0, index - window + 1)
        window_slice = result[start_index:index + 1]
        denominator = len(window_slice) if window_slice else 1
        row["duration_sec_ma3"] = round(
            sum(float(item["duration_sec"]) for item in window_slice) / denominator,
            1,
        )
        row["distance_m_ma3"] = round(
            sum(float(item["distance_m"]) for item in window_slice) / denominator,
            1,
        )
        row["training_load_ma3"] = round(
            sum(float(item["training_load"]) for item in window_slice) / denominator,
            2,
        )
    return result


def _main_sport_for_period(
    activities: list[Activity],
    start_date: date,
    end_date: date,
) -> str | None:
    by_sport_duration: dict[str, int] = {}
    for activity in activities:
        metric_date = _activity_metric_date(activity)
        if metric_date < start_date or metric_date > end_date:
            continue
        sport_type = activity.sport_type or "Unknown"
        by_sport_duration[sport_type] = by_sport_duration.get(sport_type, 0) + int(activity.duration_sec)

    if not by_sport_duration:
        return None

    return max(by_sport_duration.items(), key=lambda item: item[1])[0]


def _compute_run_performance(
    activities: list[Activity],
    current_start: date,
    current_end: date,
    previous_start: date,
    previous_end: date,
) -> dict[str, Any]:
    run_activities = [
        activity
        for activity in activities
        if _normalize_sport_type(activity.sport_type) in TRAIL_LIKE_SPORTS
        and activity.duration_sec > 0
        and activity.distance_m > 0
    ]

    thresholds_km = [1.0, 5.0, 10.0, 21.1]
    records: list[dict[str, Any]] = []
    for threshold_km in thresholds_km:
        threshold_m = threshold_km * 1000.0
        best_row: dict[str, Any] | None = None
        for activity in run_activities:
            if float(activity.distance_m) < threshold_m:
                continue
            distance_km = float(activity.distance_m) / 1000.0
            pace_sec_per_km = float(activity.duration_sec) / distance_km
            estimated_time_sec = int(round(pace_sec_per_km * threshold_km))
            candidate = {
                "distance_km": threshold_km,
                "best_estimated_time_sec": estimated_time_sec,
                "pace_sec_per_km": round(pace_sec_per_km, 1),
                "activity_name": activity.name,
                "activity_date": _activity_metric_date(activity),
                "source_distance_km": round(distance_km, 2),
            }
            if best_row is None or candidate["best_estimated_time_sec"] < best_row["best_estimated_time_sec"]:
                best_row = candidate
        if best_row:
            records.append(best_row)

    def _average_pace_in_window(start_date: date, end_date: date) -> float | None:
        total_duration = 0
        total_distance_km = 0.0
        for activity in run_activities:
            metric_date = _activity_metric_date(activity)
            if metric_date < start_date or metric_date > end_date:
                continue
            total_duration += int(activity.duration_sec)
            total_distance_km += float(activity.distance_m) / 1000.0
        if total_duration <= 0 or total_distance_km <= 0:
            return None
        return round(total_duration / total_distance_km, 1)

    current_pace = _average_pace_in_window(current_start, current_end)
    previous_pace = _average_pace_in_window(previous_start, previous_end)

    pace_change_sec_per_km = None
    pace_improvement_pct = None
    if current_pace is not None and previous_pace is not None:
        pace_change_sec_per_km = round(current_pace - previous_pace, 1)
        if previous_pace > 0:
            pace_improvement_pct = round(((previous_pace - current_pace) / previous_pace) * 100.0, 1)

    return {
        "sport_type": "run",
        "run_records": records,
        "summary": {
            "avg_pace_sec_per_km_current_4w": current_pace,
            "avg_pace_sec_per_km_previous_4w": previous_pace,
            "pace_change_sec_per_km": pace_change_sec_per_km,
            "pace_improvement_pct": pace_improvement_pct,
        },
    }


def _compute_ride_performance(
    activities: list[Activity],
    current_start: date,
    current_end: date,
    previous_start: date,
    previous_end: date,
) -> dict[str, Any]:
    ride_activities = [
        activity
        for activity in activities
        if _normalize_sport_type(activity.sport_type) == "ride" and activity.duration_sec > 0
    ]

    def _window_stats(start_date: date, end_date: date) -> dict[str, float]:
        duration_sec = 0
        distance_m = 0.0
        elevation_gain_m = 0.0
        powers: list[float] = []
        for activity in ride_activities:
            metric_date = _activity_metric_date(activity)
            if metric_date < start_date or metric_date > end_date:
                continue
            duration_sec += int(activity.duration_sec)
            distance_m += float(activity.distance_m)
            elevation_gain_m += float(activity.elevation_gain_m)
            if activity.average_power is not None and activity.average_power > 0:
                powers.append(float(activity.average_power))
        avg_power = round(sum(powers) / len(powers), 1) if powers else None
        return {
            "duration_sec": float(duration_sec),
            "distance_m": distance_m,
            "elevation_gain_m": elevation_gain_m,
            "avg_power_w": avg_power,
        }

    current_stats = _window_stats(current_start, current_end)
    previous_stats = _window_stats(previous_start, previous_end)

    best_distance = max((float(activity.distance_m) for activity in ride_activities), default=0.0)
    best_duration = max((int(activity.duration_sec) for activity in ride_activities), default=0)
    best_elevation = max((float(activity.elevation_gain_m) for activity in ride_activities), default=0.0)

    return {
        "sport_type": "ride",
        "run_records": [],
        "summary": {
            "distance_current_4w_m": round(current_stats["distance_m"], 1),
            "distance_previous_4w_m": round(previous_stats["distance_m"], 1),
            "distance_change_pct_4w": _variation_pct(current_stats["distance_m"], previous_stats["distance_m"]),
            "duration_current_4w_sec": int(current_stats["duration_sec"]),
            "duration_previous_4w_sec": int(previous_stats["duration_sec"]),
            "duration_change_pct_4w": _variation_pct(current_stats["duration_sec"], previous_stats["duration_sec"]),
            "elevation_current_4w_m": round(current_stats["elevation_gain_m"], 1),
            "elevation_previous_4w_m": round(previous_stats["elevation_gain_m"], 1),
            "avg_power_current_4w_w": current_stats["avg_power_w"],
            "avg_power_previous_4w_w": previous_stats["avg_power_w"],
            "best_distance_m": round(best_distance, 1),
            "best_duration_sec": int(best_duration),
            "best_elevation_gain_m": round(best_elevation, 1),
        },
    }


def _build_progression_badges(
    weekly_trends: list[dict[str, float | int | date]],
    regularity_current: float,
    current_duration_4w_sec: float,
    longest_active_streak_days: int,
    activities: list[Activity],
    reference_date: date,
) -> list[dict[str, str]]:
    badges: list[dict[str, str]] = []

    if regularity_current >= 70:
        badges.append(
            {
                "code": "regular_4w",
                "title": "4 semaines regulieres",
                "description": "Regularite elevee sur les 4 dernieres semaines.",
            }
        )

    if len(weekly_trends) >= 4:
        rolling_4w_durations: list[float] = []
        for idx in range(3, len(weekly_trends)):
            rolling_4w_durations.append(
                sum(float(weekly_trends[j]["duration_sec"]) for j in range(idx - 3, idx + 1))
            )
        if rolling_4w_durations:
            latest_4w = rolling_4w_durations[-1]
            if latest_4w > 0 and latest_4w >= max(rolling_4w_durations):
                badges.append(
                    {
                        "code": "record_4w_volume",
                        "title": "Nouveau record de volume",
                        "description": "Tes 4 dernieres semaines sont les plus denses de la periode.",
                    }
                )

    current_year_rows = [
        item for item in weekly_trends
        if isinstance(item["week_start_date"], date) and item["week_start_date"].year == reference_date.year
    ]
    if current_year_rows:
        best_year_week = max(current_year_rows, key=lambda item: float(item["training_load"]))
        current_week_start = _week_start(reference_date)
        if (
            isinstance(best_year_week["week_start_date"], date)
            and best_year_week["week_start_date"] == current_week_start
            and float(best_year_week["training_load"]) > 0
        ):
            badges.append(
                {
                    "code": "best_week_year",
                    "title": "Plus forte semaine de l'annee",
                    "description": "Charge hebdo record sur l'annee en cours.",
                }
            )

    month_durations: dict[tuple[int, int], int] = {}
    for activity in activities:
        metric_date = _activity_metric_date(activity)
        key = (metric_date.year, metric_date.month)
        month_durations[key] = month_durations.get(key, 0) + int(activity.duration_sec)

    current_month_key = (reference_date.year, reference_date.month)
    current_month_duration = month_durations.get(current_month_key, 0)
    if month_durations and current_month_duration > 0 and current_month_duration >= max(month_durations.values()):
        badges.append(
            {
                "code": "best_month_duration",
                "title": "Meilleur mois en duree",
                "description": "Ton mois actuel est le meilleur en temps d'entrainement.",
            }
        )

    if longest_active_streak_days >= 10:
        badges.append(
            {
                "code": "streak_10_days",
                "title": "10 jours actifs consecutifs",
                "description": "Serie solide sans rupture.",
            }
        )

    if current_duration_4w_sec <= 0 and not badges:
        badges.append(
            {
                "code": "start_block",
                "title": "Bloc de progression a lancer",
                "description": "Objectif: 3 seances par semaine pendant 4 semaines.",
            }
        )

    return badges[:5]


def recompute_metrics_for_athlete(
    session: Session,
    athlete_id: int,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict[str, Any]:
    activities_statement = select(Activity).where(Activity.athlete_id == athlete_id)
    activities = list(session.exec(activities_statement).all())
    processed_activities_count = 0

    daily_aggregates: dict[date, dict[str, float | int]] = {}
    for activity in activities:
        metric_date = _activity_metric_date(activity)
        if not _is_in_range(metric_date, start_date, end_date):
            continue
        processed_activities_count += 1

        if metric_date not in daily_aggregates:
            daily_aggregates[metric_date] = {
                "sessions_count": 0,
                "duration_sec": 0,
                "distance_m": 0.0,
                "elevation_gain_m": 0.0,
                "training_load": 0.0,
            }

        day_data = daily_aggregates[metric_date]
        day_data["sessions_count"] += 1
        day_data["duration_sec"] += max(int(activity.duration_sec), 0)
        day_data["distance_m"] += max(float(activity.distance_m), 0.0)
        day_data["elevation_gain_m"] += max(float(activity.elevation_gain_m), 0.0)
        day_data["training_load"] += _compute_training_load(activity)

    existing_daily_statement = select(DailyMetric).where(DailyMetric.athlete_id == athlete_id)
    existing_daily_metrics = list(session.exec(existing_daily_statement).all())
    for metric in existing_daily_metrics:
        if _is_in_range(metric.metric_date, start_date, end_date):
            session.delete(metric)

    for metric_date, day_data in sorted(daily_aggregates.items()):
        session.add(
            DailyMetric(
                athlete_id=athlete_id,
                metric_date=metric_date,
                sessions_count=int(day_data["sessions_count"]),
                duration_sec=int(day_data["duration_sec"]),
                distance_m=float(day_data["distance_m"]),
                elevation_gain_m=float(day_data["elevation_gain_m"]),
                training_load=round(float(day_data["training_load"]), 2),
            )
        )

    weekly_aggregates: dict[date, dict[str, float | int]] = {}
    for metric_date, day_data in daily_aggregates.items():
        week_start = _week_start(metric_date)
        if week_start not in weekly_aggregates:
            weekly_aggregates[week_start] = {
                "sessions_count": 0,
                "duration_sec": 0,
                "distance_m": 0.0,
                "elevation_gain_m": 0.0,
                "training_load": 0.0,
            }

        week_data = weekly_aggregates[week_start]
        week_data["sessions_count"] += int(day_data["sessions_count"])
        week_data["duration_sec"] += int(day_data["duration_sec"])
        week_data["distance_m"] += float(day_data["distance_m"])
        week_data["elevation_gain_m"] += float(day_data["elevation_gain_m"])
        week_data["training_load"] += float(day_data["training_load"])

    existing_weekly_statement = select(WeeklyMetric).where(WeeklyMetric.athlete_id == athlete_id)
    existing_weekly_metrics = list(session.exec(existing_weekly_statement).all())
    for metric in existing_weekly_metrics:
        if _is_in_range(metric.week_start_date, start_date, end_date):
            session.delete(metric)

    for week_start, week_data in sorted(weekly_aggregates.items()):
        session.add(
            WeeklyMetric(
                athlete_id=athlete_id,
                week_start_date=week_start,
                sessions_count=int(week_data["sessions_count"]),
                duration_sec=int(week_data["duration_sec"]),
                distance_m=float(week_data["distance_m"]),
                elevation_gain_m=float(week_data["elevation_gain_m"]),
                training_load=round(float(week_data["training_load"]), 2),
            )
        )

    session.commit()

    return {
        "athlete_id": athlete_id,
        "activities_processed": processed_activities_count,
        "daily_metrics_count": len(daily_aggregates),
        "weekly_metrics_count": len(weekly_aggregates),
    }


def list_daily_metrics(
    session: Session,
    athlete_id: int,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[DailyMetric]:
    statement = select(DailyMetric).where(DailyMetric.athlete_id == athlete_id)
    metrics = list(session.exec(statement).all())
    filtered = [m for m in metrics if _is_in_range(m.metric_date, start_date, end_date)]
    return sorted(filtered, key=lambda item: item.metric_date, reverse=True)


def list_weekly_metrics(
    session: Session,
    athlete_id: int,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[WeeklyMetric]:
    statement = select(WeeklyMetric).where(WeeklyMetric.athlete_id == athlete_id)
    metrics = list(session.exec(statement).all())
    filtered = [m for m in metrics if _is_in_range(m.week_start_date, start_date, end_date)]
    return sorted(filtered, key=lambda item: item.week_start_date, reverse=True)


def get_dashboard_summary(
    session: Session,
    athlete_id: int,
    period_days: int = 30,
    recent_activities_limit: int = 5,
    sport_type: str | None = None,
) -> dict[str, Any]:
    if period_days < 1:
        raise ValueError("period_days doit etre >= 1.")

    now_utc = datetime.now(UTC)
    today = now_utc.date()
    period_start_date = today - timedelta(days=period_days - 1)

    activities_statement = (
        select(Activity)
        .where(Activity.athlete_id == athlete_id)
        .where(Activity.start_date <= now_utc)
        .order_by(Activity.start_date.desc())
    )
    activities = list(session.exec(activities_statement).all())

    normalized_filter = _normalize_sport_type(sport_type) if sport_type else None
    if normalized_filter:
        activities = [
            activity for activity in activities
            if _normalize_sport_type(activity.sport_type) == normalized_filter
        ]

    daily_aggregates = _build_daily_aggregates(activities)
    period_activities = [
        activity for activity in activities
        if _activity_metric_date(activity) >= period_start_date
    ]

    sessions_count = len(period_activities)
    duration_sec = sum(max(int(activity.duration_sec), 0) for activity in period_activities)
    distance_m = float(sum(max(float(activity.distance_m), 0.0) for activity in period_activities))
    elevation_gain_m = float(sum(max(float(activity.elevation_gain_m), 0.0) for activity in period_activities))

    by_sport: dict[str, dict[str, Any]] = {}
    for activity in period_activities:
        sport = activity.sport_type
        if sport not in by_sport:
            by_sport[sport] = {
                "sport_type": sport,
                "sessions_count": 0,
                "duration_sec": 0,
                "distance_m": 0.0,
                "elevation_gain_m": 0.0,
                "training_load": 0.0,
            }

        sport_row = by_sport[sport]
        sport_row["sessions_count"] += 1
        sport_row["duration_sec"] += max(int(activity.duration_sec), 0)
        sport_row["distance_m"] += max(float(activity.distance_m), 0.0)
        sport_row["elevation_gain_m"] += max(float(activity.elevation_gain_m), 0.0)
        sport_row["training_load"] += _compute_training_load(activity)

    sports_breakdown = sorted(
        by_sport.values(),
        key=lambda item: (item["training_load"], item["duration_sec"], item["distance_m"]),
        reverse=True,
    )
    for sport_row in sports_breakdown:
        sport_row["training_load"] = round(float(sport_row["training_load"]), 2)

    weekly_metrics_payload: list[dict[str, Any]] = []
    if sport_type is None:
        weekly_metrics = list_weekly_metrics(session=session, athlete_id=athlete_id)[:12]
        weekly_metrics_payload = [
            {
                "id": item.id,
                "athlete_id": item.athlete_id,
                "week_start_date": item.week_start_date,
                "sessions_count": item.sessions_count,
                "duration_sec": item.duration_sec,
                "distance_m": item.distance_m,
                "elevation_gain_m": item.elevation_gain_m,
                "training_load": item.training_load,
                "created_at": item.created_at,
                "updated_at": item.updated_at,
            }
            for item in weekly_metrics
        ]

    recent_activities = period_activities[:recent_activities_limit]

    timeline = _compute_load_timeline(
        daily_aggregates=daily_aggregates,
        end_date=today,
        days=TIMELINE_DAYS,
    )
    current_fitness = timeline[-1] if timeline else {
        "ctl": 0.0,
        "atl": 0.0,
        "tsb": 0.0,
    }
    acwr = _compute_acwr(timeline)
    load_change_pct = _compute_load_change_vs_previous_week(timeline)
    status = _build_global_status(
        tsb=float(current_fitness["tsb"]),
        acwr=acwr,
        load_change_pct=load_change_pct,
    )

    snapshot_7d = _aggregate_window(
        daily_aggregates=daily_aggregates,
        start_date=today - timedelta(days=6),
        end_date=today,
    )
    snapshot_7d["training_load"] = round(float(snapshot_7d["training_load"]), 2)
    snapshot_7d["consistency_score"] = _compute_consistency_score(
        daily_aggregates=daily_aggregates,
        reference_date=today,
    )

    weekly_trends = _build_weekly_trends(
        daily_aggregates=daily_aggregates,
        reference_date=today,
        weeks_count=8,
    )
    biggest_week = max(weekly_trends, key=lambda item: float(item["training_load"]), default=None)
    trend_summary: dict[str, Any] = {
        "weeks_count": len(weekly_trends),
        "load_change_vs_previous_week_pct": load_change_pct,
        "biggest_week": biggest_week,
    }

    active_dates = set(daily_aggregates.keys())
    streak_days = _compute_current_streak_days(active_dates=active_dates, reference_date=today)

    alerts = _build_dashboard_alerts(
        activities=activities,
        timeline=timeline,
        reference_date=today,
        load_change_pct=load_change_pct,
        streak_days=streak_days,
    )
    has_long_session_alert = any(alert["code"] == "no_long_session" for alert in alerts)

    athlete = session.get(Athlete, athlete_id)
    current_user_id = athlete.user_id if athlete else None
    leaderboard_start = datetime.combine(today - timedelta(days=6), datetime.min.time(), tzinfo=UTC)
    leaderboard = _build_mini_leaderboard(
        session=session,
        current_user_id=current_user_id,
        start_datetime=leaderboard_start,
        end_datetime=now_utc,
        sport_type=sport_type,
    )

    gamification = {
        "streak_days": streak_days,
        "recent_badge": _compute_badge(
            streak_days=streak_days,
            snapshot_7d=snapshot_7d,
            load_change_pct=load_change_pct,
        ),
        "weekly_challenge": _compute_weekly_challenge(
            fitness_status=status,
            snapshot_7d=snapshot_7d,
            has_long_session_alert=has_long_session_alert,
        ),
        "mini_leaderboard": leaderboard,
    }

    return {
        "athlete_id": athlete_id,
        "period_days": period_days,
        "sport_filter": sport_type,
        "sessions_count": sessions_count,
        "duration_sec": duration_sec,
        "distance_m": distance_m,
        "elevation_gain_m": elevation_gain_m,
        "sports_breakdown": sports_breakdown,
        "weekly_metrics": weekly_metrics_payload,
        "weekly_trends": weekly_trends,
        "snapshot_7d": snapshot_7d,
        "fitness_state": {
            "ctl": float(current_fitness["ctl"]),
            "atl": float(current_fitness["atl"]),
            "tsb": float(current_fitness["tsb"]),
            "acwr": acwr,
            "status": status,
            "load_change_vs_previous_week_pct": load_change_pct,
        },
        "trend_summary": trend_summary,
        "load_timeline": timeline,
        "alerts": alerts,
        "gamification": gamification,
        "recent_activities": [
            {
                "id": item.id,
                "name": item.name,
                "sport_type": item.sport_type,
                "start_date": item.start_date,
                "duration_sec": item.duration_sec,
                "distance_m": item.distance_m,
                "elevation_gain_m": item.elevation_gain_m,
            }
            for item in recent_activities
        ],
    }


def get_progression_summary(
    session: Session,
    athlete_id: int,
    weeks: int = 26,
    sport_type: str | None = None,
    sessions_target: int = 3,
) -> dict[str, Any]:
    if weeks < 8 or weeks > 52:
        raise ValueError("weeks doit etre entre 8 et 52.")
    if sessions_target < 1 or sessions_target > 7:
        raise ValueError("sessions_target doit etre entre 1 et 7.")

    now_utc = datetime.now(UTC)
    today = now_utc.date()
    period_current_start = today - timedelta(days=27)
    period_previous_end = period_current_start - timedelta(days=1)
    period_previous_start = period_previous_end - timedelta(days=27)

    activities_statement = (
        select(Activity)
        .where(Activity.athlete_id == athlete_id)
        .where(Activity.start_date <= now_utc)
        .order_by(Activity.start_date.desc())
    )
    activities = list(session.exec(activities_statement).all())

    normalized_filter = _normalize_sport_type(sport_type) if sport_type else None
    if normalized_filter:
        activities = [
            activity for activity in activities
            if _normalize_sport_type(activity.sport_type) == normalized_filter
        ]

    daily_aggregates = _build_daily_aggregates(activities)
    weekly_trends = _build_weekly_trends(
        daily_aggregates=daily_aggregates,
        reference_date=today,
        weeks_count=weeks,
    )
    weekly_trends = _add_moving_average_to_weekly_trends(weekly_trends=weekly_trends, window=3)

    current_window = _aggregate_window(daily_aggregates, period_current_start, today)
    previous_window = _aggregate_window(daily_aggregates, period_previous_start, period_previous_end)

    current_duration = float(current_window["duration_sec"])
    previous_duration = float(previous_window["duration_sec"])
    current_load_avg = float(current_window["training_load"]) / 4.0
    previous_load_avg = float(previous_window["training_load"]) / 4.0
    regularity_current = _compute_period_regularity_score(
        daily_aggregates=daily_aggregates,
        start_date=period_current_start,
        end_date=today,
        sessions_target=sessions_target,
    )
    regularity_previous = _compute_period_regularity_score(
        daily_aggregates=daily_aggregates,
        start_date=period_previous_start,
        end_date=period_previous_end,
        sessions_target=sessions_target,
    )

    volume_change_pct = _variation_pct(current_duration, previous_duration)
    load_change_pct = _variation_pct(current_load_avg, previous_load_avg)
    regularity_change_pct = _variation_pct(regularity_current, regularity_previous)

    best_recent_week = max(weekly_trends, key=lambda item: float(item["training_load"]), default=None)
    if best_recent_week and float(best_recent_week["training_load"]) <= 0:
        best_recent_week = None

    current_main_sport = _main_sport_for_period(
        activities=activities,
        start_date=period_current_start,
        end_date=today,
    )
    if current_main_sport is None:
        current_main_sport = sport_type or "n/a"

    progression_score = 50.0 + (
        0.35 * _clamp(volume_change_pct or 0.0, -50.0, 50.0)
        + 0.35 * _clamp(regularity_change_pct or 0.0, -50.0, 50.0)
        + 0.30 * _clamp(load_change_pct or 0.0, -50.0, 50.0)
    )
    progression_score = round(_clamp(progression_score, 0.0, 100.0), 1)

    performance_sport = _normalize_sport_type(current_main_sport)
    if performance_sport in TRAIL_LIKE_SPORTS:
        performance = _compute_run_performance(
            activities=activities,
            current_start=period_current_start,
            current_end=today,
            previous_start=period_previous_start,
            previous_end=period_previous_end,
        )
    elif performance_sport == "ride":
        performance = _compute_ride_performance(
            activities=activities,
            current_start=period_current_start,
            current_end=today,
            previous_start=period_previous_start,
            previous_end=period_previous_end,
        )
    else:
        performance = {
            "sport_type": performance_sport,
            "run_records": [],
            "summary": {
                "sessions_current_4w": int(current_window["sessions_count"]),
                "sessions_previous_4w": int(previous_window["sessions_count"]),
                "distance_current_4w_m": round(float(current_window["distance_m"]), 1),
                "distance_previous_4w_m": round(float(previous_window["distance_m"]), 1),
            },
        }

    consecutive_training_weeks = 0
    for week in reversed(weekly_trends):
        if int(week["sessions_count"]) > 0:
            consecutive_training_weeks += 1
        else:
            break

    weeks_above_target = len([week for week in weekly_trends if int(week["sessions_count"]) >= sessions_target])
    stable_weeks = 0
    comparable_weeks = 0
    for index in range(1, len(weekly_trends)):
        previous_load = float(weekly_trends[index - 1]["training_load"])
        current_load = float(weekly_trends[index]["training_load"])
        if previous_load <= 0:
            continue
        comparable_weeks += 1
        if abs(current_load - previous_load) / previous_load <= 0.20:
            stable_weeks += 1
    stable_load_ratio = round(stable_weeks / comparable_weeks, 2) if comparable_weeks else 0.0

    longest_active_streak_days = _compute_longest_active_streak(active_dates=set(daily_aggregates.keys()))
    badges = _build_progression_badges(
        weekly_trends=weekly_trends,
        regularity_current=regularity_current,
        current_duration_4w_sec=current_duration,
        longest_active_streak_days=longest_active_streak_days,
        activities=activities,
        reference_date=today,
    )

    return {
        "athlete_id": athlete_id,
        "sport_filter": sport_type,
        "weeks": weeks,
        "sessions_target": sessions_target,
        "summary": {
            "volume_4w": {
                "current_value": round(current_duration, 1),
                "previous_value": round(previous_duration, 1),
                "change_pct": volume_change_pct,
            },
            "average_load_4w": {
                "current_value": round(current_load_avg, 2),
                "previous_value": round(previous_load_avg, 2),
                "change_pct": load_change_pct,
            },
            "regularity_4w": {
                "current_value": regularity_current,
                "previous_value": regularity_previous,
                "change_pct": regularity_change_pct,
            },
            "best_recent_week": best_recent_week,
            "current_main_sport": current_main_sport,
            "progression_score": progression_score,
        },
        "weekly_trends": weekly_trends,
        "performance": performance,
        "robustness": {
            "consecutive_training_weeks": consecutive_training_weeks,
            "weeks_above_target": weeks_above_target,
            "stable_load_ratio": stable_load_ratio,
            "longest_active_streak_days": longest_active_streak_days,
        },
        "badges": badges,
    }


def get_weekly_comparison_for_all_connected_users(
    session: Session,
    actor_user_id: int,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[dict[str, Any]]:
    actor = session.get(User, actor_user_id)
    if not actor or not actor.is_active:
        raise LookupError("Utilisateur introuvable.")

    athletes = list(session.exec(select(Athlete)).all())
    athlete_ids_by_user_id: dict[int, list[int]] = {}
    for athlete in athletes:
        athlete_ids_by_user_id.setdefault(athlete.user_id, []).append(athlete.id)

    if not athlete_ids_by_user_id:
        return []

    connected_user_ids = list(athlete_ids_by_user_id.keys())
    users_statement = (
        select(User)
        .where(User.id.in_(connected_user_ids))
        .where(User.is_active == True)
        .order_by(User.display_name.asc(), User.id.asc())
    )
    connected_users = list(session.exec(users_statement).all())

    comparison_rows: list[dict[str, Any]] = []
    for user in connected_users:
        athlete_ids = athlete_ids_by_user_id.get(user.id, [])
        sessions_count = 0
        duration_sec = 0
        distance_m = 0.0
        elevation_gain_m = 0.0
        training_load = 0.0

        if athlete_ids:
            metrics_statement = select(WeeklyMetric).where(WeeklyMetric.athlete_id.in_(athlete_ids))
            if start_date:
                metrics_statement = metrics_statement.where(WeeklyMetric.week_start_date >= start_date)
            if end_date:
                metrics_statement = metrics_statement.where(WeeklyMetric.week_start_date <= end_date)
            metrics = list(session.exec(metrics_statement).all())

            sessions_count = sum(metric.sessions_count for metric in metrics)
            duration_sec = sum(metric.duration_sec for metric in metrics)
            distance_m = float(sum(metric.distance_m for metric in metrics))
            elevation_gain_m = float(sum(metric.elevation_gain_m for metric in metrics))
            training_load = float(sum(metric.training_load for metric in metrics))

        comparison_rows.append(
            {
                "user_id": user.id,
                "display_name": user.display_name,
                "athlete_count": len(athlete_ids),
                "sessions_count": sessions_count,
                "duration_sec": duration_sec,
                "distance_m": distance_m,
                "elevation_gain_m": elevation_gain_m,
                "training_load": training_load,
            }
        )

    comparison_rows.sort(
        key=lambda item: (item["training_load"], item["distance_m"], item["sessions_count"]),
        reverse=True,
    )
    return comparison_rows

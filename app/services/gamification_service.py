from datetime import UTC, date, datetime, timedelta
from typing import Any

from app.models import Activity


XP_BASE_PER_LOAD = 10.0
XP_LEVEL_FACTOR = 250.0


def _safe_utc_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def activity_date(activity: Activity) -> date:
    return _safe_utc_datetime(activity.start_date).date()


def normalize_sport_type(sport_type: str | None) -> str:
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
    if normalized in {"workout", "weighttraining", "strengthtraining", "gym"}:
        return "workout"
    return normalized


def sport_matches(activity: Activity, sport_type: str | None) -> bool:
    if not sport_type:
        return True
    return normalize_sport_type(activity.sport_type) == normalize_sport_type(sport_type)


def intensity_coefficient(activity: Activity) -> float:
    average_heartrate = float(activity.average_heartrate or 0.0)
    max_heartrate = float(activity.max_heartrate or 0.0)

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


def _sport_coefficient(activity: Activity) -> float:
    normalized = normalize_sport_type(activity.sport_type)
    if normalized == "trailrun":
        return 1.1
    if normalized == "ride":
        return 0.8
    if normalized == "swim":
        return 0.9
    if normalized == "workout":
        return 0.7
    return 1.0


def activity_load(activity: Activity) -> float:
    duration_minutes = max(float(activity.duration_sec), 0.0) / 60.0
    elevation_coef = 1.0
    if normalize_sport_type(activity.sport_type) in {"run", "trailrun"}:
        elevation_coef += (max(float(activity.elevation_gain_m or 0.0), 0.0) / 1000.0) * 0.20
        elevation_coef = min(elevation_coef, 1.35)
    value = duration_minutes * _sport_coefficient(activity) * intensity_coefficient(activity) * elevation_coef
    return round(value, 2)


def _week_start(metric_date: date) -> date:
    return metric_date - timedelta(days=metric_date.weekday())


def _streak_days(active_dates: set[date], reference_date: date) -> int:
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


def _streak_weeks(activities: list[Activity], reference_date: date, sessions_threshold: int = 3) -> int:
    sessions_by_week: dict[date, int] = {}
    for activity in activities:
        metric_date = activity_date(activity)
        week_start = _week_start(metric_date)
        sessions_by_week[week_start] = sessions_by_week.get(week_start, 0) + 1

    streak = 0
    cursor = _week_start(reference_date)
    while sessions_by_week.get(cursor, 0) >= sessions_threshold:
        streak += 1
        cursor -= timedelta(days=7)
    return streak


def _regularity_score_30d(active_dates: set[date], reference_date: date) -> float:
    start = reference_date - timedelta(days=29)
    active_days = len([d for d in active_dates if d >= start and d <= reference_date])
    return round(active_days / 30.0 * 100.0, 1)


def _window_load(activities: list[Activity], start_date: date, end_date: date) -> float:
    return round(
        sum(activity_load(activity) for activity in activities if start_date <= activity_date(activity) <= end_date),
        2,
    )


def _weekly_challenges(
    activities: list[Activity],
    reference_date: date,
    sessions_target: int = 3,
    sport_type: str | None = None,
) -> list[dict[str, Any]]:
    week_start = _week_start(reference_date)
    week_activities = [
        activity for activity in activities
        if week_start <= activity_date(activity) <= reference_date and sport_matches(activity, sport_type)
    ]

    sessions_count = len(week_activities)
    endurance_minutes = sum(float(activity.duration_sec) / 60.0 for activity in week_activities)
    quality_sessions = len(
        [
            activity for activity in week_activities
            if intensity_coefficient(activity) >= 1.15
            or float(activity.average_power or 0.0) > 0
            or float(activity.distance_m) >= 8000
        ]
    )
    long_session_seconds = max((int(activity.duration_sec) for activity in week_activities), default=0)
    long_target_minutes = 120 if sport_type and normalize_sport_type(sport_type) == "ride" else 90

    return [
        {
            "code": "sessions_week",
            "label": f"{sessions_target} seances cette semaine",
            "current": sessions_count,
            "target": sessions_target,
            "unit": "seances",
            "is_complete": sessions_count >= sessions_target,
        },
        {
            "code": "endurance_time",
            "label": "2h30 d'endurance",
            "current": round(endurance_minutes, 1),
            "target": 150.0,
            "unit": "min",
            "is_complete": endurance_minutes >= 150.0,
        },
        {
            "code": "quality_session",
            "label": "1 seance de qualite",
            "current": quality_sessions,
            "target": 1,
            "unit": "seance",
            "is_complete": quality_sessions >= 1,
        },
        {
            "code": "long_session",
            "label": "1 sortie longue",
            "current": round(long_session_seconds / 60.0, 1),
            "target": float(long_target_minutes),
            "unit": "min",
            "is_complete": long_session_seconds >= long_target_minutes * 60,
        },
    ]


def _build_badges(
    activities: list[Activity],
    reference_date: date,
    goals_completed_30d: int = 0,
) -> list[dict[str, str]]:
    if not activities:
        if goals_completed_30d > 0:
            return [
                {
                    "code": "goal_completed",
                    "title": "Objectif valide",
                    "description": "Objectif valide recemment.",
                }
            ]
        return []

    badges: list[dict[str, str]] = []
    active_dates = {activity_date(activity) for activity in activities if int(activity.duration_sec) >= 20 * 60}
    streak_days = _streak_days(active_dates=active_dates, reference_date=reference_date)

    week_start = _week_start(reference_date)
    week_activities = [activity for activity in activities if activity_date(activity) >= week_start]
    week_sessions = len(week_activities)
    week_dplus = sum(float(activity.elevation_gain_m) for activity in week_activities)

    total_distance_km = sum(float(activity.distance_m) for activity in activities) / 1000.0

    if week_sessions >= 4:
        badges.append(
            {
                "code": "first_week_4",
                "title": "Semaine a 4 seances",
                "description": "Premier palier de regularite atteint.",
            }
        )
    if total_distance_km >= 100:
        badges.append(
            {
                "code": "distance_100",
                "title": "100 km cumules",
                "description": "Le cap des 100 km est depasse.",
            }
        )
    if week_dplus >= 1000:
        badges.append(
            {
                "code": "dplus_1000",
                "title": "1000 m D+ en semaine",
                "description": "Semaine avec fort denivele validee.",
            }
        )

    regularity_30d = _regularity_score_30d(active_dates=active_dates, reference_date=reference_date)
    if regularity_30d >= 70:
        badges.append(
            {
                "code": "regular_30",
                "title": "30 jours reguliers",
                "description": "Regularite solide sur les 30 derniers jours.",
            }
        )
    if streak_days >= 7:
        badges.append(
            {
                "code": "streak_days",
                "title": f"Streak {streak_days} jours",
                "description": "Serie active en cours.",
            }
        )
    if goals_completed_30d > 0:
        badges.append(
            {
                "code": "goal_completed",
                "title": "Objectif valide",
                "description": "Objectif valide recemment.",
            }
        )

    return badges[:6]


def _build_activity_feed(
    activities: list[Activity],
    reference_date: date,
    sessions_target: int,
    goals_completed_30d: int = 0,
) -> list[dict[str, str]]:
    events: list[dict[str, str]] = []

    week_start = _week_start(reference_date)
    week_activities = [activity for activity in activities if week_start <= activity_date(activity) <= reference_date]
    week_sessions = len(week_activities)
    if week_sessions >= sessions_target:
        events.append(
            {
                "code": "weekly_target",
                "message": f"Objectif hebdo valide avec {week_sessions} seances.",
            }
        )

    week_load = _window_load(activities, week_start, reference_date)
    prev_week_start = week_start - timedelta(days=7)
    prev_week_end = week_start - timedelta(days=1)
    prev_week_load = _window_load(activities, prev_week_start, prev_week_end)
    if week_load > 0 and week_load > prev_week_load and prev_week_load > 0:
        events.append(
            {
                "code": "load_record",
                "message": "Nouveau record personnel de charge hebdomadaire recente.",
            }
        )

    active_dates = {activity_date(activity) for activity in activities if int(activity.duration_sec) >= 20 * 60}
    streak = _streak_days(active_dates=active_dates, reference_date=reference_date)
    if streak >= 3:
        events.append(
            {
                "code": "streak",
                "message": f"Serie active en cours: {streak} jours.",
            }
        )

    if goals_completed_30d > 0:
        events.append(
            {
                "code": "goal",
                "message": f"{goals_completed_30d} objectif(s) valide(s) sur 30 jours.",
            }
        )

    for activity in activities[:2]:
        events.append(
            {
                "code": "activity",
                "message": f"Activite recente: {activity.name} ({activity.sport_type}).",
            }
        )

    return events[:6]


def _xp_for_level(level: int) -> float:
    if level <= 1:
        return 0.0
    return ((level - 1) ** 2) * XP_LEVEL_FACTOR


def _level_from_xp(xp_total: float) -> int:
    level = 1
    while _xp_for_level(level + 1) <= xp_total:
        level += 1
    return level


def _xp_overview(
    activities: list[Activity],
    reference_date: date,
    regularity_score_30d: float,
    goals_completed_30d: int = 0,
) -> dict[str, Any]:
    load_28d = _window_load(
        activities=activities,
        start_date=reference_date - timedelta(days=27),
        end_date=reference_date,
    )
    regularity_bonus = 1.0 + (regularity_score_30d / 200.0)
    goals_bonus = 1.0 + min(goals_completed_30d, 3) * 0.10
    xp_total = round(load_28d * XP_BASE_PER_LOAD * regularity_bonus * goals_bonus, 1)
    level = _level_from_xp(xp_total)
    current_floor = _xp_for_level(level)
    next_floor = _xp_for_level(level + 1)
    xp_in_level = max(xp_total - current_floor, 0.0)
    xp_to_next = max(next_floor - xp_total, 0.0)
    span = max(next_floor - current_floor, 1.0)
    progress_pct = round(xp_in_level / span * 100.0, 1)
    return {
        "xp_total": xp_total,
        "level": level,
        "xp_to_next_level": round(xp_to_next, 1),
        "progress_in_level_pct": progress_pct,
        "regularity_bonus": round(regularity_bonus, 2),
        "goals_bonus": round(goals_bonus, 2),
    }


def build_personal_gamification(
    activities: list[Activity],
    reference_date: date,
    sessions_target: int = 3,
    sport_type: str | None = None,
    goals_completed_30d: int = 0,
) -> dict[str, Any]:
    filtered_activities = [
        activity for activity in activities
        if sport_matches(activity, sport_type)
    ]
    active_dates = {
        activity_date(activity)
        for activity in filtered_activities
        if int(activity.duration_sec) >= 20 * 60
    }
    streak_days = _streak_days(active_dates=active_dates, reference_date=reference_date)
    streak_weeks = _streak_weeks(
        activities=filtered_activities,
        reference_date=reference_date,
        sessions_threshold=max(sessions_target, 3),
    )
    regularity_30d = _regularity_score_30d(active_dates=active_dates, reference_date=reference_date)

    return {
        "streak_days": streak_days,
        "streak_weeks_target": streak_weeks,
        "regularity_30d": regularity_30d,
        "badges": _build_badges(
            activities=filtered_activities,
            reference_date=reference_date,
            goals_completed_30d=goals_completed_30d,
        ),
        "weekly_challenges": _weekly_challenges(
            activities=filtered_activities,
            reference_date=reference_date,
            sessions_target=sessions_target,
            sport_type=sport_type,
        ),
        "xp": _xp_overview(
            activities=filtered_activities,
            reference_date=reference_date,
            regularity_score_30d=regularity_30d,
            goals_completed_30d=goals_completed_30d,
        ),
        "activity_feed": _build_activity_feed(
            activities=filtered_activities,
            reference_date=reference_date,
            sessions_target=sessions_target,
            goals_completed_30d=goals_completed_30d,
        ),
    }

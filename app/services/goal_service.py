import json
import re
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, Optional

from sqlmodel import Session, select

from app.models import Activity, Athlete, Goal, User
from app.schemas.goal import GoalCreate, GoalUpdate
from app.services.metrics_service import get_dashboard_summary


GOAL_TYPES = {
    "run_event",
    "trail_event",
    "ride_event",
    "monthly_volume",
    "frequency_training",
    "group_challenge",
    "generic",
}

SPORT_COEFFICIENTS = {
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


def _sport_matches(activity: Activity, goal_sport_type: str | None) -> bool:
    if not goal_sport_type:
        return True
    return _normalize_sport_type(activity.sport_type) == _normalize_sport_type(goal_sport_type)


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        if isinstance(value, str):
            value = value.replace(",", ".")
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def _split_notes_meta(notes: str | None) -> tuple[dict[str, Any], str]:
    if not notes:
        return {}, ""
    stripped = notes.strip()
    if not stripped:
        return {}, ""

    lines = stripped.splitlines()
    first_line = lines[0].strip()
    if first_line.lower().startswith("meta:"):
        raw_meta = first_line[5:].strip()
        try:
            payload = json.loads(raw_meta)
            if not isinstance(payload, dict):
                payload = {}
        except Exception:
            payload = {}
        text = "\n".join(lines[1:]).strip()
        return payload, text
    return {}, stripped


def _parse_sessions_target(text: str) -> int | None:
    match = re.search(r"(\d+)\s*seances?\s*par\s*semaine", text, flags=re.IGNORECASE)
    if not match:
        return None
    return _to_int(match.group(1), default=0) or None


def _parse_target_weeks(text: str) -> int | None:
    match = re.search(r"(\d+)\s*semaines?", text, flags=re.IGNORECASE)
    if not match:
        return None
    return _to_int(match.group(1), default=0) or None


def _parse_monthly_distance_m(text: str) -> float | None:
    match = re.search(r"(\d+(?:[.,]\d+)?)\s*km(?:.{0,20})mois", text, flags=re.IGNORECASE)
    if not match:
        return None
    km = _to_float(match.group(1), default=0.0)
    if km <= 0:
        return None
    return km * 1000.0


def _parse_priority(text: str) -> str:
    lowered = text.lower()
    if "haute" in lowered or "priorite 1" in lowered:
        return "haute"
    if "basse" in lowered or "priorite 3" in lowered:
        return "basse"
    return "normale"


def _infer_goal_type(goal: Goal, meta: dict[str, Any], text: str) -> str:
    explicit = meta.get("goal_type")
    if isinstance(explicit, str) and explicit in GOAL_TYPES:
        return explicit

    content = f"{goal.name} {text} {goal.sport_type or ''}".lower()
    if any(token in content for token in {"groupe", "equipe", "team", "collectif"}):
        return "group_challenge"
    if _parse_sessions_target(content) is not None:
        return "frequency_training"
    if "mois" in content or "mensuel" in content:
        if goal.target_distance_m or _parse_monthly_distance_m(content):
            return "monthly_volume"
    normalized_sport = _normalize_sport_type(goal.sport_type)
    if "trail" in content or (goal.target_elevation_gain_m or 0) > 0:
        return "trail_event"
    if normalized_sport == "ride":
        return "ride_event"
    if normalized_sport == "run":
        return "run_event"
    return "generic"


def _extract_goal_config(goal: Goal) -> dict[str, Any]:
    meta, text = _split_notes_meta(goal.notes)
    goal_type = _infer_goal_type(goal=goal, meta=meta, text=text)

    sessions_per_week = _to_int(meta.get("sessions_per_week"), default=0)
    if sessions_per_week <= 0:
        parsed_sessions = _parse_sessions_target(text)
        sessions_per_week = parsed_sessions or 0
    if sessions_per_week <= 0:
        sessions_per_week = 4 if goal_type in {"run_event", "trail_event"} else 3

    target_weeks = _to_int(meta.get("target_weeks"), default=0)
    if target_weeks <= 0:
        parsed_weeks = _parse_target_weeks(text)
        target_weeks = parsed_weeks or 0

    monthly_distance_m = _to_float(meta.get("monthly_distance_m"), default=0.0)
    if monthly_distance_m <= 0:
        parsed_monthly = _parse_monthly_distance_m(text)
        monthly_distance_m = parsed_monthly or 0.0
    if monthly_distance_m <= 0 and goal_type == "monthly_volume":
        monthly_distance_m = float(goal.target_distance_m or 0.0)

    priority = str(meta.get("priority") or _parse_priority(text))
    return {
        "goal_type": goal_type,
        "sport_type": goal.sport_type,
        "sessions_per_week": sessions_per_week,
        "target_weeks": target_weeks,
        "monthly_distance_m": monthly_distance_m,
        "priority": priority,
        "meta": meta,
        "note_text": text,
    }


def _goal_end_date(goal: Goal, config: dict[str, Any], start_date: date) -> date:
    if goal.target_date:
        return goal.target_date
    target_weeks = _to_int(config.get("target_weeks"), default=0)
    if target_weeks > 0:
        return start_date + timedelta(days=target_weeks * 7 - 1)
    return start_date + timedelta(days=55)


def _date_range_to_utc(start_date: date, end_date: date) -> tuple[datetime, datetime]:
    start_dt = datetime.combine(start_date, time.min, tzinfo=UTC)
    end_dt = datetime.combine(end_date, time.max, tzinfo=UTC)
    return start_dt, end_dt


def _fetch_activities_for_athlete(
    session: Session,
    athlete_id: int,
    start_date: date,
    end_date: date,
) -> list[Activity]:
    start_dt, end_dt = _date_range_to_utc(start_date=start_date, end_date=end_date)
    statement = (
        select(Activity)
        .where(Activity.athlete_id == athlete_id)
        .where(Activity.start_date >= start_dt)
        .where(Activity.start_date <= end_dt)
        .order_by(Activity.start_date.desc())
    )
    return list(session.exec(statement).all())


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


def _goal_target_metric(config: dict[str, Any], goal: Goal) -> tuple[str, float]:
    goal_type = config["goal_type"]

    if goal_type == "frequency_training":
        sessions_total = _to_int(config.get("target_weeks"), default=0) * _to_int(config.get("sessions_per_week"), default=0)
        if sessions_total <= 0:
            sessions_total = _to_int(config.get("sessions_per_week"), default=3) * 6
        return "sessions", float(max(sessions_total, 1))

    if goal_type == "monthly_volume":
        monthly_target = _to_float(config.get("monthly_distance_m"), default=0.0)
        if monthly_target > 0:
            return "distance_m", monthly_target

    if goal.target_distance_m and goal.target_distance_m > 0:
        return "distance_m", float(goal.target_distance_m)

    if goal.target_elevation_gain_m and goal.target_elevation_gain_m > 0:
        return "elevation_gain_m", float(goal.target_elevation_gain_m)

    planned_sessions = _to_int(config.get("sessions_per_week"), default=3) * 6
    return "sessions", float(max(planned_sessions, 1))


def _compute_projection_status(completion_ratio: float, is_overdue: bool) -> str:
    if is_overdue and completion_ratio < 1.0:
        return "a risque"
    if completion_ratio >= 1.20:
        return "tres en avance"
    if completion_ratio >= 0.95:
        return "en bonne voie"
    if completion_ratio >= 0.75:
        return "un peu en retard"
    return "a risque"


def _is_specific_session(activity: Activity, goal_type: str, goal_sport: str | None) -> bool:
    if goal_type == "trail_event":
        return _sport_matches(activity, goal_sport) and (
            float(activity.elevation_gain_m) >= 250 or int(activity.duration_sec) >= 75 * 60
        )
    if goal_type == "run_event":
        return _sport_matches(activity, goal_sport) and (
            float(activity.distance_m) >= 7000 or int(activity.duration_sec) >= 50 * 60
        )
    if goal_type == "ride_event":
        return _sport_matches(activity, goal_sport) and (
            float(activity.distance_m) >= 30000 or int(activity.duration_sec) >= 100 * 60
        )
    if goal_type in {"monthly_volume", "group_challenge"}:
        return _sport_matches(activity, goal_sport) and int(activity.duration_sec) >= 45 * 60
    return _sport_matches(activity, goal_sport)


def _build_checkpoint_items(
    goal_type: str,
    training_progress_pct: float,
    sessions_this_week: int,
    long_sessions_this_week: int,
    specific_sessions_recent: int,
    weekly_target: int,
) -> list[dict[str, Any]]:
    checkpoints: list[dict[str, Any]] = []

    if goal_type == "trail_event":
        checkpoints.append(
            {
                "label": "1 sortie longue cette semaine",
                "detail": f"{long_sessions_this_week}/1",
                "is_complete": long_sessions_this_week >= 1,
            }
        )
        checkpoints.append(
            {
                "label": "1 seance de cotes recente",
                "detail": f"{specific_sessions_recent}/1",
                "is_complete": specific_sessions_recent >= 1,
            }
        )
        checkpoints.append(
            {
                "label": "3 seances cette semaine",
                "detail": f"{sessions_this_week}/3",
                "is_complete": sessions_this_week >= 3,
            }
        )
        checkpoints.append(
            {
                "label": "Volume cycle a 85%",
                "detail": f"{training_progress_pct:.0f}%",
                "is_complete": training_progress_pct >= 85,
            }
        )
        return checkpoints

    if goal_type == "run_event":
        checkpoints.append(
            {
                "label": "1 sortie longue cette semaine",
                "detail": f"{long_sessions_this_week}/1",
                "is_complete": long_sessions_this_week >= 1,
            }
        )
        checkpoints.append(
            {
                "label": "1 seance specifique recente",
                "detail": f"{specific_sessions_recent}/1",
                "is_complete": specific_sessions_recent >= 1,
            }
        )
        checkpoints.append(
            {
                "label": "3 seances cette semaine",
                "detail": f"{sessions_this_week}/3",
                "is_complete": sessions_this_week >= 3,
            }
        )
        checkpoints.append(
            {
                "label": "Volume cycle a 85%",
                "detail": f"{training_progress_pct:.0f}%",
                "is_complete": training_progress_pct >= 85,
            }
        )
        return checkpoints

    if goal_type == "ride_event":
        checkpoints.append(
            {
                "label": "1 sortie longue velo cette semaine",
                "detail": f"{long_sessions_this_week}/1",
                "is_complete": long_sessions_this_week >= 1,
            }
        )
        checkpoints.append(
            {
                "label": "2 sorties velo cette semaine",
                "detail": f"{sessions_this_week}/2",
                "is_complete": sessions_this_week >= 2,
            }
        )
        checkpoints.append(
            {
                "label": "Seances specifiques recentes",
                "detail": f"{specific_sessions_recent}/2",
                "is_complete": specific_sessions_recent >= 2,
            }
        )
        checkpoints.append(
            {
                "label": "Volume cycle a 85%",
                "detail": f"{training_progress_pct:.0f}%",
                "is_complete": training_progress_pct >= 85,
            }
        )
        return checkpoints

    checkpoints.append(
        {
            "label": f"{weekly_target} seances cette semaine",
            "detail": f"{sessions_this_week}/{weekly_target}",
            "is_complete": sessions_this_week >= weekly_target,
        }
    )
    checkpoints.append(
        {
            "label": "1 sortie longue cette semaine",
            "detail": f"{long_sessions_this_week}/1",
            "is_complete": long_sessions_this_week >= 1,
        }
    )
    checkpoints.append(
        {
            "label": "Seances specifiques recentes",
            "detail": f"{specific_sessions_recent}/2",
            "is_complete": specific_sessions_recent >= 2,
        }
    )
    checkpoints.append(
        {
            "label": "Progression cycle a 85%",
            "detail": f"{training_progress_pct:.0f}%",
            "is_complete": training_progress_pct >= 85,
        }
    )
    return checkpoints


def _build_friends_comparison(
    session: Session,
    current_goal: Goal,
    current_user_id: int,
    goal_sport_type: str | None,
    lookback_start: date,
    lookback_end: date,
) -> list[dict[str, Any]]:
    goals_statement = (
        select(Goal, Athlete, User)
        .join(Athlete, Goal.athlete_id == Athlete.id)
        .join(User, Athlete.user_id == User.id)
        .where(Goal.is_active == True)
        .where(User.is_active == True)
    )
    rows = list(session.exec(goals_statement).all())

    ranking: list[dict[str, Any]] = []
    for goal, athlete, user in rows:
        if goal.id == current_goal.id:
            continue
        if goal_sport_type and not _normalize_sport_type(goal.sport_type) == _normalize_sport_type(goal_sport_type):
            continue

        activities = _fetch_activities_for_athlete(
            session=session,
            athlete_id=athlete.id,
            start_date=lookback_start,
            end_date=lookback_end,
        )
        if goal_sport_type:
            activities = [a for a in activities if _sport_matches(a, goal_sport_type)]

        ranking.append(
            {
                "user_id": user.id,
                "display_name": user.display_name,
                "sessions_28d": len(activities),
                "distance_m_28d": round(sum(float(a.distance_m) for a in activities), 1),
                "load_28d": round(sum(_activity_load(a) for a in activities), 1),
                "is_current_user": user.id == current_user_id,
            }
        )

    current_athlete = session.get(Athlete, current_goal.athlete_id)
    if current_athlete:
        current_activities = _fetch_activities_for_athlete(
            session=session,
            athlete_id=current_athlete.id,
            start_date=lookback_start,
            end_date=lookback_end,
        )
        if goal_sport_type:
            current_activities = [a for a in current_activities if _sport_matches(a, goal_sport_type)]
        current_user = session.get(User, current_user_id)
        ranking.append(
            {
                "user_id": current_user_id,
                "display_name": current_user.display_name if current_user else "Moi",
                "sessions_28d": len(current_activities),
                "distance_m_28d": round(sum(float(a.distance_m) for a in current_activities), 1),
                "load_28d": round(sum(_activity_load(a) for a in current_activities), 1),
                "is_current_user": True,
            }
        )

    ranking.sort(key=lambda row: (row["load_28d"], row["distance_m_28d"], row["sessions_28d"]), reverse=True)
    for idx, row in enumerate(ranking, start=1):
        row["rank"] = idx

    top_rows = ranking[:5]
    if any(item["is_current_user"] for item in top_rows):
        return top_rows

    current_row = next((item for item in ranking if item["is_current_user"]), None)
    if current_row:
        top_rows.append(current_row)
    return top_rows


def _compute_goal_campaign(session: Session, goal: Goal) -> dict[str, Any]:
    config = _extract_goal_config(goal=goal)
    athlete = session.get(Athlete, goal.athlete_id)
    if not athlete:
        raise LookupError("Athlete introuvable pour cet objectif.")

    today = datetime.now(UTC).date()
    start_date = _safe_utc_datetime(goal.created_at).date()
    end_date = _goal_end_date(goal=goal, config=config, start_date=start_date)
    elapsed_end = min(today, end_date)

    total_days = max((end_date - start_date).days + 1, 1)
    elapsed_days = max((elapsed_end - start_date).days + 1, 1)

    activities = _fetch_activities_for_athlete(
        session=session,
        athlete_id=goal.athlete_id,
        start_date=start_date,
        end_date=elapsed_end,
    )

    if config["goal_type"] != "frequency_training":
        activities = [activity for activity in activities if _sport_matches(activity, config["sport_type"])]

    sessions_done = len(activities)
    distance_done = round(sum(float(activity.distance_m) for activity in activities), 1)
    elevation_done = round(sum(float(activity.elevation_gain_m) for activity in activities), 1)

    weekly_target = max(_to_int(config.get("sessions_per_week"), default=3), 1)
    target_metric_name, target_metric_value = _goal_target_metric(config=config, goal=goal)
    if target_metric_name == "sessions":
        current_metric_value = float(sessions_done)
    elif target_metric_name == "elevation_gain_m":
        current_metric_value = float(elevation_done)
    else:
        current_metric_value = float(distance_done)

    if config["goal_type"] == "trail_event" and goal.target_distance_m and goal.target_elevation_gain_m:
        dist_ratio = distance_done / max(float(goal.target_distance_m), 1.0)
        elev_ratio = elevation_done / max(float(goal.target_elevation_gain_m), 1.0)
        training_progress_pct = min(200.0, max(0.0, (0.65 * dist_ratio + 0.35 * elev_ratio) * 100.0))
    else:
        training_progress_pct = min(200.0, max(0.0, (current_metric_value / max(target_metric_value, 1.0)) * 100.0))
    training_progress_pct = round(training_progress_pct, 1)

    time_progress_pct = round(min(100.0, max(0.0, (elapsed_days / total_days) * 100.0)), 1)
    days_remaining = (end_date - today).days
    weeks_total = max((total_days + 6) // 7, 1)
    weeks_elapsed = max((elapsed_days + 6) // 7, 1)
    sessions_planned_total = weekly_target * weeks_total
    sessions_planned_elapsed = weekly_target * weeks_elapsed

    projected_final_value = (current_metric_value / max(elapsed_days, 1)) * total_days
    projection_completion_ratio = projected_final_value / max(target_metric_value, 1.0)
    projection_status = _compute_projection_status(
        completion_ratio=projection_completion_ratio,
        is_overdue=(today > end_date),
    )

    dashboard_context = get_dashboard_summary(
        session=session,
        athlete_id=goal.athlete_id,
        period_days=30,
        recent_activities_limit=5,
        sport_type=config["sport_type"] if config["goal_type"] != "frequency_training" else None,
    )

    snapshot_7d = dashboard_context.get("snapshot_7d", {})
    fitness_state = dashboard_context.get("fitness_state", {})
    recent_load_7d = float(snapshot_7d.get("training_load", 0.0))
    recent_regularity = float(snapshot_7d.get("consistency_score", 0.0))
    tsb = float(fitness_state.get("tsb", 0.0))

    recent_14_start = today - timedelta(days=13)
    activities_recent_14 = [
        activity for activity in activities
        if _activity_date(activity) >= recent_14_start
    ]
    active_days_recent_14 = len({_activity_date(activity) for activity in activities_recent_14})
    regularity_14_score = round((active_days_recent_14 / 14.0) * 100.0, 1)
    recent_load_14 = round(sum(_activity_load(activity) for activity in activities_recent_14), 1)

    long_threshold_sec = 120 * 60 if config["goal_type"] == "ride_event" else 90 * 60
    long_sessions = [activity for activity in activities if int(activity.duration_sec) >= long_threshold_sec]
    last_long_session_date = _activity_date(long_sessions[0]) if long_sessions else None
    days_since_long_session = (today - last_long_session_date).days if last_long_session_date else None

    specific_sessions_recent = len(
        [
            activity for activity in activities_recent_14
            if _is_specific_session(activity, goal_type=config["goal_type"], goal_sport=config["sport_type"])
        ]
    )

    pace_alignment = training_progress_pct / max(time_progress_pct, 1.0)
    if 0.9 <= pace_alignment <= 1.2:
        charge_score = 100.0
    elif 0.75 <= pace_alignment < 0.9 or 1.2 < pace_alignment <= 1.4:
        charge_score = 75.0
    else:
        charge_score = 45.0

    specificity_denominator = max(len(activities_recent_14), 1)
    specificity_score = round(min(100.0, (specific_sessions_recent / specificity_denominator) * 100.0), 1)

    if -12 <= tsb <= 8:
        freshness_score = 100.0
    elif -20 <= tsb < -12 or 8 < tsb <= 18:
        freshness_score = 75.0
    else:
        freshness_score = 45.0

    if days_since_long_session is None:
        long_session_score = 35.0
    elif days_since_long_session <= 10:
        long_session_score = 100.0
    elif days_since_long_session <= 16:
        long_session_score = 65.0
    else:
        long_session_score = 30.0

    preparation_score = round(
        0.30 * regularity_14_score
        + 0.25 * charge_score
        + 0.20 * specificity_score
        + 0.15 * freshness_score
        + 0.10 * long_session_score,
        1,
    )

    if preparation_score >= 80:
        coherence_status = "coherence forte"
    elif preparation_score >= 60:
        coherence_status = "coherence correcte"
    else:
        coherence_status = "coherence fragile"

    week_start = today - timedelta(days=today.weekday())
    sessions_this_week = len(
        [
            activity for activity in activities
            if _activity_date(activity) >= week_start
        ]
    )
    long_sessions_this_week = len(
        [
            activity for activity in activities
            if _activity_date(activity) >= week_start and int(activity.duration_sec) >= long_threshold_sec
        ]
    )
    checkpoints = _build_checkpoint_items(
        goal_type=config["goal_type"],
        training_progress_pct=training_progress_pct,
        sessions_this_week=sessions_this_week,
        long_sessions_this_week=long_sessions_this_week,
        specific_sessions_recent=specific_sessions_recent,
        weekly_target=weekly_target,
    )

    if not goal.is_active:
        current_status = "archive"
    elif projection_status == "a risque":
        current_status = "a risque"
    elif projection_status in {"un peu en retard", "en bonne voie", "tres en avance"}:
        current_status = projection_status
    else:
        current_status = "en cours"

    incomplete_checkpoints = [item for item in checkpoints if not item["is_complete"]]
    if incomplete_checkpoints:
        weekly_mission = f"Mission: {incomplete_checkpoints[0]['label']}."
    else:
        weekly_mission = "Mission: maintenir ce rythme toute la semaine."

    next_actions: list[str] = []
    if regularity_14_score < 60:
        next_actions.append(f"Monter a {weekly_target} seances sur la semaine en cours.")
    if days_since_long_session is None or days_since_long_session > 10:
        next_actions.append("Ajouter une sortie longue dans les 3 prochains jours.")
    if projection_status in {"un peu en retard", "a risque"}:
        next_actions.append("Ajouter une seance specifique supplementaire cette semaine.")
    if freshness_score < 60:
        next_actions.append("Prevoir 1 jour facile pour retrouver de la fraicheur.")
    if not next_actions:
        next_actions.append("Conserver le meme volume et la meme regularite.")

    if preparation_score >= 80 and projection_status in {"en bonne voie", "tres en avance"}:
        badge = "Badge objectif bien prepare"
    elif preparation_score >= 70:
        badge = "Badge preparation solide"
    elif training_progress_pct >= 85:
        badge = "Badge cap des 85%"
    else:
        badge = "Badge mission en cours"

    friends_comparison = _build_friends_comparison(
        session=session,
        current_goal=goal,
        current_user_id=athlete.user_id,
        goal_sport_type=config["sport_type"],
        lookback_start=today - timedelta(days=27),
        lookback_end=today,
    )

    return {
        "goal_id": goal.id,
        "goal_type": config["goal_type"],
        "primary": {
            "name": goal.name,
            "target_date": end_date,
            "days_remaining": days_remaining,
            "sport_type": goal.sport_type,
            "priority": config["priority"],
            "status": current_status,
        },
        "progress": {
            "time_progress_pct": time_progress_pct,
            "training_progress_pct": training_progress_pct,
            "sessions_done": sessions_done,
            "sessions_planned_elapsed": sessions_planned_elapsed,
            "sessions_planned_total": sessions_planned_total,
            "volume_realized_primary": current_metric_value,
            "volume_target_primary": target_metric_value,
            "volume_unit_primary": target_metric_name,
            "distance_realized_m": distance_done,
            "distance_target_m": float(goal.target_distance_m or 0.0),
            "elevation_realized_m": elevation_done,
            "elevation_target_m": float(goal.target_elevation_gain_m or 0.0),
        },
        "preparation": {
            "recent_load_7d": recent_load_7d,
            "recent_load_14d": recent_load_14,
            "regularity_score_14d": regularity_14_score,
            "last_long_session_date": last_long_session_date,
            "days_since_long_session": days_since_long_session,
            "specific_sessions_recent": specific_sessions_recent,
            "freshness_tsb": tsb,
            "freshness_status": fitness_state.get("status", "n/a"),
            "coherence_status": coherence_status,
            "preparation_score": preparation_score,
        },
        "checkpoints": checkpoints,
        "projection": {
            "projected_value": round(projected_final_value, 1),
            "target_value": round(target_metric_value, 1),
            "metric": target_metric_name,
            "completion_ratio": round(projection_completion_ratio, 2),
            "status": projection_status,
        },
        "gamification": {
            "weekly_mission": weekly_mission,
            "next_actions": next_actions[:3],
            "badge": badge,
            "friends_comparison": friends_comparison,
        },
    }


def get_goal_by_id(session: Session, goal_id: int) -> Optional[Goal]:
    return session.get(Goal, goal_id)


def get_athlete_by_id(session: Session, athlete_id: int) -> Optional[Athlete]:
    return session.get(Athlete, athlete_id)


def can_user_access_athlete(session: Session, athlete_id: int, user_id: int) -> bool:
    athlete = get_athlete_by_id(session=session, athlete_id=athlete_id)
    if not athlete:
        return False
    return athlete.user_id == user_id


def can_user_access_goal(session: Session, goal_id: int, user_id: int) -> bool:
    goal = get_goal_by_id(session=session, goal_id=goal_id)
    if not goal:
        return False
    return can_user_access_athlete(session=session, athlete_id=goal.athlete_id, user_id=user_id)


def create_goal(session: Session, payload: GoalCreate) -> Goal:
    goal = Goal(
        athlete_id=payload.athlete_id,
        name=payload.name.strip(),
        sport_type=payload.sport_type,
        target_date=payload.target_date,
        target_distance_m=payload.target_distance_m,
        target_elevation_gain_m=payload.target_elevation_gain_m,
        notes=payload.notes,
        is_active=True,
        updated_at=datetime.now(UTC),
    )
    session.add(goal)
    session.commit()
    session.refresh(goal)
    return goal


def list_goals_for_athlete(
    session: Session,
    athlete_id: int,
    include_inactive: bool = False,
) -> list[Goal]:
    statement = select(Goal).where(Goal.athlete_id == athlete_id)
    if not include_inactive:
        statement = statement.where(Goal.is_active == True)
    statement = statement.order_by(Goal.created_at.desc())
    return list(session.exec(statement).all())


def list_goals_for_user(session: Session, user_id: int, include_inactive: bool = False) -> list[Goal]:
    statement = select(Goal).join(Athlete, Goal.athlete_id == Athlete.id).where(Athlete.user_id == user_id)
    if not include_inactive:
        statement = statement.where(Goal.is_active == True)
    statement = statement.order_by(Goal.created_at.desc())
    return list(session.exec(statement).all())


def update_goal(session: Session, goal: Goal, payload: GoalUpdate) -> Goal:
    updates = payload.model_dump(exclude_unset=True)
    for field_name, value in updates.items():
        setattr(goal, field_name, value)

    if "name" in updates and goal.name is not None:
        goal.name = goal.name.strip()

    goal.updated_at = datetime.now(UTC)
    session.add(goal)
    session.commit()
    session.refresh(goal)
    return goal


def archive_goal(session: Session, goal: Goal) -> Goal:
    goal.is_active = False
    goal.updated_at = datetime.now(UTC)
    session.add(goal)
    session.commit()
    session.refresh(goal)
    return goal


def get_goal_campaign_summary(
    session: Session,
    goal_id: int,
    actor_user_id: int | None = None,
) -> dict[str, Any]:
    goal = get_goal_by_id(session=session, goal_id=goal_id)
    if not goal:
        raise LookupError("Objectif introuvable.")

    if actor_user_id is not None and not can_user_access_goal(session=session, goal_id=goal_id, user_id=actor_user_id):
        raise PermissionError("Acces refuse a cet objectif.")

    return _compute_goal_campaign(session=session, goal=goal)

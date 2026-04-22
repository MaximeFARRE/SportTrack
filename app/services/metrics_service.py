from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlmodel import Session, select

from app.models import Activity, Athlete, DailyMetric, Goal, User, WeeklyMetric
from app.services.gamification_service import build_personal_gamification
from app.services.metrics_compute import (
    TIMELINE_DAYS,
    _activity_metric_date,
    _add_moving_average_to_weekly_trends,
    _aggregate_window,
    _build_daily_aggregates,
    _build_dashboard_alerts,
    _build_global_status,
    _build_progression_badges,
    _build_weekly_trends,
    _clamp,
    _compute_acwr,
    _compute_badge,
    _compute_consistency_score,
    _compute_current_streak_days,
    _compute_load_change_vs_previous_week,
    _compute_load_timeline,
    _compute_longest_active_streak,
    _compute_period_regularity_score,
    _compute_ride_performance,
    _compute_run_performance,
    _compute_training_load,
    _compute_weekly_challenge,
    _is_in_range,
    _main_sport_for_period,
    _normalize_sport_type,
    _variation_pct,
    _week_start,
)


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

    try:
        existing_daily_statement = select(DailyMetric).where(DailyMetric.athlete_id == athlete_id)
        existing_daily_metrics = list(session.exec(existing_daily_statement).all())
        existing_weekly_statement = select(WeeklyMetric).where(WeeklyMetric.athlete_id == athlete_id)
        existing_weekly_metrics = list(session.exec(existing_weekly_statement).all())

        for metric in existing_daily_metrics:
            if _is_in_range(metric.metric_date, start_date, end_date):
                session.delete(metric)
        for metric in existing_weekly_metrics:
            if _is_in_range(metric.week_start_date, start_date, end_date):
                session.delete(metric)

        # Apply deletes before inserts to avoid unique conflicts on (athlete_id, metric_date/week_start_date).
        session.flush()

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
    except Exception:
        session.rollback()
        raise

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
    goals_completed_since = now_utc - timedelta(days=30)
    goals_statement = (
        select(Goal)
        .where(Goal.athlete_id == athlete_id)
        .where(Goal.is_active == False)
        .where(Goal.updated_at >= goals_completed_since)
    )
    goals_completed_30d = len(list(session.exec(goals_statement).all()))

    leaderboard_start = datetime.combine(today - timedelta(days=6), datetime.min.time(), tzinfo=UTC)
    leaderboard = _build_mini_leaderboard(
        session=session,
        current_user_id=current_user_id,
        start_datetime=leaderboard_start,
        end_datetime=now_utc,
        sport_type=sport_type,
    )

    personal_gamification = build_personal_gamification(
        activities=activities,
        reference_date=today,
        sessions_target=3,
        sport_type=sport_type,
        goals_completed_30d=goals_completed_30d,
    )
    weekly_challenges = personal_gamification.get("weekly_challenges", [])
    pending_weekly = next(
        (item for item in weekly_challenges if not item.get("is_complete")),
        None,
    )
    weekly_challenge_label = (
        pending_weekly["label"]
        if pending_weekly
        else weekly_challenges[0]["label"] if weekly_challenges else _compute_weekly_challenge(
            fitness_status=status,
            snapshot_7d=snapshot_7d,
            has_long_session_alert=has_long_session_alert,
        )
    )

    gamification = {
        "streak_days": int(personal_gamification.get("streak_days", streak_days)),
        "streak_weeks_target": int(personal_gamification.get("streak_weeks_target", 0)),
        "recent_badge": _compute_badge(
            streak_days=streak_days,
            snapshot_7d=snapshot_7d,
            load_change_pct=load_change_pct,
        ),
        "badges": personal_gamification.get("badges", []),
        "weekly_challenge": weekly_challenge_label,
        "weekly_challenges": weekly_challenges,
        "xp": personal_gamification.get("xp", {}),
        "activity_feed": personal_gamification.get("activity_feed", []),
        "mini_leaderboard": leaderboard,
        "goals_completed_30d": goals_completed_30d,
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
    if performance_sport in {"run", "trailrun"}:
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

    goals_completed_since = now_utc - timedelta(days=30)
    goals_statement = (
        select(Goal)
        .where(Goal.athlete_id == athlete_id)
        .where(Goal.is_active == False)
        .where(Goal.updated_at >= goals_completed_since)
    )
    goals_completed_30d = len(list(session.exec(goals_statement).all()))

    personal_gamification = build_personal_gamification(
        activities=activities,
        reference_date=today,
        sessions_target=sessions_target,
        sport_type=sport_type,
        goals_completed_30d=goals_completed_30d,
    )
    personal_badges = personal_gamification.get("badges", [])
    existing_titles = {badge.get("title", "") for badge in badges}
    for badge in personal_badges:
        if badge.get("title", "") not in existing_titles:
            badges.append(
                {
                    "code": badge.get("code", "badge"),
                    "title": badge.get("title", "Badge"),
                    "description": badge.get("description", ""),
                }
            )
            existing_titles.add(badge.get("title", ""))

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
        "gamification": {
            "streak_days": int(personal_gamification.get("streak_days", 0)),
            "streak_weeks_target": int(personal_gamification.get("streak_weeks_target", 0)),
            "weekly_challenges": personal_gamification.get("weekly_challenges", []),
            "xp": personal_gamification.get("xp", {}),
            "activity_feed": personal_gamification.get("activity_feed", []),
            "goals_completed_30d": goals_completed_30d,
        },
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

from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlmodel import Session, select

from app.models import Activity, Athlete, DailyMetric, User, WeeklyMetric


def _compute_training_load(duration_sec: int) -> float:
    return round(duration_sec / 60.0, 2)


def _is_in_range(metric_date: date, start_date: date | None, end_date: date | None) -> bool:
    if start_date and metric_date < start_date:
        return False
    if end_date and metric_date > end_date:
        return False
    return True


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
        metric_date = activity.start_date.date()
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
        day_data["duration_sec"] += activity.duration_sec
        day_data["distance_m"] += activity.distance_m
        day_data["elevation_gain_m"] += activity.elevation_gain_m
        day_data["training_load"] += _compute_training_load(activity.duration_sec)

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
                training_load=float(day_data["training_load"]),
            )
        )

    weekly_aggregates: dict[date, dict[str, float | int]] = {}
    for metric_date, day_data in daily_aggregates.items():
        week_start = metric_date - timedelta(days=metric_date.weekday())
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
                training_load=float(week_data["training_load"]),
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
) -> dict[str, Any]:
    if period_days < 1:
        raise ValueError("period_days doit etre >= 1.")

    now_utc = datetime.now(UTC)
    period_start = now_utc - timedelta(days=period_days)

    activities_statement = (
        select(Activity)
        .where(Activity.athlete_id == athlete_id)
        .where(Activity.start_date >= period_start)
        .order_by(Activity.start_date.desc())
    )
    activities = list(session.exec(activities_statement).all())

    sessions_count = len(activities)
    duration_sec = sum(activity.duration_sec for activity in activities)
    distance_m = float(sum(activity.distance_m for activity in activities))
    elevation_gain_m = float(sum(activity.elevation_gain_m for activity in activities))

    by_sport: dict[str, dict[str, Any]] = {}
    for activity in activities:
        sport = activity.sport_type
        if sport not in by_sport:
            by_sport[sport] = {
                "sport_type": sport,
                "sessions_count": 0,
                "duration_sec": 0,
                "distance_m": 0.0,
                "elevation_gain_m": 0.0,
            }

        sport_row = by_sport[sport]
        sport_row["sessions_count"] += 1
        sport_row["duration_sec"] += activity.duration_sec
        sport_row["distance_m"] += activity.distance_m
        sport_row["elevation_gain_m"] += activity.elevation_gain_m

    sports_breakdown = sorted(
        by_sport.values(),
        key=lambda item: (item["duration_sec"], item["distance_m"]),
        reverse=True,
    )

    weekly_metrics = list_weekly_metrics(session=session, athlete_id=athlete_id)[:12]
    recent_activities = activities[:recent_activities_limit]

    return {
        "athlete_id": athlete_id,
        "period_days": period_days,
        "sessions_count": sessions_count,
        "duration_sec": duration_sec,
        "distance_m": distance_m,
        "elevation_gain_m": elevation_gain_m,
        "sports_breakdown": sports_breakdown,
        "weekly_metrics": weekly_metrics,
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

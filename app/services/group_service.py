from datetime import UTC, date, datetime, time, timedelta
from typing import Any, Optional

from sqlmodel import Session, select

from app.models import Activity, Athlete, Goal, Group, GroupMember, User, WeeklyMetric
from app.schemas.group import GroupCreate
from app.services._sport_helpers import (
    SPORT_COEFFICIENTS,
    _activity_date,
    _activity_load,
    _clamp,
    _normalize_sport_type,
    _sport_matches,
    _variation_pct,
)


def get_group_by_id(session: Session, group_id: int) -> Optional[Group]:
    return session.get(Group, group_id)


def get_user_by_id(session: Session, user_id: int) -> Optional[User]:
    return session.get(User, user_id)


def is_user_group_owner(session: Session, group_id: int, user_id: int) -> bool:
    group = get_group_by_id(session=session, group_id=group_id)
    if not group:
        return False
    return group.owner_user_id == user_id


def is_user_group_member(session: Session, group_id: int, user_id: int) -> bool:
    statement = (
        select(GroupMember)
        .where(GroupMember.group_id == group_id)
        .where(GroupMember.user_id == user_id)
        .where(GroupMember.is_active == True)
    )
    member = session.exec(statement).first()
    return member is not None


def list_groups_for_user(session: Session, user_id: int) -> list[Group]:
    statement = (
        select(Group)
        .join(GroupMember, Group.id == GroupMember.group_id)
        .where(GroupMember.user_id == user_id)
        .where(GroupMember.is_active == True)
        .where(Group.is_active == True)
        .order_by(Group.created_at.desc())
    )
    return list(session.exec(statement).all())


def create_group(session: Session, payload: GroupCreate) -> Group:
    owner = get_user_by_id(session=session, user_id=payload.owner_user_id)
    if not owner:
        raise LookupError("Owner user introuvable.")

    group = Group(
        name=payload.name.strip(),
        description=payload.description,
        owner_user_id=payload.owner_user_id,
        is_active=True,
    )
    session.add(group)
    session.commit()
    session.refresh(group)

    owner_member = GroupMember(
        group_id=group.id,
        user_id=payload.owner_user_id,
        role="owner",
        is_active=True,
    )
    session.add(owner_member)
    session.commit()

    return group


def list_group_members(session: Session, group_id: int) -> list[GroupMember]:
    statement = (
        select(GroupMember)
        .where(GroupMember.group_id == group_id)
        .where(GroupMember.is_active == True)
        .order_by(GroupMember.joined_at.asc())
    )
    return list(session.exec(statement).all())


def add_member_to_group(
    session: Session,
    group_id: int,
    user_id: int,
    role: str = "member",
) -> GroupMember:
    group = get_group_by_id(session=session, group_id=group_id)
    if not group:
        raise LookupError("Groupe introuvable.")

    user = get_user_by_id(session=session, user_id=user_id)
    if not user:
        raise LookupError("Utilisateur introuvable.")

    statement = (
        select(GroupMember)
        .where(GroupMember.group_id == group_id)
        .where(GroupMember.user_id == user_id)
    )
    existing_member = session.exec(statement).first()
    if existing_member:
        existing_member.is_active = True
        existing_member.role = role
        session.add(existing_member)
        session.commit()
        session.refresh(existing_member)
        return existing_member

    member = GroupMember(
        group_id=group_id,
        user_id=user_id,
        role=role,
        is_active=True,
    )
    session.add(member)
    session.commit()
    session.refresh(member)
    return member


def remove_member_from_group(session: Session, group_id: int, user_id: int) -> Optional[GroupMember]:
    statement = (
        select(GroupMember)
        .where(GroupMember.group_id == group_id)
        .where(GroupMember.user_id == user_id)
        .where(GroupMember.is_active == True)
    )
    member = session.exec(statement).first()
    if not member:
        return None

    member.is_active = False
    session.add(member)
    session.commit()
    session.refresh(member)
    return member


def get_group_weekly_comparison(
    session: Session,
    group_id: int,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[dict[str, Any]]:
    members = list_group_members(session=session, group_id=group_id)

    comparison_rows: list[dict[str, Any]] = []
    for member in members:
        athletes_statement = select(Athlete).where(Athlete.user_id == member.user_id)
        athletes = list(session.exec(athletes_statement).all())
        athlete_ids = [athlete.id for athlete in athletes]

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
                "user_id": member.user_id,
                "athlete_count": len(athlete_ids),
                "sessions_count": sessions_count,
                "duration_sec": duration_sec,
                "distance_m": distance_m,
                "elevation_gain_m": elevation_gain_m,
                "training_load": training_load,
            }
        )

    comparison_rows.sort(key=lambda item: (item["training_load"], item["distance_m"]), reverse=True)
    return comparison_rows


def get_all_users_weekly_comparison(
    session: Session,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[dict[str, Any]]:
    from app.models import User
    users = list(session.exec(select(User)).all())
    rows = []
    for user in users:
        athletes = list(session.exec(select(Athlete).where(Athlete.user_id == user.id)).all())
        athlete_ids = [a.id for a in athletes]

        sessions_count = duration_sec = 0
        distance_m = elevation_gain_m = training_load = 0.0

        if athlete_ids:
            stmt = select(WeeklyMetric).where(WeeklyMetric.athlete_id.in_(athlete_ids))
            if start_date:
                stmt = stmt.where(WeeklyMetric.week_start_date >= start_date)
            if end_date:
                stmt = stmt.where(WeeklyMetric.week_start_date <= end_date)
            metrics = list(session.exec(stmt).all())
            sessions_count = sum(m.sessions_count for m in metrics)
            duration_sec = sum(m.duration_sec for m in metrics)
            distance_m = float(sum(m.distance_m for m in metrics))
            elevation_gain_m = float(sum(m.elevation_gain_m for m in metrics))
            training_load = float(sum(m.training_load for m in metrics))

        rows.append({
            "user_id": user.id,
            "display_name": user.display_name,
            "athlete_count": len(athlete_ids),
            "sessions_count": sessions_count,
            "duration_sec": duration_sec,
            "distance_m": distance_m,
            "elevation_gain_m": elevation_gain_m,
            "training_load": training_load,
        })

    rows.sort(key=lambda r: r["training_load"], reverse=True)
    return rows


def touch_group_updated_at(session: Session, group_id: int) -> None:
    group = get_group_by_id(session=session, group_id=group_id)
    if not group:
        return
    group.updated_at = datetime.now(UTC)
    session.add(group)
    session.commit()


def _window_aggregate(
    activities: list[Activity],
    start_date: date,
    end_date: date,
    min_active_minutes: int = 20,
) -> dict[str, Any]:
    active_days: set[date] = set()
    duration_sec = 0
    distance_m = 0.0
    elevation_gain_m = 0.0
    load = 0.0
    sessions_count = 0
    sunday_sessions = 0

    for activity in activities:
        metric_date = _activity_date(activity)
        if metric_date < start_date or metric_date > end_date:
            continue
        sessions_count += 1
        duration = max(int(activity.duration_sec), 0)
        duration_sec += duration
        distance_m += max(float(activity.distance_m), 0.0)
        elevation_gain_m += max(float(activity.elevation_gain_m), 0.0)
        load += _activity_load(activity)
        if duration >= min_active_minutes * 60:
            active_days.add(metric_date)
        if metric_date.weekday() == 6:
            sunday_sessions += 1

    return {
        "sessions_count": sessions_count,
        "duration_sec": duration_sec,
        "distance_m": round(distance_m, 1),
        "elevation_gain_m": round(elevation_gain_m, 1),
        "training_load": round(load, 2),
        "active_days": len(active_days),
        "sunday_sessions": sunday_sessions,
    }


def _compute_current_streak_days(
    activities: list[Activity],
    reference_date: date,
    min_active_minutes: int = 20,
) -> int:
    active_days = {
        _activity_date(activity)
        for activity in activities
        if int(activity.duration_sec) >= min_active_minutes * 60
    }
    if not active_days:
        return 0

    if reference_date in active_days:
        cursor = reference_date
    elif (reference_date - timedelta(days=1)) in active_days:
        cursor = reference_date - timedelta(days=1)
    else:
        return 0

    streak = 0
    while cursor in active_days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _build_leaderboard(
    member_rows: list[dict[str, Any]],
    metric_key: str,
    label: str,
    descending: bool = True,
) -> dict[str, Any]:
    ranked = sorted(
        member_rows,
        key=lambda row: row.get(metric_key, 0.0),
        reverse=descending,
    )
    podium: list[dict[str, Any]] = []
    for index, row in enumerate(ranked[:3], start=1):
        podium.append(
            {
                "rank": index,
                "user_id": row["user_id"],
                "display_name": row["display_name"],
                "value": row.get(metric_key),
                "is_current_user": row.get("is_current_user", False),
            }
        )
    return {
        "metric_key": metric_key,
        "label": label,
        "podium": podium,
    }


def _week_start(metric_date: date) -> date:
    return metric_date - timedelta(days=metric_date.weekday())


def _date_range_to_utc(start_date: date, end_date: date) -> tuple[datetime, datetime]:
    return (
        datetime.combine(start_date, time.min, tzinfo=UTC),
        datetime.combine(end_date, time.max, tzinfo=UTC),
    )


def _build_empty_social_summary(period_days: int, sport_type: str | None) -> dict[str, Any]:
    return {
        "period_days": period_days,
        "sport_filter": sport_type,
        "available_sports": [],
        "overview": {
            "sessions_count": 0,
            "duration_sec": 0,
            "distance_m": 0.0,
            "elevation_gain_m": 0.0,
            "average_streak_days": 0.0,
            "current_challenge": "Aucun defi actif.",
        },
        "members": [],
        "leaderboards": [],
        "visualizations": {
            "weekly_by_user": [],
            "load_4w_by_user": [],
            "radar_by_user": [],
            "monthly_cumulative": [],
            "heatmap": [],
        },
        "challenges": [],
        "badges": [],
        "social_history": [],
    }


def get_social_comparison_dashboard(
    session: Session,
    actor_user_id: int,
    period_days: int = 30,
    sport_type: str | None = None,
    sessions_target: int = 4,
    min_active_minutes: int = 20,
) -> dict[str, Any]:
    actor = session.get(User, actor_user_id)
    if not actor or not actor.is_active:
        raise LookupError("Utilisateur introuvable.")

    users_statement = select(User).where(User.is_active == True).order_by(User.display_name.asc(), User.id.asc())
    users = list(session.exec(users_statement).all())
    if not users:
        return _build_empty_social_summary(period_days=period_days, sport_type=sport_type)

    user_ids = [user.id for user in users]
    athletes = list(session.exec(select(Athlete).where(Athlete.user_id.in_(user_ids))).all())
    athlete_to_user = {athlete.id: athlete.user_id for athlete in athletes}
    if not athlete_to_user:
        return _build_empty_social_summary(period_days=period_days, sport_type=sport_type)

    athlete_ids_by_user: dict[int, list[int]] = {user.id: [] for user in users}
    for athlete in athletes:
        athlete_ids_by_user.setdefault(athlete.user_id, []).append(athlete.id)

    today = datetime.now(UTC).date()
    period_start = today - timedelta(days=max(period_days - 1, 0))
    week_start = _week_start(today)
    last_7_start = today - timedelta(days=6)
    last_14_start = today - timedelta(days=13)
    last_28_start = today - timedelta(days=27)
    previous_28_start = today - timedelta(days=55)
    previous_28_end = today - timedelta(days=28)
    month_start = today.replace(day=1)
    vis_weeks = 12
    vis_start = min(period_start, previous_28_start, month_start, today - timedelta(days=vis_weeks * 7 - 1))
    heatmap_start = today - timedelta(days=27)

    start_dt, end_dt = _date_range_to_utc(start_date=vis_start, end_date=today)
    activities_statement = (
        select(Activity)
        .where(Activity.athlete_id.in_(list(athlete_to_user.keys())))
        .where(Activity.start_date >= start_dt)
        .where(Activity.start_date <= end_dt)
        .order_by(Activity.start_date.desc())
    )
    activities = list(session.exec(activities_statement).all())
    available_sports = sorted({activity.sport_type for activity in activities if activity.sport_type})

    if sport_type:
        activities = [activity for activity in activities if _sport_matches(activity, sport_type)]

    activities_by_user: dict[int, list[Activity]] = {user.id: [] for user in users}
    for activity in activities:
        user_id = athlete_to_user.get(activity.athlete_id)
        if user_id is not None:
            activities_by_user.setdefault(user_id, []).append(activity)

    goals_statement = (
        select(Goal, Athlete)
        .join(Athlete, Goal.athlete_id == Athlete.id)
        .where(Athlete.user_id.in_(user_ids))
    )
    goals_rows = list(session.exec(goals_statement).all())
    validated_since = datetime.now(UTC) - timedelta(days=30)
    objectives_validated_by_user: dict[int, int] = {user.id: 0 for user in users}
    for goal, athlete in goals_rows:
        if goal.is_active:
            continue
        if goal.updated_at >= validated_since:
            objectives_validated_by_user[athlete.user_id] = objectives_validated_by_user.get(athlete.user_id, 0) + 1

    member_rows: list[dict[str, Any]] = []
    for user in users:
        user_activities = activities_by_user.get(user.id, [])
        period_agg = _window_aggregate(
            activities=user_activities,
            start_date=period_start,
            end_date=today,
            min_active_minutes=min_active_minutes,
        )
        week_agg = _window_aggregate(
            activities=user_activities,
            start_date=last_7_start,
            end_date=today,
            min_active_minutes=min_active_minutes,
        )
        window_14 = _window_aggregate(
            activities=user_activities,
            start_date=last_14_start,
            end_date=today,
            min_active_minutes=min_active_minutes,
        )
        window_28 = _window_aggregate(
            activities=user_activities,
            start_date=last_28_start,
            end_date=today,
            min_active_minutes=min_active_minutes,
        )
        previous_28 = _window_aggregate(
            activities=user_activities,
            start_date=previous_28_start,
            end_date=previous_28_end,
            min_active_minutes=min_active_minutes,
        )
        month_agg = _window_aggregate(
            activities=user_activities,
            start_date=month_start,
            end_date=today,
            min_active_minutes=min_active_minutes,
        )
        streak_current = _compute_current_streak_days(
            activities=user_activities,
            reference_date=today,
            min_active_minutes=min_active_minutes,
        )
        regularity_score = round((window_14["active_days"] / 14.0) * 100.0, 1)
        progression_recent_pct = _variation_pct(
            current_value=float(window_28["duration_sec"]),
            previous_value=float(previous_28["duration_sec"]),
        )

        member_rows.append(
            {
                "user_id": user.id,
                "display_name": user.display_name,
                "is_current_user": user.id == actor_user_id,
                "sessions_period": period_agg["sessions_count"],
                "duration_period_sec": period_agg["duration_sec"],
                "distance_period_m": period_agg["distance_m"],
                "elevation_period_m": period_agg["elevation_gain_m"],
                "sessions_7d": week_agg["sessions_count"],
                "duration_7d_sec": week_agg["duration_sec"],
                "distance_7d_m": week_agg["distance_m"],
                "elevation_7d_m": week_agg["elevation_gain_m"],
                "load_7d": week_agg["training_load"],
                "load_4w": window_28["training_load"],
                "regularity_score": regularity_score,
                "progression_recent_pct": progression_recent_pct,
                "streak_days": streak_current,
                "objectives_validated_30d": objectives_validated_by_user.get(user.id, 0),
                "month_distance_m": month_agg["distance_m"],
                "month_load": month_agg["training_load"],
                "month_sessions": month_agg["sessions_count"],
                "sunday_sessions_period": period_agg["sunday_sessions"],
            }
        )

    if not member_rows:
        return _build_empty_social_summary(period_days=period_days, sport_type=sport_type)

    max_load_7d = max(float(row["load_7d"]) for row in member_rows) or 1.0
    max_streak = max(int(row["streak_days"]) for row in member_rows) or 1
    max_objectives = max(int(row["objectives_validated_30d"]) for row in member_rows) or 1
    max_duration_7d = max(float(row["duration_7d_sec"]) for row in member_rows) or 1.0
    max_elevation_7d = max(float(row["elevation_7d_m"]) for row in member_rows) or 1.0

    for row in member_rows:
        progression_for_score = float(row["progression_recent_pct"] or 0.0)
        progression_norm = _clamp((progression_for_score + 30.0) / 60.0 * 100.0, 0.0, 100.0)
        load_norm = _clamp(float(row["load_7d"]) / max_load_7d * 100.0, 0.0, 100.0)
        streak_norm = _clamp(float(row["streak_days"]) / max_streak * 100.0, 0.0, 100.0)
        objectives_norm = _clamp(float(row["objectives_validated_30d"]) / max_objectives * 100.0, 0.0, 100.0)
        score = (
            0.30 * float(row["regularity_score"])
            + 0.25 * load_norm
            + 0.20 * progression_norm
            + 0.15 * streak_norm
            + 0.10 * objectives_norm
        )
        row["group_score"] = round(score, 1)
        row["volume_norm"] = round(_clamp(float(row["duration_7d_sec"]) / max_duration_7d * 100.0, 0.0, 100.0), 1)
        row["dplus_norm"] = round(_clamp(float(row["elevation_7d_m"]) / max_elevation_7d * 100.0, 0.0, 100.0), 1)
        row["progression_norm"] = round(progression_norm, 1)
        row["streak_norm"] = round(streak_norm, 1)

    group_sessions = sum(int(row["sessions_period"]) for row in member_rows)
    group_duration = sum(int(row["duration_period_sec"]) for row in member_rows)
    group_distance = round(sum(float(row["distance_period_m"]) for row in member_rows), 1)
    group_dplus = round(sum(float(row["elevation_period_m"]) for row in member_rows), 1)
    avg_streak = round(sum(float(row["streak_days"]) for row in member_rows) / max(len(member_rows), 1), 1)

    leaderboards = [
        _build_leaderboard(member_rows, "duration_7d_sec", "Volume semaine"),
        _build_leaderboard(member_rows, "regularity_score", "Regularite"),
        _build_leaderboard(member_rows, "sessions_7d", "Nombre de seances"),
        _build_leaderboard(member_rows, "elevation_7d_m", "D+ semaine"),
        _build_leaderboard(member_rows, "load_7d", "Charge semaine"),
        _build_leaderboard(member_rows, "progression_recent_pct", "Progression recente"),
        _build_leaderboard(member_rows, "streak_days", "Streak actuel"),
        _build_leaderboard(member_rows, "group_score", "Score gamifie"),
    ]

    weekly_rows: list[dict[str, Any]] = []
    for row in member_rows:
        user_id = row["user_id"]
        user_activities = activities_by_user.get(user_id, [])
        for week_offset in range(vis_weeks - 1, -1, -1):
            wk_end = today - timedelta(days=7 * week_offset)
            wk_start = _week_start(wk_end)
            wk_agg = _window_aggregate(
                activities=user_activities,
                start_date=wk_start,
                end_date=wk_start + timedelta(days=6),
                min_active_minutes=min_active_minutes,
            )
            weekly_rows.append(
                {
                    "week_start_date": wk_start,
                    "user_id": user_id,
                    "display_name": row["display_name"],
                    "sessions_count": wk_agg["sessions_count"],
                    "duration_sec": wk_agg["duration_sec"],
                    "distance_m": wk_agg["distance_m"],
                    "elevation_gain_m": wk_agg["elevation_gain_m"],
                    "training_load": wk_agg["training_load"],
                }
            )

    radar_rows = [
        {
            "user_id": row["user_id"],
            "display_name": row["display_name"],
            "volume_norm": row["volume_norm"],
            "regularity_norm": round(float(row["regularity_score"]), 1),
            "progression_norm": row["progression_norm"],
            "streak_norm": row["streak_norm"],
            "group_score": row["group_score"],
        }
        for row in member_rows
    ]

    load_4w_rows = [
        {
            "user_id": row["user_id"],
            "display_name": row["display_name"],
            "load_4w": row["load_4w"],
            "distance_4w_m": row["month_distance_m"],
            "sessions_4w": row["month_sessions"],
        }
        for row in member_rows
    ]

    monthly_cumulative: list[dict[str, Any]] = []
    for row in member_rows:
        user_activities = activities_by_user.get(row["user_id"], [])
        distance_by_day: dict[date, float] = {}
        load_by_day: dict[date, float] = {}
        for activity in user_activities:
            metric_date = _activity_date(activity)
            if metric_date < month_start or metric_date > today:
                continue
            distance_by_day[metric_date] = distance_by_day.get(metric_date, 0.0) + float(activity.distance_m)
            load_by_day[metric_date] = load_by_day.get(metric_date, 0.0) + _activity_load(activity)

        cumulative_distance = 0.0
        cumulative_load = 0.0
        for day_offset in range((today - month_start).days + 1):
            metric_date = month_start + timedelta(days=day_offset)
            cumulative_distance += distance_by_day.get(metric_date, 0.0)
            cumulative_load += load_by_day.get(metric_date, 0.0)
            monthly_cumulative.append(
                {
                    "date": metric_date,
                    "user_id": row["user_id"],
                    "display_name": row["display_name"],
                    "cum_distance_m": round(cumulative_distance, 1),
                    "cum_load": round(cumulative_load, 2),
                }
            )

    heatmap_rows: list[dict[str, Any]] = []
    for row in member_rows:
        user_activities = activities_by_user.get(row["user_id"], [])
        minutes_by_day: dict[date, float] = {}
        for activity in user_activities:
            metric_date = _activity_date(activity)
            if metric_date < heatmap_start or metric_date > today:
                continue
            minutes_by_day[metric_date] = minutes_by_day.get(metric_date, 0.0) + float(activity.duration_sec) / 60.0

        for day_offset in range((today - heatmap_start).days + 1):
            metric_date = heatmap_start + timedelta(days=day_offset)
            active_minutes = round(minutes_by_day.get(metric_date, 0.0), 1)
            heatmap_rows.append(
                {
                    "date": metric_date,
                    "display_name": row["display_name"],
                    "active_minutes": active_minutes,
                    "is_active": active_minutes >= float(min_active_minutes),
                    "weekday": metric_date.strftime("%a"),
                    "week_start_date": _week_start(metric_date),
                }
            )

    total_week_sessions = sum(int(row["sessions_7d"]) for row in member_rows)
    total_week_distance_km = sum(float(row["distance_7d_m"]) for row in member_rows) / 1000.0
    total_week_dplus = sum(float(row["elevation_7d_m"]) for row in member_rows)
    target_distance_km = max(30.0, round(total_week_distance_km * 1.25 + 5.0, 1))
    target_dplus = max(2000.0, round(total_week_dplus * 1.25 + 100.0, 0))
    best_streak = max(int(row["streak_days"]) for row in member_rows)

    sorted_by_sessions = sorted(member_rows, key=lambda item: item["sessions_7d"], reverse=True)
    sessions_leader = sorted_by_sessions[0] if sorted_by_sessions else None
    run_month_km = 0.0
    trail_month_km = 0.0
    ride_month_km = 0.0
    for activity in activities:
        metric_date = _activity_date(activity)
        if metric_date < month_start or metric_date > today:
            continue
        normalized = _normalize_sport_type(activity.sport_type)
        if normalized == "run":
            run_month_km += float(activity.distance_m) / 1000.0
        elif normalized == "trailrun":
            trail_month_km += float(activity.distance_m) / 1000.0
        elif normalized == "ride":
            ride_month_km += float(activity.distance_m) / 1000.0

    challenges = [
        {
            "code": "first_to_sessions",
            "title": f"Premier a {sessions_target} seances cette semaine",
            "current_value": float(sessions_leader["sessions_7d"]) if sessions_leader else 0.0,
            "target_value": float(sessions_target),
            "unit": "seances",
            "leader": sessions_leader["display_name"] if sessions_leader else "n/a",
            "progress_pct": round(_clamp((float(sessions_leader["sessions_7d"]) if sessions_leader else 0.0) / max(float(sessions_target), 1.0) * 100.0, 0.0, 100.0), 1),
            "is_complete": bool(sessions_leader and int(sessions_leader["sessions_7d"]) >= sessions_target),
        },
        {
            "code": "group_distance",
            "title": "Distance groupe avant dimanche",
            "current_value": round(total_week_distance_km, 1),
            "target_value": target_distance_km,
            "unit": "km",
            "leader": None,
            "progress_pct": round(_clamp(total_week_distance_km / max(target_distance_km, 1.0) * 100.0, 0.0, 100.0), 1),
            "is_complete": total_week_distance_km >= target_distance_km,
        },
        {
            "code": "group_dplus",
            "title": "D+ cumule en equipe",
            "current_value": round(total_week_dplus, 1),
            "target_value": target_dplus,
            "unit": "m",
            "leader": None,
            "progress_pct": round(_clamp(total_week_dplus / max(target_dplus, 1.0) * 100.0, 0.0, 100.0), 1),
            "is_complete": total_week_dplus >= target_dplus,
        },
        {
            "code": "streak_group",
            "title": "Streak groupe de 10 jours actifs",
            "current_value": float(best_streak),
            "target_value": 10.0,
            "unit": "jours",
            "leader": max(member_rows, key=lambda item: item["streak_days"])["display_name"],
            "progress_pct": round(_clamp(best_streak / 10.0 * 100.0, 0.0, 100.0), 1),
            "is_complete": best_streak >= 10,
        },
        {
            "code": "duel_sports",
            "title": "Duel course / trail / velo (mois)",
            "current_value": round(max(run_month_km, trail_month_km, ride_month_km), 1),
            "target_value": round(run_month_km + trail_month_km + ride_month_km, 1),
            "unit": "km",
            "leader": (
                "course" if run_month_km >= trail_month_km and run_month_km >= ride_month_km
                else "trail" if trail_month_km >= ride_month_km
                else "velo"
            ),
            "progress_pct": None,
            "is_complete": False,
            "details": {
                "course_km": round(run_month_km, 1),
                "trail_km": round(trail_month_km, 1),
                "velo_km": round(ride_month_km, 1),
            },
        },
    ]

    current_challenge = next((item["title"] for item in challenges if not item.get("is_complete")), challenges[0]["title"])

    badges: list[dict[str, Any]] = []
    def add_badge(code: str, title: str, row: dict[str, Any], reason: str) -> None:
        badges.append(
            {
                "code": code,
                "title": title,
                "user_id": row["user_id"],
                "display_name": row["display_name"],
                "reason": reason,
                "is_current_user": row["is_current_user"],
            }
        )

    most_regular = max(member_rows, key=lambda item: item["regularity_score"])
    add_badge("most_regular", "Plus regulier", most_regular, "Meilleur score de regularite.")

    best_progression = max(member_rows, key=lambda item: item["progression_recent_pct"] or -999.0)
    add_badge("best_progression", "Plus grosse progression", best_progression, "Meilleure evolution recente.")

    best_week = max(member_rows, key=lambda item: item["duration_7d_sec"])
    add_badge("best_week", "Meilleure semaine", best_week, "Plus gros volume sur 7 jours.")

    king_dplus = max(member_rows, key=lambda item: item["elevation_7d_m"])
    add_badge("dplus_king", "Roi du D+", king_dplus, "Plus fort denivele sur 7 jours.")

    group_engine = max(member_rows, key=lambda item: item["group_score"])
    add_badge("group_engine", "Moteur du groupe", group_engine, "Meilleur score gamifie global.")

    comeback = max(
        member_rows,
        key=lambda item: (item["progression_recent_pct"] or -999.0, -item["duration_7d_sec"]),
    )
    add_badge("comeback", "Retour en forme", comeback, "Progression positive marquante.")

    sunday_warrior = max(member_rows, key=lambda item: item["sunday_sessions_period"])
    add_badge("sunday_warrior", "Guerrier du dimanche", sunday_warrior, "Le plus actif le dimanche.")

    social_history: list[dict[str, Any]] = []
    for row in member_rows:
        if row["sessions_7d"] >= sessions_target:
            social_history.append(
                {
                    "kind": "weekly_target",
                    "message": f"{row['display_name']} a valide son objectif hebdo ({row['sessions_7d']} seances).",
                }
            )
        if (row["progression_recent_pct"] or 0.0) >= 20:
            social_history.append(
                {
                    "kind": "progression_record",
                    "message": f"{row['display_name']} a battu son record de volume recent.",
                }
            )
        if row["streak_days"] >= 10:
            social_history.append(
                {
                    "kind": "streak",
                    "message": f"{row['display_name']} est en streak de {row['streak_days']} jours.",
                }
            )

    group_month_distance_km = round(sum(float(row["month_distance_m"]) for row in member_rows) / 1000.0, 1)
    if group_month_distance_km >= 100:
        social_history.append(
            {
                "kind": "group_milestone",
                "message": f"Le groupe a atteint {group_month_distance_km:.1f} km ce mois-ci.",
            }
        )
    social_history.append(
        {
            "kind": "challenge",
            "message": f"Defi groupe en cours: {current_challenge}.",
        }
    )
    social_history = social_history[:12]

    members_output = sorted(member_rows, key=lambda row: row["group_score"], reverse=True)
    for index, row in enumerate(members_output, start=1):
        row["rank"] = index

    return {
        "period_days": period_days,
        "sport_filter": sport_type,
        "available_sports": available_sports,
        "overview": {
            "sessions_count": group_sessions,
            "duration_sec": group_duration,
            "distance_m": group_distance,
            "elevation_gain_m": group_dplus,
            "average_streak_days": avg_streak,
            "current_challenge": current_challenge,
        },
        "members": members_output,
        "leaderboards": leaderboards,
        "visualizations": {
            "weekly_by_user": weekly_rows,
            "load_4w_by_user": load_4w_rows,
            "radar_by_user": radar_rows,
            "monthly_cumulative": monthly_cumulative,
            "heatmap": heatmap_rows,
        },
        "challenges": challenges,
        "badges": badges,
        "social_history": social_history,
    }

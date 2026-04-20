from datetime import UTC, date, datetime
from typing import Any, Optional

from sqlmodel import Session, select

from app.models import Athlete, Group, GroupMember, User, WeeklyMetric
from app.schemas.group import GroupCreate


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

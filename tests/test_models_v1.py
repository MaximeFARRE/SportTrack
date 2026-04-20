from datetime import date
from uuid import uuid4

from app.db import create_db_and_tables, get_session
from app.models import Athlete, DailyMetric, Group, GroupMember, User, WeeklyMetric


def test_group_and_group_member_models() -> None:
    create_db_and_tables()
    session_generator = get_session()
    session = next(session_generator)

    try:
        user = User(
            email=f"group_owner_{uuid4().hex}@example.com",
            password_hash="hash",
            display_name="Owner",
            is_active=True,
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        group = Group(
            name="Team Trail",
            owner_user_id=user.id,
            description="Groupe de test",
            is_active=True,
        )
        session.add(group)
        session.commit()
        session.refresh(group)

        member = GroupMember(group_id=group.id, user_id=user.id, role="owner", is_active=True)
        session.add(member)
        session.commit()
        session.refresh(member)

        assert group.id is not None
        assert member.id is not None
        assert member.group_id == group.id
        assert member.user_id == user.id
    finally:
        session_generator.close()


def test_daily_and_weekly_metric_models() -> None:
    create_db_and_tables()
    session_generator = get_session()
    session = next(session_generator)

    try:
        user = User(
            email=f"metric_owner_{uuid4().hex}@example.com",
            password_hash="hash",
            display_name="Athlete Owner",
            is_active=True,
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        athlete = Athlete(user_id=user.id, provider="strava", provider_athlete_id=uuid4().hex)
        session.add(athlete)
        session.commit()
        session.refresh(athlete)

        daily_metric = DailyMetric(
            athlete_id=athlete.id,
            metric_date=date(2026, 4, 20),
            sessions_count=1,
            duration_sec=3600,
            distance_m=10000,
            elevation_gain_m=150,
            training_load=75,
        )
        session.add(daily_metric)

        weekly_metric = WeeklyMetric(
            athlete_id=athlete.id,
            week_start_date=date(2026, 4, 20),
            sessions_count=3,
            duration_sec=9000,
            distance_m=25000,
            elevation_gain_m=500,
            training_load=210,
        )
        session.add(weekly_metric)
        session.commit()
        session.refresh(daily_metric)
        session.refresh(weekly_metric)

        assert daily_metric.id is not None
        assert weekly_metric.id is not None
        assert daily_metric.athlete_id == athlete.id
        assert weekly_metric.athlete_id == athlete.id
    finally:
        session_generator.close()

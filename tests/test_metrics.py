from datetime import date, datetime
from uuid import uuid4

from fastapi.testclient import TestClient

from app.db import create_db_and_tables, get_session
from app.main import app
from app.models import Activity, Athlete, User, WeeklyMetric


def test_recompute_and_read_metrics() -> None:
    create_db_and_tables()
    session_generator = get_session()
    session = next(session_generator)
    athlete_id: int | None = None

    try:
        user = User(
            email=f"metrics_user_{uuid4().hex}@example.com",
            password_hash="hash",
            display_name="Metrics User",
            is_active=True,
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        athlete = Athlete(
            user_id=user.id,
            provider="strava",
            provider_athlete_id=uuid4().hex,
            access_token="token_123",
            refresh_token="refresh_123",
            token_expires_at=1777000000,
        )
        session.add(athlete)
        session.commit()
        session.refresh(athlete)
        athlete_id = athlete.id

        activities = [
            Activity(
                athlete_id=athlete.id,
                provider_activity_id=f"m_{uuid4().hex}",
                name="Run 1",
                sport_type="Run",
                start_date=datetime.fromisoformat("2026-04-20T06:00:00+00:00"),
                duration_sec=1800,
                moving_time_sec=1700,
                distance_m=5000,
                elevation_gain_m=80,
            ),
            Activity(
                athlete_id=athlete.id,
                provider_activity_id=f"m_{uuid4().hex}",
                name="Run 2",
                sport_type="Run",
                start_date=datetime.fromisoformat("2026-04-20T18:00:00+00:00"),
                duration_sec=2400,
                moving_time_sec=2300,
                distance_m=7000,
                elevation_gain_m=100,
            ),
            Activity(
                athlete_id=athlete.id,
                provider_activity_id=f"m_{uuid4().hex}",
                name="Ride",
                sport_type="Ride",
                start_date=datetime.fromisoformat("2026-04-22T07:30:00+00:00"),
                duration_sec=3600,
                moving_time_sec=3500,
                distance_m=25000,
                elevation_gain_m=300,
            ),
        ]
        for activity in activities:
            session.add(activity)
        session.commit()
    finally:
        session_generator.close()

    with TestClient(app) as client:
        recompute_response = client.post(f"/metrics/athletes/{athlete_id}/recompute")
        assert recompute_response.status_code == 200
        recompute_payload = recompute_response.json()
        assert recompute_payload["message"] == "Recalcul des metriques termine."
        assert recompute_payload["activities_processed"] == 3
        assert recompute_payload["daily_metrics_count"] == 2
        assert recompute_payload["weekly_metrics_count"] == 1

        daily_response = client.get(f"/metrics/daily?athlete_id={athlete_id}")
        assert daily_response.status_code == 200
        daily_metrics = daily_response.json()
        assert len(daily_metrics) == 2
        total_sessions = sum(item["sessions_count"] for item in daily_metrics)
        assert total_sessions == 3

        weekly_response = client.get(f"/metrics/weekly?athlete_id={athlete_id}")
        assert weekly_response.status_code == 200
        weekly_metrics = weekly_response.json()
        assert len(weekly_metrics) == 1
        assert weekly_metrics[0]["sessions_count"] == 3

        dashboard_response = client.get(
            f"/metrics/dashboard/athletes/{athlete_id}?period_days=365&recent_activities_limit=3"
        )
        assert dashboard_response.status_code == 200
        dashboard_payload = dashboard_response.json()
        assert dashboard_payload["athlete_id"] == athlete_id
        assert dashboard_payload["sessions_count"] == 3
        assert len(dashboard_payload["sports_breakdown"]) == 2
        assert len(dashboard_payload["recent_activities"]) == 3


def test_weekly_comparison_all_connected_users() -> None:
    create_db_and_tables()
    session_generator = get_session()
    session = next(session_generator)

    try:
        run_id = uuid4().hex[:8]
        actor_name = f"Actor {run_id}"
        member_a_name = f"Member A {run_id}"
        member_b_name = f"Member B {run_id}"
        inactive_name = f"Inactive {run_id}"

        actor = User(
            email=f"metrics_actor_{uuid4().hex}@example.com",
            password_hash="hash",
            display_name=actor_name,
            is_active=True,
        )
        member_a = User(
            email=f"metrics_member_a_{uuid4().hex}@example.com",
            password_hash="hash",
            display_name=member_a_name,
            is_active=True,
        )
        member_b = User(
            email=f"metrics_member_b_{uuid4().hex}@example.com",
            password_hash="hash",
            display_name=member_b_name,
            is_active=True,
        )
        inactive = User(
            email=f"metrics_inactive_{uuid4().hex}@example.com",
            password_hash="hash",
            display_name=inactive_name,
            is_active=False,
        )
        session.add(actor)
        session.add(member_a)
        session.add(member_b)
        session.add(inactive)
        session.commit()
        session.refresh(actor)
        session.refresh(member_a)
        session.refresh(member_b)
        session.refresh(inactive)

        actor_athlete = Athlete(user_id=actor.id, provider="strava", provider_athlete_id=uuid4().hex)
        member_a_athlete = Athlete(user_id=member_a.id, provider="strava", provider_athlete_id=uuid4().hex)
        member_b_athlete = Athlete(user_id=member_b.id, provider="strava", provider_athlete_id=uuid4().hex)
        inactive_athlete = Athlete(user_id=inactive.id, provider="strava", provider_athlete_id=uuid4().hex)
        session.add(actor_athlete)
        session.add(member_a_athlete)
        session.add(member_b_athlete)
        session.add(inactive_athlete)
        session.commit()
        session.refresh(actor_athlete)
        session.refresh(member_a_athlete)
        session.refresh(member_b_athlete)
        session.refresh(inactive_athlete)

        actor_metric = WeeklyMetric(
            athlete_id=actor_athlete.id,
            week_start_date=date(2026, 4, 20),
            sessions_count=3,
            duration_sec=9000,
            distance_m=22000,
            elevation_gain_m=350,
            training_load=150,
        )
        member_a_metric = WeeklyMetric(
            athlete_id=member_a_athlete.id,
            week_start_date=date(2026, 4, 20),
            sessions_count=4,
            duration_sec=12000,
            distance_m=30000,
            elevation_gain_m=500,
            training_load=190,
        )
        member_b_metric = WeeklyMetric(
            athlete_id=member_b_athlete.id,
            week_start_date=date(2026, 4, 20),
            sessions_count=2,
            duration_sec=5400,
            distance_m=14000,
            elevation_gain_m=180,
            training_load=95,
        )
        inactive_metric = WeeklyMetric(
            athlete_id=inactive_athlete.id,
            week_start_date=date(2026, 4, 20),
            sessions_count=5,
            duration_sec=13000,
            distance_m=35000,
            elevation_gain_m=700,
            training_load=210,
        )
        session.add(actor_metric)
        session.add(member_a_metric)
        session.add(member_b_metric)
        session.add(inactive_metric)
        session.commit()

        actor_user_id = actor.id
    finally:
        session_generator.close()

    with TestClient(app) as client:
        response = client.get(
            f"/metrics/comparison/weekly?actor_user_id={actor_user_id}&start_date=2026-04-20&end_date=2026-04-20"
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["actor_user_id"] == actor_user_id
        members = payload["members"]
        by_name = {item["display_name"]: item for item in members}

        assert inactive_name not in by_name
        assert member_a_name in by_name
        assert actor_name in by_name
        assert member_b_name in by_name

        assert by_name[member_a_name]["training_load"] == 190
        assert by_name[actor_name]["training_load"] == 150
        assert by_name[member_b_name]["training_load"] == 95
        assert (
            by_name[member_a_name]["training_load"]
            > by_name[actor_name]["training_load"]
            > by_name[member_b_name]["training_load"]
        )

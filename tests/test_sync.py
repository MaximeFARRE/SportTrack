from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient

from app.db import create_db_and_tables, get_session
from app.main import app
from app.models import Athlete, User


def test_sync_strava_activities_imports_data(monkeypatch) -> None:
    create_db_and_tables()
    session_generator = get_session()
    session = next(session_generator)

    try:
        user = User(
            email=f"sync_user_{uuid4().hex}@example.com",
            password_hash="hash",
            display_name="Sync User",
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
            token_expires_at=int((datetime.now(UTC) + timedelta(hours=1)).timestamp()),
        )
        session.add(athlete)
        session.commit()
        session.refresh(athlete)
    finally:
        session_generator.close()

    fake_activities = [
        {
            "id": 111,
            "name": "Easy Run",
            "sport_type": "Run",
            "start_date": "2026-04-20T06:00:00Z",
            "elapsed_time": 3200,
            "moving_time": 3100,
            "distance": 8500,
            "total_elevation_gain": 75,
        },
        {
            "id": 222,
            "name": "Bike Session",
            "sport_type": "Ride",
            "start_date": "2026-04-20T08:00:00Z",
            "elapsed_time": 5400,
            "moving_time": 5200,
            "distance": 28000,
            "total_elevation_gain": 240,
        },
    ]

    def fake_fetch_athlete_activities(access_token: str, per_page: int = 30, page: int = 1):
        assert access_token == "token_123"
        assert per_page == 30
        assert page == 1
        return fake_activities

    monkeypatch.setattr(
        "app.services.sync_service.fetch_athlete_activities",
        fake_fetch_athlete_activities,
    )

    with TestClient(app) as client:
        sync_response = client.post(f"/sync/athletes/{athlete.id}/strava?per_page=30")
        assert sync_response.status_code == 200

        sync_payload = sync_response.json()
        assert sync_payload["message"] == "Synchronisation Strava terminee."
        assert sync_payload["athlete_id"] == athlete.id
        assert sync_payload["fetched_count"] == 2
        assert sync_payload["imported_count"] == 2
        assert sync_payload["skipped_count"] == 0
        assert sync_payload["daily_metrics_count"] == 1
        assert sync_payload["weekly_metrics_count"] == 1

        activities_response = client.get(f"/activities?athlete_id={athlete.id}")
        assert activities_response.status_code == 200
        activities_payload = activities_response.json()
        assert len(activities_payload) >= 2
        assert any(item["provider_activity_id"] == "111" for item in activities_payload)
        assert any(item["provider_activity_id"] == "222" for item in activities_payload)


def test_import_strava_history_paginates(monkeypatch) -> None:
    create_db_and_tables()
    session_generator = get_session()
    session = next(session_generator)

    try:
        user = User(
            email=f"sync_history_user_{uuid4().hex}@example.com",
            password_hash="hash",
            display_name="Sync History User",
            is_active=True,
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        athlete = Athlete(
            user_id=user.id,
            provider="strava",
            provider_athlete_id=uuid4().hex,
            access_token="token_history",
            refresh_token="refresh_history",
            token_expires_at=int((datetime.now(UTC) + timedelta(hours=1)).timestamp()),
        )
        session.add(athlete)
        session.commit()
        session.refresh(athlete)
        athlete_id = athlete.id
    finally:
        session_generator.close()

    def fake_fetch_athlete_activities(access_token: str, per_page: int = 100, page: int = 1):
        assert access_token == "token_history"
        if page == 1:
            return [
                {
                    "id": 1001,
                    "name": "History Run 1",
                    "sport_type": "Run",
                    "start_date": "2026-03-01T08:00:00Z",
                    "elapsed_time": 3600,
                    "moving_time": 3500,
                    "distance": 10000,
                    "total_elevation_gain": 120,
                },
                {
                    "id": 1002,
                    "name": "History Run 2",
                    "sport_type": "Run",
                    "start_date": "2026-03-03T08:00:00Z",
                    "elapsed_time": 3800,
                    "moving_time": 3600,
                    "distance": 10500,
                    "total_elevation_gain": 140,
                },
            ]
        if page == 2:
            return [
                {
                    "id": 1003,
                    "name": "History Ride",
                    "sport_type": "Ride",
                    "start_date": "2026-03-05T08:00:00Z",
                    "elapsed_time": 5400,
                    "moving_time": 5200,
                    "distance": 30000,
                    "total_elevation_gain": 300,
                }
            ]
        return []

    monkeypatch.setattr(
        "app.services.sync_service.fetch_athlete_activities",
        fake_fetch_athlete_activities,
    )

    with TestClient(app) as client:
        history_response = client.post(f"/sync/athletes/{athlete_id}/strava/history?per_page=2&max_pages=3")
        assert history_response.status_code == 200
        history_payload = history_response.json()
        assert history_payload["message"] == "Import historique Strava termine."
        assert history_payload["fetched_count"] == 3
        assert history_payload["imported_count"] == 3
        assert history_payload["skipped_count"] == 0
        assert history_payload["daily_metrics_count"] >= 1
        assert history_payload["weekly_metrics_count"] >= 1

        activities_response = client.get(f"/activities?athlete_id={athlete_id}")
        assert activities_response.status_code == 200
        activities_payload = activities_response.json()
        assert any(item["provider_activity_id"] == "1001" for item in activities_payload)
        assert any(item["provider_activity_id"] == "1002" for item in activities_payload)
        assert any(item["provider_activity_id"] == "1003" for item in activities_payload)

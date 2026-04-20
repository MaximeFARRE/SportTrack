from uuid import uuid4

from fastapi.testclient import TestClient

from app.db import create_db_and_tables, get_session
from app.main import app
from app.models import Athlete, User


def test_create_and_list_activities() -> None:
    create_db_and_tables()
    session_generator = get_session()
    session = next(session_generator)

    try:
        user = User(
            email=f"activity_user_{uuid4().hex}@example.com",
            password_hash="hash",
            display_name="Activity User",
            is_active=True,
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        athlete = Athlete(
            user_id=user.id,
            provider="strava",
            provider_athlete_id=uuid4().hex,
            firstname="Test",
            lastname="Athlete",
        )
        session.add(athlete)
        session.commit()
        session.refresh(athlete)
    finally:
        session_generator.close()

    with TestClient(app) as client:
        provider_activity_id = uuid4().hex

        create_response = client.post(
            "/activities",
            json={
                "athlete_id": athlete.id,
                "provider_activity_id": provider_activity_id,
                "name": "Morning Run",
                "sport_type": "Run",
                "start_date": "2026-04-20T06:30:00",
                "duration_sec": 3600,
                "moving_time_sec": 3500,
                "distance_m": 10000,
                "elevation_gain_m": 120,
            },
        )
        assert create_response.status_code == 201
        created_activity = create_response.json()
        assert created_activity["name"] == "Morning Run"
        assert created_activity["athlete_id"] == athlete.id

        activity_id = created_activity["id"]

        read_response = client.get(f"/activities/{activity_id}")
        assert read_response.status_code == 200
        assert read_response.json()["id"] == activity_id

        list_response = client.get(f"/activities?athlete_id={athlete.id}&sport_type=Run")
        assert list_response.status_code == 200
        activities = list_response.json()
        assert len(activities) >= 1
        assert any(item["id"] == activity_id for item in activities)

        duplicate_response = client.post(
            "/activities",
            json={
                "athlete_id": athlete.id,
                "provider_activity_id": provider_activity_id,
                "name": "Duplicate Run",
                "sport_type": "Run",
                "start_date": "2026-04-20T07:30:00",
            },
        )
        assert duplicate_response.status_code == 400

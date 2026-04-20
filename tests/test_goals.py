from uuid import uuid4

from fastapi.testclient import TestClient

from app.db import create_db_and_tables, get_session
from app.main import app
from app.models import Athlete, User


def test_goal_flow_with_permissions() -> None:
    create_db_and_tables()
    session_generator = get_session()
    session = next(session_generator)

    try:
        owner = User(
            email=f"goal_owner_{uuid4().hex}@example.com",
            password_hash="hash",
            display_name="Goal Owner",
            is_active=True,
        )
        outsider = User(
            email=f"goal_outsider_{uuid4().hex}@example.com",
            password_hash="hash",
            display_name="Goal Outsider",
            is_active=True,
        )
        session.add(owner)
        session.add(outsider)
        session.commit()
        session.refresh(owner)
        session.refresh(outsider)

        owner_athlete = Athlete(
            user_id=owner.id,
            provider="strava",
            provider_athlete_id=uuid4().hex,
        )
        session.add(owner_athlete)
        session.commit()
        session.refresh(owner_athlete)

        owner_id = owner.id
        outsider_id = outsider.id
        owner_athlete_id = owner_athlete.id
    finally:
        session_generator.close()

    with TestClient(app) as client:
        create_response = client.post(
            f"/goals?actor_user_id={owner_id}",
            json={
                "athlete_id": owner_athlete_id,
                "name": "Objectif 10K",
                "sport_type": "Run",
                "target_date": "2026-09-15",
                "target_distance_m": 10000,
                "target_elevation_gain_m": 150,
                "notes": "Test objectif",
            },
        )
        assert create_response.status_code == 201
        created_goal = create_response.json()
        goal_id = created_goal["id"]
        assert created_goal["name"] == "Objectif 10K"
        assert created_goal["is_active"] is True

        outsider_create_response = client.post(
            f"/goals?actor_user_id={outsider_id}",
            json={
                "athlete_id": owner_athlete_id,
                "name": "Goal interdit",
            },
        )
        assert outsider_create_response.status_code == 403

        read_response = client.get(f"/goals/{goal_id}?actor_user_id={owner_id}")
        assert read_response.status_code == 200
        assert read_response.json()["id"] == goal_id

        outsider_read_response = client.get(f"/goals/{goal_id}?actor_user_id={outsider_id}")
        assert outsider_read_response.status_code == 403

        update_response = client.patch(
            f"/goals/{goal_id}?actor_user_id={owner_id}",
            json={"name": "Objectif Semi", "target_distance_m": 21097.5},
        )
        assert update_response.status_code == 200
        updated_goal = update_response.json()
        assert updated_goal["name"] == "Objectif Semi"
        assert updated_goal["target_distance_m"] == 21097.5

        list_active_response = client.get(f"/goals?actor_user_id={owner_id}&athlete_id={owner_athlete_id}")
        assert list_active_response.status_code == 200
        assert len(list_active_response.json()) >= 1

        archive_response = client.post(f"/goals/{goal_id}/archive?actor_user_id={owner_id}")
        assert archive_response.status_code == 200
        assert archive_response.json()["is_active"] is False

        list_after_archive_response = client.get(f"/goals?actor_user_id={owner_id}&athlete_id={owner_athlete_id}")
        assert list_after_archive_response.status_code == 200
        assert all(item["id"] != goal_id for item in list_after_archive_response.json())

        list_inactive_response = client.get(
            f"/goals?actor_user_id={owner_id}&athlete_id={owner_athlete_id}&include_inactive=true"
        )
        assert list_inactive_response.status_code == 200
        assert any(item["id"] == goal_id for item in list_inactive_response.json())

from datetime import date
from uuid import uuid4

from fastapi.testclient import TestClient

from app.db import create_db_and_tables, get_session
from app.main import app
from app.models import Athlete, User, WeeklyMetric


def test_group_flow_and_weekly_comparison() -> None:
    create_db_and_tables()
    session_generator = get_session()
    session = next(session_generator)

    try:
        owner = User(
            email=f"group_owner_{uuid4().hex}@example.com",
            password_hash="hash",
            display_name="Owner",
            is_active=True,
        )
        member = User(
            email=f"group_member_{uuid4().hex}@example.com",
            password_hash="hash",
            display_name="Member",
            is_active=True,
        )
        outsider = User(
            email=f"group_outsider_{uuid4().hex}@example.com",
            password_hash="hash",
            display_name="Outsider",
            is_active=True,
        )
        session.add(owner)
        session.add(member)
        session.add(outsider)
        session.commit()
        session.refresh(owner)
        session.refresh(member)
        session.refresh(outsider)

        owner_athlete = Athlete(user_id=owner.id, provider="strava", provider_athlete_id=uuid4().hex)
        member_athlete = Athlete(user_id=member.id, provider="strava", provider_athlete_id=uuid4().hex)
        session.add(owner_athlete)
        session.add(member_athlete)
        session.commit()
        session.refresh(owner_athlete)
        session.refresh(member_athlete)

        owner_metric = WeeklyMetric(
            athlete_id=owner_athlete.id,
            week_start_date=date(2026, 4, 20),
            sessions_count=4,
            duration_sec=12000,
            distance_m=32000,
            elevation_gain_m=600,
            training_load=200,
        )
        member_metric = WeeklyMetric(
            athlete_id=member_athlete.id,
            week_start_date=date(2026, 4, 20),
            sessions_count=2,
            duration_sec=5400,
            distance_m=14000,
            elevation_gain_m=200,
            training_load=90,
        )
        session.add(owner_metric)
        session.add(member_metric)
        session.commit()

        owner_id = owner.id
        member_id = member.id
        outsider_id = outsider.id
    finally:
        session_generator.close()

    with TestClient(app) as client:
        create_response = client.post(
            "/groups",
            json={
                "name": "Trail Team",
                "description": "Team de test",
                "owner_user_id": owner_id,
            },
        )
        assert create_response.status_code == 201
        group_payload = create_response.json()
        group_id = group_payload["id"]

        owner_groups_response = client.get(f"/groups?user_id={owner_id}")
        assert owner_groups_response.status_code == 200
        assert any(item["id"] == group_id for item in owner_groups_response.json())

        add_member_response = client.post(
            f"/groups/{group_id}/members?actor_user_id={owner_id}",
            json={"group_id": group_id, "user_id": member_id, "role": "member"},
        )
        assert add_member_response.status_code == 201
        assert add_member_response.json()["user_id"] == member_id

        forbidden_add_response = client.post(
            f"/groups/{group_id}/members?actor_user_id={member_id}",
            json={"group_id": group_id, "user_id": outsider_id, "role": "member"},
        )
        assert forbidden_add_response.status_code == 403

        members_response = client.get(f"/groups/{group_id}/members?actor_user_id={member_id}")
        assert members_response.status_code == 200
        active_members = members_response.json()
        assert len(active_members) == 2

        comparison_response = client.get(
            f"/groups/{group_id}/comparison/weekly?actor_user_id={owner_id}&start_date=2026-04-20&end_date=2026-04-20"
        )
        assert comparison_response.status_code == 200
        comparison_payload = comparison_response.json()
        assert comparison_payload["group_id"] == group_id
        assert len(comparison_payload["members"]) == 2
        assert comparison_payload["members"][0]["training_load"] >= comparison_payload["members"][1]["training_load"]

        remove_member_response = client.delete(
            f"/groups/{group_id}/members/{member_id}?actor_user_id={owner_id}"
        )
        assert remove_member_response.status_code == 200
        assert remove_member_response.json()["is_active"] is False

        members_after_remove_response = client.get(f"/groups/{group_id}/members?actor_user_id={owner_id}")
        assert members_after_remove_response.status_code == 200
        assert len(members_after_remove_response.json()) == 1

        removed_member_access_response = client.get(f"/groups/{group_id}?actor_user_id={member_id}")
        assert removed_member_access_response.status_code == 403

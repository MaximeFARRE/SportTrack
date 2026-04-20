from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def test_user_read_update_and_deactivate_flow() -> None:
    with TestClient(app) as client:
        email = f"user_flow_{uuid4().hex}@example.com"

        register_response = client.post(
            "/auth/register",
            json={
                "email": email,
                "password": "password123",
                "display_name": "Initial Name",
            },
        )
        assert register_response.status_code == 201
        user = register_response.json()
        user_id = user["id"]

        read_response = client.get(f"/users/{user_id}")
        assert read_response.status_code == 200
        assert read_response.json()["display_name"] == "Initial Name"

        update_response = client.patch(
            f"/users/{user_id}/display-name",
            json={"display_name": "Updated Name"},
        )
        assert update_response.status_code == 200
        assert update_response.json()["display_name"] == "Updated Name"

        deactivate_response = client.post(f"/users/{user_id}/deactivate")
        assert deactivate_response.status_code == 200
        assert deactivate_response.json()["is_active"] is False

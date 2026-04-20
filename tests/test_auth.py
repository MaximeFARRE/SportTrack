from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def test_register_and_login_flow() -> None:
    with TestClient(app) as client:
        email = f"test_{uuid4().hex}@example.com"

        register_response = client.post(
            "/auth/register",
            json={
                "email": email,
                "password": "password123",
                "display_name": "Test User",
            },
        )
        assert register_response.status_code == 201
        register_data = register_response.json()
        assert register_data["email"] == email
        assert register_data["display_name"] == "Test User"
        assert "password_hash" not in register_data

        login_response = client.post(
            "/auth/login",
            json={
                "email": email,
                "password": "password123",
            },
        )
        assert login_response.status_code == 200
        login_data = login_response.json()
        assert login_data["message"] == "Connexion reussie."
        assert login_data["user"]["email"] == email

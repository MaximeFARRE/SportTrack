from uuid import uuid4

from fastapi.testclient import TestClient

from app.config import settings
from app.db import create_db_and_tables, get_session
from app.main import app
from app.models import User


def _create_user_for_test() -> User:
    create_db_and_tables()
    session_generator = get_session()
    session = next(session_generator)

    try:
        user = User(
            email=f"athlete_user_{uuid4().hex}@example.com",
            password_hash="hash",
            display_name="Athlete User",
            is_active=True,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return user
    finally:
        session_generator.close()


def test_connect_strava_returns_authorization_url(monkeypatch) -> None:
    user = _create_user_for_test()

    monkeypatch.setattr(settings, "strava_client_id", "12345")
    monkeypatch.setattr(settings, "strava_client_secret", "secret")
    monkeypatch.setattr(
        settings,
        "strava_redirect_uri",
        "http://127.0.0.1:8000/athletes/strava/callback",
    )

    with TestClient(app) as client:
        response = client.get(f"/athletes/connect-strava?user_id={user.id}&state=test-state")

    assert response.status_code == 200
    payload = response.json()
    assert "authorization_url" in payload
    assert "client_id=12345" in payload["authorization_url"]
    assert "state=test-state" in payload["authorization_url"]


def test_strava_callback_creates_athlete(monkeypatch) -> None:
    user = _create_user_for_test()

    fake_token_payload = {
        "access_token": "access_123",
        "refresh_token": "refresh_123",
        "expires_at": 1777000000,
        "athlete": {
            "id": 999,
            "firstname": "Max",
            "lastname": "Runner",
            "profile": "https://example.com/profile.jpg",
        },
    }

    def fake_exchange_code_for_token(code: str) -> dict:
        assert code == "oauth-code"
        return fake_token_payload

    monkeypatch.setattr(
        "app.routers.athletes.exchange_code_for_token",
        fake_exchange_code_for_token,
    )

    with TestClient(app) as client:
        callback_response = client.get(f"/athletes/strava/callback?user_id={user.id}&code=oauth-code")

    assert callback_response.status_code == 200
    callback_payload = callback_response.json()
    assert callback_payload["message"] == "Connexion Strava reussie."
    assert callback_payload["athlete"]["user_id"] == user.id
    assert callback_payload["athlete"]["provider"] == "strava"
    assert callback_payload["athlete"]["provider_athlete_id"] == "999"

    with TestClient(app) as client:
        list_response = client.get(f"/athletes?user_id={user.id}")

    assert list_response.status_code == 200
    athletes = list_response.json()
    assert len(athletes) >= 1
    assert any(item["provider_athlete_id"] == "999" for item in athletes)


def test_strava_callback_accepts_user_from_state(monkeypatch) -> None:
    user = _create_user_for_test()

    fake_token_payload = {
        "access_token": "access_state",
        "refresh_token": "refresh_state",
        "expires_at": 1777001111,
        "athlete": {
            "id": 555,
            "firstname": "State",
            "lastname": "User",
        },
    }

    def fake_exchange_code_for_token(code: str) -> dict:
        assert code == "oauth-state"
        return fake_token_payload

    monkeypatch.setattr(
        "app.routers.athletes.exchange_code_for_token",
        fake_exchange_code_for_token,
    )

    with TestClient(app) as client:
        callback_response = client.get(f"/athletes/strava/callback?code=oauth-state&state=user:{user.id}")

    assert callback_response.status_code == 200
    callback_payload = callback_response.json()
    assert callback_payload["athlete"]["user_id"] == user.id
    assert callback_payload["athlete"]["provider_athlete_id"] == "555"

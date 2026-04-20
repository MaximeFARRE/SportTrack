from fastapi.testclient import TestClient
from sqlmodel import select

from app.db import get_session
from app.main import app


def test_health_check_returns_ok() -> None:
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_db_session_is_working() -> None:
    session_generator = get_session()
    session = next(session_generator)

    try:
        result = session.exec(select(1)).one()
        assert result == 1
    finally:
        session_generator.close()

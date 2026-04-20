import json
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from sqlmodel import Session, select

from app.config import settings
from app.models.athlete import Athlete


STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
STRAVA_ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities"


def _validate_strava_configuration() -> None:
    if not settings.strava_client_id.strip():
        raise ValueError("STRAVA_CLIENT_ID manquant.")
    if not settings.strava_client_secret.strip():
        raise ValueError("STRAVA_CLIENT_SECRET manquant.")
    if not settings.strava_redirect_uri.strip():
        raise ValueError("STRAVA_REDIRECT_URI manquant.")


def build_strava_authorization_url(state: str | None = None) -> str:
    _validate_strava_configuration()

    query_params = {
        "client_id": settings.strava_client_id,
        "response_type": "code",
        "redirect_uri": settings.strava_redirect_uri,
        "approval_prompt": "auto",
        "scope": settings.strava_scope,
    }
    if state:
        query_params["state"] = state

    return f"{STRAVA_AUTHORIZE_URL}?{urlencode(query_params)}"


def exchange_code_for_token(code: str) -> dict[str, Any]:
    _validate_strava_configuration()

    payload = urlencode(
        {
            "client_id": settings.strava_client_id,
            "client_secret": settings.strava_client_secret,
            "code": code,
            "grant_type": "authorization_code",
        }
    ).encode("utf-8")

    request = Request(
        STRAVA_TOKEN_URL,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=20) as response:
            raw_body = response.read().decode("utf-8")
    except Exception as exc:
        raise ValueError("Echec de l'echange du code Strava.") from exc

    try:
        token_payload = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise ValueError("Reponse Strava invalide.") from exc

    if not token_payload.get("access_token"):
        raise ValueError("Token Strava absent dans la reponse.")

    return token_payload


def refresh_access_token(refresh_token: str) -> dict[str, Any]:
    _validate_strava_configuration()

    payload = urlencode(
        {
            "client_id": settings.strava_client_id,
            "client_secret": settings.strava_client_secret,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        }
    ).encode("utf-8")

    request = Request(
        STRAVA_TOKEN_URL,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=20) as response:
            raw_body = response.read().decode("utf-8")
    except Exception as exc:
        raise ValueError("Echec du refresh token Strava.") from exc

    try:
        token_payload = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise ValueError("Reponse Strava invalide pendant le refresh token.") from exc

    if not token_payload.get("access_token"):
        raise ValueError("Token Strava absent apres refresh.")

    return token_payload


def ensure_valid_access_token(session: Session, athlete: Athlete) -> str:
    if not athlete.access_token:
        raise ValueError("Access token Strava manquant.")

    now_ts = int(datetime.now(UTC).timestamp())
    token_expires_at = athlete.token_expires_at or 0
    if token_expires_at > now_ts:
        return athlete.access_token

    if not athlete.refresh_token:
        raise ValueError("Refresh token Strava manquant.")

    refreshed_payload = refresh_access_token(athlete.refresh_token)
    athlete.access_token = refreshed_payload.get("access_token")
    athlete.refresh_token = refreshed_payload.get("refresh_token", athlete.refresh_token)
    athlete.token_expires_at = refreshed_payload.get("expires_at", athlete.token_expires_at)
    athlete.updated_at = datetime.now(UTC)

    session.add(athlete)
    session.commit()
    session.refresh(athlete)

    if not athlete.access_token:
        raise ValueError("Access token Strava manquant apres refresh.")
    return athlete.access_token


def fetch_athlete_activities(
    access_token: str,
    per_page: int = 30,
    page: int = 1,
) -> list[dict[str, Any]]:
    query = urlencode({"per_page": per_page, "page": page})
    url = f"{STRAVA_ACTIVITIES_URL}?{query}"
    request = Request(
        url,
        headers={"Authorization": f"Bearer {access_token}"},
        method="GET",
    )

    try:
        with urlopen(request, timeout=20) as response:
            raw_body = response.read().decode("utf-8")
    except Exception as exc:
        raise ValueError("Echec de recuperation des activites Strava.") from exc

    try:
        activities_payload = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise ValueError("Reponse Strava invalide pour les activites.") from exc

    if not isinstance(activities_payload, list):
        raise ValueError("Format des activites Strava invalide.")

    return activities_payload


def get_athletes_for_user(session: Session, user_id: int) -> list[Athlete]:
    statement = (
        select(Athlete)
        .where(Athlete.user_id == user_id)
        .order_by(Athlete.created_at.desc())
    )
    return list(session.exec(statement).all())


def upsert_strava_athlete(session: Session, user_id: int, token_payload: dict[str, Any]) -> Athlete:
    athlete_payload = token_payload.get("athlete") or {}
    provider_athlete_id_raw = athlete_payload.get("id")
    provider_athlete_id = str(provider_athlete_id_raw) if provider_athlete_id_raw else None

    statement = select(Athlete).where(Athlete.user_id == user_id).where(Athlete.provider == "strava")
    athlete = session.exec(statement).first()

    if athlete is None and provider_athlete_id:
        statement_by_provider = (
            select(Athlete)
            .where(Athlete.provider == "strava")
            .where(Athlete.provider_athlete_id == provider_athlete_id)
        )
        athlete = session.exec(statement_by_provider).first()

    if athlete is None:
        athlete = Athlete(user_id=user_id, provider="strava")

    athlete.user_id = user_id
    athlete.provider = "strava"
    athlete.provider_athlete_id = provider_athlete_id
    athlete.firstname = athlete_payload.get("firstname")
    athlete.lastname = athlete_payload.get("lastname")
    athlete.profile_picture = athlete_payload.get("profile")
    athlete.access_token = token_payload.get("access_token")
    athlete.refresh_token = token_payload.get("refresh_token")
    athlete.token_expires_at = token_payload.get("expires_at")
    athlete.updated_at = datetime.now(UTC)

    session.add(athlete)
    session.commit()
    session.refresh(athlete)
    return athlete

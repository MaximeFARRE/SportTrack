import json
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import UUID

from sqlmodel import Session, select

from app.config import settings
from app.models.athlete import Athlete


STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
STRAVA_ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities"
TOKEN_REFRESH_BUFFER_SECONDS = 10 * 60


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


def get_strava_config(supabase_client: Any) -> dict[str, Any]:
    """Return the app-level Strava credentials from the strava_config table."""
    result = supabase_client.table("strava_config").select("*").eq("id", 1).maybe_single().execute()
    return result.data or {}


def exchange_code_for_token(
    code: str,
    client_id: str | None = None,
    client_secret: str | None = None,
) -> dict[str, Any]:
    cid = client_id or settings.strava_client_id
    csecret = client_secret or settings.strava_client_secret
    if not cid or not csecret:
        raise ValueError("STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET manquants.")

    payload = urlencode(
        {
            "client_id": cid,
            "client_secret": csecret,
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


def refresh_access_token(
    refresh_token: str,
    client_id: str | None = None,
    client_secret: str | None = None,
) -> dict[str, Any]:
    cid = client_id or settings.strava_client_id
    csecret = client_secret or settings.strava_client_secret
    if not cid or not csecret:
        raise ValueError("STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET manquants.")

    payload = urlencode(
        {
            "client_id": cid,
            "client_secret": csecret,
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
    if token_expires_at > (now_ts + TOKEN_REFRESH_BUFFER_SECONDS):
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
    after: int | None = None,
) -> list[dict[str, Any]]:
    query_params: dict[str, int] = {"per_page": per_page, "page": page}
    if after is not None:
        query_params["after"] = int(after)
    query = urlencode(query_params)
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


# ── Supabase-backed token management (Phase 3+) ──────────────────────────────

def get_strava_connection(supabase_client: Any, user_id: UUID) -> dict | None:
    """Return the active provider_connections row for this user, or None."""
    result = (
        supabase_client.table("provider_connections")
        .select("*")
        .eq("user_id", str(user_id))
        .eq("provider", "strava")
        .eq("is_active", True)
        .maybe_single()
        .execute()
    )
    return result.data


def upsert_strava_connection(supabase_client: Any, user_id: UUID, token_payload: dict[str, Any]) -> dict:
    """Store or refresh Strava tokens in provider_connections."""
    athlete_data = token_payload.get("athlete") or {}
    provider_user_id = str(athlete_data.get("id", ""))
    scope_raw = token_payload.get("scope", "")
    scopes = [s.strip() for s in scope_raw.split(",") if s.strip()] if scope_raw else []

    data = {
        "user_id": str(user_id),
        "provider": "strava",
        "provider_user_id": provider_user_id,
        "access_token": token_payload.get("access_token"),
        "refresh_token": token_payload.get("refresh_token"),
        "token_expires_at": token_payload.get("expires_at"),
        "scopes": scopes,
        "is_active": True,
    }

    result = (
        supabase_client.table("provider_connections")
        .upsert(data, on_conflict="user_id,provider")
        .execute()
    )
    return result.data[0]


def ensure_valid_access_token_for_user(supabase_client: Any, user_id: UUID) -> str:
    """Return a valid Strava access token, refreshing if within 10-minute expiry window."""
    connection = get_strava_connection(supabase_client, user_id)
    if not connection:
        raise ValueError("Strava non connecté.")

    now_ts = int(datetime.now(UTC).timestamp())
    expires_at = int(connection.get("token_expires_at") or 0)

    if expires_at > now_ts + TOKEN_REFRESH_BUFFER_SECONDS:
        return connection["access_token"]

    refresh_tok = connection.get("refresh_token")
    if not refresh_tok:
        raise ValueError("Refresh token Strava manquant.")

    cfg = get_strava_config(supabase_client)
    refreshed = refresh_access_token(
        refresh_tok,
        client_id=cfg.get("client_id") or None,
        client_secret=cfg.get("client_secret") or None,
    )

    supabase_client.table("provider_connections").update({
        "access_token": refreshed["access_token"],
        "refresh_token": refreshed.get("refresh_token", refresh_tok),
        "token_expires_at": refreshed.get("expires_at", expires_at),
    }).eq("user_id", str(user_id)).eq("provider", "strava").execute()

    return refreshed["access_token"]

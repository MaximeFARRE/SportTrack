from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlmodel import Session

from app.config import settings
from app.db import get_session
from app.schemas.athlete import AthleteRead, StravaConnectResponse
from app.services.auth_service import get_or_create_user_for_strava, get_user_by_id
from app.services.strava_service import (
    build_strava_authorization_url,
    exchange_code_for_token,
    get_athletes_for_user,
    upsert_strava_athlete,
)


router = APIRouter(prefix="/athletes", tags=["athletes"])


@router.get("", response_model=list[AthleteRead])
def read_athletes_for_user(
    user_id: int = Query(..., description="Identifiant utilisateur."),
    session: Session = Depends(get_session),
) -> list[AthleteRead]:
    user = get_user_by_id(session=session, user_id=user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable.")

    return get_athletes_for_user(session=session, user_id=user_id)


@router.get("/connect-strava", response_model=StravaConnectResponse)
def connect_strava(session: Session = Depends(get_session)) -> StravaConnectResponse:
    try:
        authorization_url = build_strava_authorization_url(state="strava_login")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return StravaConnectResponse(authorization_url=authorization_url)


@router.get("/strava/callback")
def strava_callback(
    code: str = Query(..., description="Code OAuth renvoye par Strava."),
    state: str | None = Query(default=None),
    session: Session = Depends(get_session),
) -> RedirectResponse:
    try:
        token_payload = exchange_code_for_token(code=code)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    athlete_payload = token_payload.get("athlete") or {}
    strava_athlete_id = str(athlete_payload.get("id", ""))
    if not strava_athlete_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible de recuperer l'identifiant Strava de l'athlete.",
        )

    user = get_or_create_user_for_strava(
        session=session,
        strava_athlete_id=strava_athlete_id,
        firstname=athlete_payload.get("firstname"),
        lastname=athlete_payload.get("lastname"),
    )

    upsert_strava_athlete(session=session, user_id=user.id, token_payload=token_payload)

    redirect_url = f"{settings.streamlit_url}/?strava_user_id={user.id}"
    return RedirectResponse(url=redirect_url)

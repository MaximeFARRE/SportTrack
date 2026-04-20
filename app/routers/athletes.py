from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.db import get_session
from app.schemas.athlete import AthleteRead, StravaCallbackResponse, StravaConnectResponse
from app.services.auth_service import get_user_by_id
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
def connect_strava(
    user_id: int = Query(..., description="Identifiant utilisateur."),
    state: str | None = Query(default=None),
    session: Session = Depends(get_session),
) -> StravaConnectResponse:
    user = get_user_by_id(session=session, user_id=user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable.")

    oauth_state = state or f"user:{user_id}"

    try:
        authorization_url = build_strava_authorization_url(state=oauth_state)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return StravaConnectResponse(authorization_url=authorization_url)


@router.get("/strava/callback", response_model=StravaCallbackResponse)
def strava_callback(
    user_id: int | None = Query(default=None, description="Identifiant utilisateur."),
    code: str = Query(..., description="Code OAuth renvoye par Strava."),
    state: str | None = Query(default=None, description="State OAuth Strava."),
    session: Session = Depends(get_session),
) -> StravaCallbackResponse:
    resolved_user_id = user_id
    if resolved_user_id is None and state:
        if state.startswith("user:"):
            try:
                resolved_user_id = int(state.split(":", 1)[1])
            except ValueError:
                resolved_user_id = None

    if resolved_user_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="user_id manquant (query ou state OAuth).",
        )

    user = get_user_by_id(session=session, user_id=resolved_user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable.")

    try:
        token_payload = exchange_code_for_token(code=code)
        athlete = upsert_strava_athlete(session=session, user_id=resolved_user_id, token_payload=token_payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return StravaCallbackResponse(
        message="Connexion Strava reussie.",
        athlete=AthleteRead.model_validate(athlete),
    )

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.db import get_session
from app.services.sync_service import import_strava_history, sync_recent_strava_activities


router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/athletes/{athlete_id}/strava")
def sync_strava_activities_for_athlete(
    athlete_id: int,
    per_page: int = Query(default=30, ge=1, le=200),
    session: Session = Depends(get_session),
) -> dict:
    try:
        result = sync_recent_strava_activities(
            session=session,
            athlete_id=athlete_id,
            per_page=per_page,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return {
        "message": "Synchronisation Strava terminee.",
        **result,
    }


@router.post("/athletes/{athlete_id}/strava/history")
def sync_strava_history_for_athlete(
    athlete_id: int,
    per_page: int = Query(default=100, ge=1, le=200),
    max_pages: int = Query(default=10, ge=1, le=100),
    session: Session = Depends(get_session),
) -> dict:
    try:
        result = import_strava_history(
            session=session,
            athlete_id=athlete_id,
            per_page=per_page,
            max_pages=max_pages,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return {
        "message": "Import historique Strava termine.",
        **result,
    }

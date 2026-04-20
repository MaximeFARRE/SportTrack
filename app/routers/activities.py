from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.db import get_session
from app.schemas.activity import ActivityCreate, ActivityRead
from app.services.activity_service import create_activity, get_activity_by_id, list_activities


router = APIRouter(prefix="/activities", tags=["activities"])


@router.post("", response_model=ActivityRead, status_code=status.HTTP_201_CREATED)
def create_activity_endpoint(
    payload: ActivityCreate,
    session: Session = Depends(get_session),
) -> ActivityRead:
    try:
        activity = create_activity(session=session, activity_data=payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return activity


@router.get("/{activity_id}", response_model=ActivityRead)
def read_activity(activity_id: int, session: Session = Depends(get_session)) -> ActivityRead:
    activity = get_activity_by_id(session=session, activity_id=activity_id)
    if not activity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activite introuvable.")
    return activity


@router.get("", response_model=list[ActivityRead])
def read_activities(
    athlete_id: int | None = Query(default=None),
    sport_type: str | None = Query(default=None),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    session: Session = Depends(get_session),
) -> list[ActivityRead]:
    return list_activities(
        session=session,
        athlete_id=athlete_id,
        sport_type=sport_type,
        start_date=start_date,
        end_date=end_date,
    )

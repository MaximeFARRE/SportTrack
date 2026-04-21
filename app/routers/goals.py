from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.db import get_session
from app.schemas.goal import GoalCreate, GoalRead, GoalUpdate
from app.services.goal_service import (
    archive_goal,
    can_user_access_athlete,
    can_user_access_goal,
    create_goal,
    get_athlete_by_id,
    get_goal_campaign_summary,
    get_goal_by_id,
    list_goals_for_athlete,
    list_goals_for_user,
    update_goal,
)


router = APIRouter(prefix="/goals", tags=["goals"])


@router.post("", response_model=GoalRead, status_code=status.HTTP_201_CREATED)
def create_goal_endpoint(
    payload: GoalCreate,
    actor_user_id: int = Query(..., description="Utilisateur qui cree l'objectif."),
    session: Session = Depends(get_session),
) -> GoalRead:
    athlete = get_athlete_by_id(session=session, athlete_id=payload.athlete_id)
    if not athlete:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Athlete introuvable.")

    if not can_user_access_athlete(session=session, athlete_id=payload.athlete_id, user_id=actor_user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acces refuse a cet athlete.")

    return create_goal(session=session, payload=payload)


@router.get("", response_model=list[GoalRead])
def read_goals(
    actor_user_id: int = Query(..., description="Utilisateur qui consulte."),
    athlete_id: int | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    session: Session = Depends(get_session),
) -> list[GoalRead]:
    if athlete_id is not None:
        if not can_user_access_athlete(session=session, athlete_id=athlete_id, user_id=actor_user_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acces refuse a cet athlete.")
        return list_goals_for_athlete(
            session=session,
            athlete_id=athlete_id,
            include_inactive=include_inactive,
        )

    return list_goals_for_user(
        session=session,
        user_id=actor_user_id,
        include_inactive=include_inactive,
    )


@router.get("/{goal_id}", response_model=GoalRead)
def read_goal(
    goal_id: int,
    actor_user_id: int = Query(..., description="Utilisateur qui consulte."),
    session: Session = Depends(get_session),
) -> GoalRead:
    goal = get_goal_by_id(session=session, goal_id=goal_id)
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Objectif introuvable.")

    if not can_user_access_goal(session=session, goal_id=goal_id, user_id=actor_user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acces refuse a cet objectif.")

    return goal


@router.get("/{goal_id}/campaign")
def read_goal_campaign_summary(
    goal_id: int,
    actor_user_id: int = Query(..., description="Utilisateur qui consulte."),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    try:
        return get_goal_campaign_summary(
            session=session,
            goal_id=goal_id,
            actor_user_id=actor_user_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.patch("/{goal_id}", response_model=GoalRead)
def update_goal_endpoint(
    goal_id: int,
    payload: GoalUpdate,
    actor_user_id: int = Query(..., description="Utilisateur qui modifie."),
    session: Session = Depends(get_session),
) -> GoalRead:
    goal = get_goal_by_id(session=session, goal_id=goal_id)
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Objectif introuvable.")

    if not can_user_access_goal(session=session, goal_id=goal_id, user_id=actor_user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acces refuse a cet objectif.")

    return update_goal(session=session, goal=goal, payload=payload)


@router.post("/{goal_id}/archive", response_model=GoalRead)
def archive_goal_endpoint(
    goal_id: int,
    actor_user_id: int = Query(..., description="Utilisateur qui archive."),
    session: Session = Depends(get_session),
) -> GoalRead:
    goal = get_goal_by_id(session=session, goal_id=goal_id)
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Objectif introuvable.")

    if not can_user_access_goal(session=session, goal_id=goal_id, user_id=actor_user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acces refuse a cet objectif.")

    return archive_goal(session=session, goal=goal)

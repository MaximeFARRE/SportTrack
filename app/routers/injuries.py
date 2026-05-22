from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth.supabase_auth import get_current_user_id
from app.schemas.injury import InjuryCreate, InjuryUpdate
from app.services.injury_service import (
    create_injury,
    delete_injury,
    get_acwr_context,
    get_injury,
    get_injury_suggestions,
    list_injuries,
    update_injury,
)

router = APIRouter(prefix="/injuries", tags=["injuries"])


@router.get("")
def read_injuries(user_id: UUID = Depends(get_current_user_id)) -> list[dict]:
    return list_injuries(str(user_id))


@router.post("", status_code=status.HTTP_201_CREATED)
def create_injury_endpoint(
    payload: InjuryCreate,
    user_id: UUID = Depends(get_current_user_id),
) -> dict:
    return create_injury(str(user_id), payload.model_dump(exclude_none=True))


@router.get("/suggestions")
def read_suggestions(user_id: UUID = Depends(get_current_user_id)) -> list[dict]:
    return get_injury_suggestions(str(user_id))


@router.get("/acwr-context")
def read_acwr_context(
    reference_date: date = Query(..., description="Date de référence (YYYY-MM-DD)"),
    user_id: UUID = Depends(get_current_user_id),
) -> dict:
    return get_acwr_context(str(user_id), reference_date)


@router.get("/{injury_id}")
def read_injury(
    injury_id: str,
    user_id: UUID = Depends(get_current_user_id),
) -> dict:
    injury = get_injury(str(user_id), injury_id)
    if not injury:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blessure introuvable.")
    return injury


@router.patch("/{injury_id}")
def update_injury_endpoint(
    injury_id: str,
    payload: InjuryUpdate,
    user_id: UUID = Depends(get_current_user_id),
) -> dict:
    try:
        return update_injury(str(user_id), injury_id, payload.model_dump(exclude_none=True))
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/{injury_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_injury_endpoint(
    injury_id: str,
    user_id: UUID = Depends(get_current_user_id),
) -> None:
    delete_injury(str(user_id), injury_id)

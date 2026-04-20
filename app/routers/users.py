from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.db import get_session
from app.schemas.user import UserDisplayNameUpdate, UserRead
from app.services.auth_service import deactivate_user, get_user_by_id, update_user_display_name


router = APIRouter(prefix="/users", tags=["users"])


@router.get("/{user_id}", response_model=UserRead)
def read_user(user_id: int, session: Session = Depends(get_session)) -> UserRead:
    user = get_user_by_id(session=session, user_id=user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable.")
    return user


@router.patch("/{user_id}/display-name", response_model=UserRead)
def update_display_name(
    user_id: int,
    payload: UserDisplayNameUpdate,
    session: Session = Depends(get_session),
) -> UserRead:
    user = update_user_display_name(
        session=session,
        user_id=user_id,
        display_name=payload.display_name,
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable.")
    return user


@router.post("/{user_id}/deactivate", response_model=UserRead)
def deactivate_user_account(user_id: int, session: Session = Depends(get_session)) -> UserRead:
    user = deactivate_user(session=session, user_id=user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable.")
    return user

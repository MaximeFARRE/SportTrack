from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.db import get_session
from app.schemas.user import UserCreate, UserLogin, UserRead
from app.services.auth_service import authenticate_user, create_user


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register_user(
    payload: UserCreate,
    session: Session = Depends(get_session),
) -> UserRead:
    try:
        user = create_user(session=session, user_data=payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return user


@router.post("/login")
def login_user(
    payload: UserLogin,
    session: Session = Depends(get_session),
) -> dict:
    user = authenticate_user(session=session, email=payload.email, password=payload.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe invalide.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Utilisateur inactif.",
        )

    return {
        "message": "Connexion reussie.",
        "user": UserRead.model_validate(user).model_dump(),
    }


@router.get("/success")
def auth_success() -> dict:
    return {"message": "Service auth operationnel."}

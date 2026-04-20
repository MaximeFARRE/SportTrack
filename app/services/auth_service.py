import hashlib
from datetime import UTC, datetime
from typing import Optional

from sqlmodel import Session, select

from app.models.athlete import Athlete
from app.models.user import User
from app.schemas.user import UserCreate


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def verify_password(password: str, password_hash: str) -> bool:
    return hash_password(password) == password_hash


def get_user_by_email(session: Session, email: str) -> Optional[User]:
    normalized_email = email.strip().lower()
    statement = select(User).where(User.email == normalized_email)
    return session.exec(statement).first()


def create_user(session: Session, user_data: UserCreate) -> User:
    normalized_email = user_data.email.strip().lower()
    display_name = user_data.display_name.strip()

    existing_user = get_user_by_email(session=session, email=normalized_email)
    if existing_user:
        raise ValueError("Un utilisateur avec cet email existe deja.")

    user = User(
        email=normalized_email,
        password_hash=hash_password(user_data.password),
        display_name=display_name,
        is_active=True,
    )

    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def authenticate_user(session: Session, email: str, password: str) -> Optional[User]:
    user = get_user_by_email(session=session, email=email)
    if not user:
        return None

    if not verify_password(password=password, password_hash=user.password_hash):
        return None

    return user


def get_user_by_id(session: Session, user_id: int) -> Optional[User]:
    return session.get(User, user_id)


def update_user_display_name(session: Session, user_id: int, display_name: str) -> Optional[User]:
    user = get_user_by_id(session=session, user_id=user_id)
    if not user:
        return None

    user.display_name = display_name.strip()
    user.updated_at = datetime.now(UTC)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def get_or_create_user_for_strava(
    session: Session,
    strava_athlete_id: str,
    firstname: str | None,
    lastname: str | None,
) -> User:
    existing_athlete = session.exec(
        select(Athlete)
        .where(Athlete.provider == "strava")
        .where(Athlete.provider_athlete_id == strava_athlete_id)
    ).first()

    if existing_athlete:
        user = get_user_by_id(session=session, user_id=existing_athlete.user_id)
        if user:
            return user

    synthetic_email = f"strava_{strava_athlete_id}@sporttrack.local"
    display_name = f"{firstname or ''} {lastname or ''}".strip() or f"Strava #{strava_athlete_id}"

    existing_by_email = get_user_by_email(session=session, email=synthetic_email)
    if existing_by_email:
        return existing_by_email

    user = User(
        email=synthetic_email,
        password_hash="__strava_auth__",
        display_name=display_name,
        is_active=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def deactivate_user(session: Session, user_id: int) -> Optional[User]:
    user = get_user_by_id(session=session, user_id=user_id)
    if not user:
        return None

    user.is_active = False
    user.updated_at = datetime.now(UTC)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user

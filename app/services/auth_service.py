import hashlib
from datetime import UTC, datetime
from typing import Optional

from sqlmodel import Session, select

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

from datetime import UTC, datetime
from typing import Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(UTC)


class Group(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    name: str = Field(index=True, max_length=120)
    description: Optional[str] = Field(default=None, max_length=500)

    owner_user_id: int = Field(foreign_key="user.id", index=True)
    is_active: bool = Field(default=True)

    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class GroupMember(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("group_id", "user_id", name="uq_group_member_group_user"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)

    group_id: int = Field(foreign_key="group.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)

    role: str = Field(default="member", max_length=20)
    is_active: bool = Field(default=True)
    joined_at: datetime = Field(default_factory=utc_now)

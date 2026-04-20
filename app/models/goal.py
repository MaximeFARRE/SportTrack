from datetime import UTC, date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(UTC)


class Goal(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    athlete_id: int = Field(foreign_key="athlete.id", index=True)
    name: str = Field(max_length=150)
    sport_type: str | None = Field(default=None, max_length=50)
    target_date: date | None = Field(default=None, index=True)
    target_distance_m: float | None = Field(default=None, ge=0)
    target_elevation_gain_m: float | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=1000)

    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

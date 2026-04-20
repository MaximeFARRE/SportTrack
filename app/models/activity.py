from datetime import UTC, datetime
from typing import Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(UTC)


class Activity(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("athlete_id", "provider_activity_id", name="uq_activity_athlete_provider_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)

    athlete_id: int = Field(foreign_key="athlete.id", index=True)

    provider_activity_id: Optional[str] = Field(default=None, index=True)

    name: str
    sport_type: str = Field(index=True)

    start_date: datetime = Field(index=True)
    timezone: Optional[str] = None

    duration_sec: int = 0
    moving_time_sec: int = 0

    distance_m: float = 0
    elevation_gain_m: float = 0

    average_speed: Optional[float] = None
    max_speed: Optional[float] = None

    average_heartrate: Optional[float] = None
    max_heartrate: Optional[float] = None

    average_cadence: Optional[float] = None
    average_power: Optional[float] = None

    calories: Optional[float] = None

    raw_data_json: Optional[str] = None

    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

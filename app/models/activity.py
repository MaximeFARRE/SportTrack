from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class Activity(SQLModel, table=True):
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

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
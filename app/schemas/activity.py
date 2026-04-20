from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ActivityCreate(BaseModel):
    athlete_id: int
    provider_activity_id: str | None = Field(default=None, max_length=120)
    name: str = Field(min_length=1, max_length=255)
    sport_type: str = Field(min_length=1, max_length=50)
    start_date: datetime
    timezone: str | None = Field(default=None, max_length=100)
    duration_sec: int = Field(default=0, ge=0)
    moving_time_sec: int = Field(default=0, ge=0)
    distance_m: float = Field(default=0, ge=0)
    elevation_gain_m: float = Field(default=0, ge=0)
    average_speed: float | None = Field(default=None, ge=0)
    max_speed: float | None = Field(default=None, ge=0)
    average_heartrate: float | None = Field(default=None, ge=0)
    max_heartrate: float | None = Field(default=None, ge=0)
    average_cadence: float | None = Field(default=None, ge=0)
    average_power: float | None = Field(default=None, ge=0)
    calories: float | None = Field(default=None, ge=0)
    raw_data_json: str | None = None


class ActivityRead(BaseModel):
    id: int
    athlete_id: int
    provider_activity_id: str | None
    name: str
    sport_type: str
    start_date: datetime
    timezone: str | None
    duration_sec: int
    moving_time_sec: int
    distance_m: float
    elevation_gain_m: float
    average_speed: float | None
    max_speed: float | None
    average_heartrate: float | None
    max_heartrate: float | None
    average_cadence: float | None
    average_power: float | None
    calories: float | None
    raw_data_json: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class GoalCreate(BaseModel):
    athlete_id: int
    name: str = Field(min_length=1, max_length=150)
    sport_type: str | None = Field(default=None, max_length=50)
    target_date: date | None = None
    target_distance_m: float | None = Field(default=None, ge=0)
    target_elevation_gain_m: float | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=1000)


class GoalUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    sport_type: str | None = Field(default=None, max_length=50)
    target_date: date | None = None
    target_distance_m: float | None = Field(default=None, ge=0)
    target_elevation_gain_m: float | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=1000)
    is_active: bool | None = None


class GoalRead(BaseModel):
    id: int
    athlete_id: int
    name: str
    sport_type: str | None
    target_date: date | None
    target_distance_m: float | None
    target_elevation_gain_m: float | None
    notes: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    owner_user_id: int


class GroupRead(BaseModel):
    id: int
    name: str
    description: str | None
    owner_user_id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GroupMemberCreate(BaseModel):
    group_id: int
    user_id: int
    role: str = Field(default="member", min_length=1, max_length=20)


class GroupMemberRead(BaseModel):
    id: int
    group_id: int
    user_id: int
    role: str
    is_active: bool
    joined_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GroupComparisonMemberRead(BaseModel):
    user_id: int
    athlete_count: int
    sessions_count: int
    duration_sec: int
    distance_m: float
    elevation_gain_m: float
    training_load: float


class GroupComparisonRead(BaseModel):
    group_id: int
    start_date: date | None
    end_date: date | None
    members: list[GroupComparisonMemberRead]

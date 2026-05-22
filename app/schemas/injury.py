from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

InjuryType = Literal["muscular", "tendinous", "bone", "ligament", "other"]


class InjuryCreate(BaseModel):
    body_zone: str = Field(min_length=1, max_length=100)
    injury_type: InjuryType | None = None
    severity: int | None = Field(default=None, ge=1, le=3)
    start_date: date
    end_date: date | None = None
    description: str | None = Field(default=None, max_length=2000)
    treatment: str | None = Field(default=None, max_length=2000)
    related_activity_id: str | None = None


class InjuryUpdate(BaseModel):
    body_zone: str | None = Field(default=None, min_length=1, max_length=100)
    injury_type: InjuryType | None = None
    severity: int | None = Field(default=None, ge=1, le=3)
    start_date: date | None = None
    end_date: date | None = None
    description: str | None = Field(default=None, max_length=2000)
    treatment: str | None = Field(default=None, max_length=2000)
    related_activity_id: str | None = None


class InjuryRead(BaseModel):
    id: str
    user_id: str
    body_zone: str
    injury_type: str | None
    severity: int | None
    start_date: date
    end_date: date | None
    description: str | None
    treatment: str | None
    related_activity_id: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

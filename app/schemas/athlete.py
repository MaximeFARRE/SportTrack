from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AthleteRead(BaseModel):
    id: int
    user_id: int
    provider: str
    provider_athlete_id: str | None
    firstname: str | None
    lastname: str | None
    profile_picture: str | None
    token_expires_at: int | None
    last_sync_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StravaConnectResponse(BaseModel):
    authorization_url: str


class StravaCallbackResponse(BaseModel):
    message: str
    athlete: AthleteRead

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class Athlete(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    user_id: int = Field(foreign_key="user.id", index=True)

    provider: str = Field(default="strava")
    provider_athlete_id: Optional[str] = Field(default=None, index=True)

    firstname: Optional[str] = None
    lastname: Optional[str] = None
    profile_picture: Optional[str] = None

    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    token_expires_at: Optional[int] = None

    last_sync_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
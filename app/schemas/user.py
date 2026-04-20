from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserCreate(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=255)
    display_name: str = Field(min_length=1, max_length=100)


class UserRead(BaseModel):
    id: int
    email: str
    display_name: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserLogin(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=255)


class UserDisplayNameUpdate(BaseModel):
    display_name: str = Field(min_length=1, max_length=100)

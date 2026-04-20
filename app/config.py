from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    app_name: str = "SportTrack"
    app_version: str = "0.1.0"
    debug: bool = True

    database_url: str = "sqlite:///./sporttrack.db"
    strava_client_id: str = ""
    strava_client_secret: str = ""
    strava_redirect_uri: str = "http://127.0.0.1:8000/athletes/strava/callback"
    strava_scope: str = "read,activity:read_all"
    streamlit_url: str = "http://localhost:8501"

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8"
    )


settings = Settings()

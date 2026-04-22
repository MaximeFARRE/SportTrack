import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass


def _get(key: str, default: str = "") -> str:
    try:
        import streamlit as st
        val = st.secrets.get(key)
        if val is not None:
            return str(val)
    except Exception:
        pass
    return os.getenv(key, default)


class _Settings:
    @property
    def app_name(self) -> str:
        return _get("APP_NAME", "SportTrack")

    @property
    def app_version(self) -> str:
        return _get("APP_VERSION", "0.1.0")

    @property
    def database_url(self) -> str:
        return _get("DATABASE_URL", "sqlite:///./sporttrack.db")

    @property
    def strava_client_id(self) -> str:
        return _get("STRAVA_CLIENT_ID", "")

    @property
    def strava_client_secret(self) -> str:
        return _get("STRAVA_CLIENT_SECRET", "")

    @property
    def strava_redirect_uri(self) -> str:
        return _get("STRAVA_REDIRECT_URI", "http://localhost:18501")

    @property
    def strava_scope(self) -> str:
        return _get("STRAVA_SCOPE", "read,activity:read_all")


settings = _Settings()

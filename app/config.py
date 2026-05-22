import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass


def _get(key: str, default: str = "") -> str:
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

    # ---------- Supabase ----------
    @property
    def supabase_url(self) -> str:
        return _get("SUPABASE_URL", "")

    @property
    def supabase_service_role_key(self) -> str:
        return _get("SUPABASE_SERVICE_ROLE_KEY", "")

    @property
    def supabase_jwt_secret(self) -> str:
        return _get("SUPABASE_JWT_SECRET", "")

    # ---------- Terra ----------
    @property
    def terra_dev_id(self) -> str:
        return _get("TERRA_DEV_ID", "")

    @property
    def terra_api_key(self) -> str:
        return _get("TERRA_API_KEY", "")

    @property
    def terra_webhook_secret(self) -> str:
        return _get("TERRA_WEBHOOK_SECRET", "")

    # ---------- Anthropic ----------
    @property
    def anthropic_api_key(self) -> str:
        return _get("ANTHROPIC_API_KEY", "")

    # ---------- Internal ----------
    @property
    def internal_secret(self) -> str:
        return _get("INTERNAL_SECRET", "")

    @property
    def encryption_key(self) -> str:
        return _get("ENCRYPTION_KEY", "")

    @property
    def web_base_url(self) -> str:
        return _get("WEB_BASE_URL", "http://localhost:3000")

    # ---------- Monitoring ----------
    @property
    def sentry_dsn(self) -> str:
        return _get("SENTRY_DSN", "")


settings = _Settings()

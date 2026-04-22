import logging
import os
import threading
from contextlib import contextmanager
from pathlib import Path
import tempfile

from sqlalchemy.exc import OperationalError
from sqlmodel import Session, SQLModel, create_engine

from app.models import (  # noqa: F401
    Activity,
    Athlete,
    DailyMetric,
    Goal,
    Group,
    GroupMember,
    User,
    WeeklyMetric,
)


TRANSIENT_DB_CONNECTION_ERROR_MARKERS = (
    "ssl connection has been closed unexpectedly",
    "server closed the connection unexpectedly",
    "connection not open",
    "connection was closed in the middle of operation",
    "terminating connection due to administrator command",
    "could not receive data from server",
    "connection reset by peer",
)

_ENGINE = None
_ENGINE_LOCK = threading.Lock()


def _is_sqlite_io_error(exc: OperationalError) -> bool:
    message = str(exc).lower()
    return (
        "disk i/o error" in message
        or "readonly database" in message
        or "unable to open database file" in message
    )


def _build_fallback_sqlite_url() -> str:
    base_dir = os.getenv("SPORTTRACK_DATA_DIR")
    if base_dir:
        root = Path(base_dir)
    else:
        root = Path(tempfile.gettempdir()) / "sporttrack"
    root.mkdir(parents=True, exist_ok=True)
    db_path = (root / "sporttrack.db").resolve()
    return f"sqlite:///{db_path.as_posix()}"


def _build_engine():
    from app.config import settings

    database_url = settings.database_url
    engine = create_engine(database_url, echo=False, pool_pre_ping=True, pool_recycle=1800)
    try:
        SQLModel.metadata.create_all(engine)
        return engine
    except OperationalError as exc:
        engine.dispose()
        if not (database_url.startswith("sqlite:///") and _is_sqlite_io_error(exc)):
            raise

        fallback_url = _build_fallback_sqlite_url()
        if fallback_url == database_url:
            raise

        logging.warning(
            "Primary SQLite database failed with I/O error (%s). Retrying with fallback: %s",
            exc,
            fallback_url,
        )
        fallback_engine = create_engine(fallback_url, echo=False, pool_pre_ping=True)
        SQLModel.metadata.create_all(fallback_engine)
        return fallback_engine


def _get_engine():
    global _ENGINE
    if _ENGINE is None:
        with _ENGINE_LOCK:
            if _ENGINE is None:
                _ENGINE = _build_engine()
    return _ENGINE


def create_db_and_tables() -> None:
    _get_engine()


def is_transient_db_connection_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(marker in message for marker in TRANSIENT_DB_CONNECTION_ERROR_MARKERS)


def recycle_db_engine() -> None:
    global _ENGINE
    with _ENGINE_LOCK:
        if _ENGINE is not None:
            try:
                _ENGINE.dispose()
            except Exception:
                pass
            _ENGINE = None


def get_session():
    """FastAPI dependency: yields a DB session, closes it on exit."""
    engine = _get_engine()
    with Session(engine) as session:
        yield session


def create_db_and_tables() -> None:
    _get_engine()


@contextmanager
def get_db():
    """Context manager for non-FastAPI callers (scripts, tests)."""
    engine = _get_engine()
    with Session(engine) as session:
        yield session

from contextlib import contextmanager
import logging
import os
from pathlib import Path
import tempfile

import streamlit as st
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


@st.cache_resource
def _get_engine():
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
            "Primary SQLite database failed with I/O error (%s). Retrying with fallback database: %s",
            exc,
            fallback_url,
        )
        fallback_engine = create_engine(fallback_url, echo=False, pool_pre_ping=True)
        SQLModel.metadata.create_all(fallback_engine)
        return fallback_engine


def is_transient_db_connection_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(marker in message for marker in TRANSIENT_DB_CONNECTION_ERROR_MARKERS)


def recycle_db_engine() -> None:
    try:
        _get_engine().dispose()
    except Exception:
        pass

    clear_fn = getattr(_get_engine, "clear", None)
    if callable(clear_fn):
        try:
            clear_fn()
        except Exception:
            pass


@contextmanager
def get_db():
    engine = _get_engine()
    with Session(engine) as session:
        yield session

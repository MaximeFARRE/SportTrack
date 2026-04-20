from contextlib import contextmanager

import streamlit as st
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


@st.cache_resource
def _get_engine():
    from app.config import settings
    engine = create_engine(settings.database_url, echo=False)
    SQLModel.metadata.create_all(engine)
    return engine


@contextmanager
def get_db():
    engine = _get_engine()
    with Session(engine) as session:
        yield session

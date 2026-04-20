from sqlmodel import SQLModel, Session, create_engine

from app.config import settings

# Important :
# on importe les modèles pour que SQLModel les connaisse
from app.models import User, Athlete, Activity  # noqa: F401


engine = create_engine(
    settings.database_url,
    echo=False
)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
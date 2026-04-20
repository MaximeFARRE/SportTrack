from fastapi import FastAPI

from app.config import settings
from app.db import create_db_and_tables


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version
)


@app.on_event("startup")
def on_startup() -> None:
    create_db_and_tables()


@app.get("/")
def read_root() -> dict:
    return {
        "message": "Bienvenue sur SportTrack",
        "version": settings.app_version
    }


@app.get("/health")
def health_check() -> dict:
    return {
        "status": "ok"
    }
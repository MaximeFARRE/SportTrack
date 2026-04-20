from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import settings
from app.db import create_db_and_tables
from app.routers.activities import router as activities_router
from app.routers.athletes import router as athletes_router
from app.routers.auth import router as auth_router
from app.routers.goals import router as goals_router
from app.routers.groups import router as groups_router
from app.routers.metrics import router as metrics_router
from app.routers.sync import router as sync_router
from app.routers.users import router as users_router


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    create_db_and_tables()
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(athletes_router)
app.include_router(activities_router)
app.include_router(sync_router)
app.include_router(metrics_router)
app.include_router(groups_router)
app.include_router(goals_router)


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

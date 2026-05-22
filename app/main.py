from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import create_db_and_tables
from app.routers.me import router as me_router
from app.routers.risk import router as risk_router
from app.routers.strava import internal_router as strava_internal_router
from app.routers.strava import router as strava_router
from app.routers.terra import internal_router as terra_internal_router
from app.routers.terra import router as terra_router
from app.routers.zones import internal_router as zones_internal_router
from app.routers.zones import router as zones_router
from app.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    create_db_and_tables()
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_base_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(me_router)
app.include_router(risk_router)
app.include_router(zones_router)
app.include_router(zones_internal_router)
app.include_router(strava_router)
app.include_router(strava_internal_router)
app.include_router(terra_router)
app.include_router(terra_internal_router)


@app.get("/")
def read_root() -> dict:
    return {
        "message": "Welcome to SportTrack",
        "version": settings.app_version
    }


@app.get("/health")
def health_check() -> dict:
    return {
        "status": "ok"
    }

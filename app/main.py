import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sentry_sdk.integrations.fastapi import FastApiIntegration

from app.config import settings

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        integrations=[FastApiIntegration()],
        traces_sample_rate=0.2,
        send_default_pii=False,
    )
from app.routers.export import router as export_router
from app.routers.injuries import router as injuries_router
from app.routers.me import router as me_router
from app.routers.risk import router as risk_router
from app.routers.strava import internal_router as strava_internal_router
from app.routers.strava import router as strava_router
from app.routers.terra import internal_router as terra_internal_router
from app.routers.terra import router as terra_router
from app.routers.zones import internal_router as zones_internal_router
from app.routers.zones import router as zones_router


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    root_path="/api/py",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_base_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(me_router)
app.include_router(export_router)
app.include_router(injuries_router)
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

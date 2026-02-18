from fastapi import APIRouter
from app.api.endpoints import satellites, positions, ingestion, ground_station, conjunctions, stats, reentry, analytics, auth, launches, space_weather

api_router = APIRouter()

api_router.include_router(satellites.router, prefix="/satellites", tags=["satellites"])
api_router.include_router(positions.router, prefix="/positions", tags=["positions"])
api_router.include_router(ingestion.router, prefix="/ingest", tags=["ingestion"])
api_router.include_router(ground_station.router, prefix="/ground-station", tags=["ground-station"])
api_router.include_router(conjunctions.router, prefix="/conjunctions", tags=["conjunctions"])
api_router.include_router(stats.router, prefix="/stats", tags=["stats"])
api_router.include_router(reentry.router, prefix="/reentry", tags=["reentry"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(launches.router, prefix="/launches", tags=["launches"])
api_router.include_router(space_weather.router, prefix="/space-weather", tags=["space-weather"])



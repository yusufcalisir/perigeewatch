from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.services.ground_station import (
    get_visible_now,
    get_next_passes,
    STATION,
    MIN_ELEVATION_DEG,
)
from datetime import datetime
from typing import Optional

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/info")
def station_info():
    """Return ground station metadata."""
    return {
        "name": STATION["name"],
        "latitude": STATION["lat_deg"],
        "longitude": STATION["lon_deg"],
        "altitude_m": STATION["alt_m"],
        "min_elevation_deg": MIN_ELEVATION_DEG,
    }


@router.get("/visibility/current")
def visibility_current(
    timestamp: Optional[datetime] = None,
    db: Session = Depends(get_db),
):
    """
    Return satellites currently visible from the ground station.
    Each entry includes norad_id, name, azimuth, elevation, range_km.
    """
    if timestamp is None:
        timestamp = datetime.utcnow()

    visible = get_visible_now(db, timestamp)
    return {
        "station": STATION["name"],
        "timestamp": timestamp.isoformat() + "Z",
        "count": len(visible),
        "satellites": visible,
    }


@router.get("/passes/next")
def passes_next(
    timestamp: Optional[datetime] = None,
    hours: float = Query(default=24.0, le=72.0, ge=1.0),
    db: Session = Depends(get_db),
):
    """
    Predict upcoming satellite passes within a time window.
    Each pass: norad_id, name, aos, los, duration_s, max_elevation, max_el_time.
    """
    if timestamp is None:
        timestamp = datetime.utcnow()

    passes = get_next_passes(db, timestamp, hours=hours)
    return {
        "station": STATION["name"],
        "window_start": timestamp.isoformat() + "Z",
        "window_hours": hours,
        "count": len(passes),
        "passes": passes,
    }

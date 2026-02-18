from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.satellite import Satellite, ObjectType
from typing import List, Optional
from pydantic import BaseModel
from app.models.tle import TLE
from datetime import datetime, timedelta
from app.services.propagation import get_satellite_trajectory

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class SatelliteOut(BaseModel):
    norad_id: int
    name: str
    int_designator: Optional[str] = None
    object_type: ObjectType
    is_active: bool
    owner: Optional[str] = None
    country_code: Optional[str] = None
    launch_date: Optional[object] = None # Date or datetime
    launch_site: Optional[str] = None
    purpose: Optional[str] = None
    orbit_class: Optional[str] = None
    
    class Config:
        from_attributes = True # updated for pydantic v2 if applicable, otherwise orm_mode=True

@router.get("/", response_model=List[SatelliteOut])
def read_satellites(
    skip: int = 0, 
    limit: int = 100, 
    q: Optional[str] = None,
    active_only: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Satellite)
    
    # Only filter by is_active if explicitly requested
    if active_only is not None:
        query = query.filter(Satellite.is_active == active_only)
    
    if q:
        # Simple case-insensitive search on name or exact match on NORAD ID
        if q.isdigit():
            # If query is a number, try to match norad_id or name
            query = query.filter(
                (Satellite.name.ilike(f"%{q}%")) | 
                (Satellite.norad_id == int(q))
            )
        else:
            query = query.filter(Satellite.name.ilike(f"%{q}%"))
            
    satellites = query.order_by(Satellite.id).offset(skip).limit(limit).all()
    return satellites




@router.get("/tles")
def read_all_tles(limit: int = 5000, db: Session = Depends(get_db)):
    """
    Bulk TLE export for WebWorker SGP4 propagation.
    Returns [{norad_id, name, line1, line2}] for all active satellites.
    """


    # Optimized query using DISTINCT ON (PostgreSQL specific)
    # This avoids the expensive subquery aggregation
    results = (
        db.query(Satellite.norad_id, Satellite.name, Satellite.object_type, TLE.line1, TLE.line2)
        .join(TLE, TLE.satellite_id == Satellite.id)
        .distinct(Satellite.id)
        .order_by(Satellite.id, TLE.epoch.desc())
        .filter(Satellite.is_active)
        .limit(limit)
        .all()
    )

    return [
        {
            "norad_id": r.norad_id,
            "name": r.name,
            "object_type": r.object_type.value if hasattr(r.object_type, 'value') else str(r.object_type),
            "line1": r.line1,
            "line2": r.line2,
        }
        for r in results
    ]


@router.get("/{norad_id}", response_model=SatelliteOut)
def read_satellite(norad_id: int, db: Session = Depends(get_db)):
    try:
        satellite = db.query(Satellite).filter(Satellite.norad_id == norad_id).first()
        if satellite is None:
            raise HTTPException(status_code=404, detail="Satellite not found")
        return satellite
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

class TLEOut(BaseModel):
    line1: str
    line2: str
    epoch: datetime
    source: str
    fetched_at: datetime
    
    class Config:
        from_attributes = True

@router.get("/{norad_id}/tle", response_model=TLEOut)
def read_satellite_tle(norad_id: int, db: Session = Depends(get_db)):
    # Get satellite first to get ID
    satellite = db.query(Satellite).filter(Satellite.norad_id == norad_id).first()
    if satellite is None:
        raise HTTPException(status_code=404, detail="Satellite not found")
        
    tle = db.query(TLE).filter(TLE.satellite_id == satellite.id).order_by(TLE.epoch.desc()).first()
    if tle is None:
        raise HTTPException(status_code=404, detail="TLE not found")
    return tle



@router.get("/{norad_id}/orbit")
def get_satellite_orbit(
    norad_id: int, 
    minutes: int = 90, 
    past_minutes: int = 0,
    step: int = 60, 
    db: Session = Depends(get_db)
):
    """
    Get predicted orbit path.
    - minutes: Duration to propagate into the FUTURE (default 90).
    - past_minutes: Duration to propagate into the PAST (default 0).
    Total duration = past_minutes + minutes.
    """
    # Get satellite and TLE
    satellite = db.query(Satellite).filter(Satellite.norad_id == norad_id).first()
    if not satellite:
        raise HTTPException(status_code=404, detail="Satellite not found")
        
    tle = db.query(TLE).filter(TLE.satellite_id == satellite.id).order_by(TLE.epoch.desc()).first()
    if not tle:
        raise HTTPException(status_code=404, detail="TLE not found")
        
    now = datetime.utcnow()
    start_time = now - timedelta(minutes=past_minutes)
    end_time = now + timedelta(minutes=minutes)
    
    trajectory = get_satellite_trajectory(tle.line1, tle.line2, start_time, end_time, step)
    return trajectory


@router.get("/{norad_id}/access-intervals")
def get_access_intervals(
    norad_id: int,
    hours: float = 24.0,
    db: Session = Depends(get_db),
):
    """
    Calculate visibility windows (Access Intervals) between a satellite
    and the ground station over the next N hours.

    Returns list of {start, end, duration_s, max_elevation, max_el_time}.
    """
    from app.services.ground_station import predict_passes_for_sat, STATION

    satellite = db.query(Satellite).filter(Satellite.norad_id == norad_id).first()
    if not satellite:
        raise HTTPException(status_code=404, detail="Satellite not found")

    tle = db.query(TLE).filter(TLE.satellite_id == satellite.id).order_by(TLE.epoch.desc()).first()
    if not tle:
        raise HTTPException(status_code=404, detail="TLE not found")

    from sgp4.api import Satrec, WGS72
    satrec = Satrec.twoline2rv(tle.line1, tle.line2, WGS72)

    now = datetime.utcnow()
    passes = predict_passes_for_sat(satrec, now, hours=hours)

    return {
        "norad_id": norad_id,
        "satellite_name": satellite.name,
        "station": STATION["name"],
        "window_start": now.isoformat() + "Z",
        "window_hours": hours,
        "intervals": passes,
        "count": len(passes),
    }


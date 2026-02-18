from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.satellite import Satellite
from app.models.tle import TLE
from app.services.propagation import get_position_at, propagate_batch
from datetime import datetime
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class PositionOut(BaseModel):
    lat: float
    lon: float
    alt: float
    velocity: float
    timestamp: datetime
    sat_id: Optional[int] = None
    norad_id: Optional[int] = None
    pos_eci: Optional[List[float]] = None
    vel_eci: Optional[List[float]] = None
    error: Optional[str] = None

@router.get("/all", response_model=List[PositionOut])
def propagate_all_sats(
    timestamp: Optional[datetime] = None,
    limit: int = 1000,
    db: Session = Depends(get_db)
):
    """
    Get positions for all tracked satellites.
    WARNING: Heavy operation if thousands of satellites.
    Use limit to paginate or restrict.
    """
    if timestamp is None:
        timestamp = datetime.utcnow()
        
    from sqlalchemy import func
    
    subquery = db.query(
        TLE.satellite_id,
        func.max(TLE.epoch).label('max_epoch')
    ).group_by(TLE.satellite_id).subquery()
    
    tles = db.query(TLE).join(
        subquery,
        (TLE.satellite_id == subquery.c.satellite_id) & 
        (TLE.epoch == subquery.c.max_epoch)
    ).limit(limit).all()
    
    if not tles:
        return []
        
    sat_ids = [t.satellite_id for t in tles]
    sats = db.query(Satellite.id, Satellite.norad_id).filter(Satellite.id.in_(sat_ids)).all()
    id_map = {s.id: s.norad_id for s in sats}
    
    results = propagate_batch(tles, timestamp)
    
    final_results = []
    for res in results:
        res["timestamp"] = timestamp
        res["norad_id"] = id_map.get(res["sat_id"])
        final_results.append(res)
        
    return final_results

@router.get("/{norad_id}", response_model=PositionOut)
def propagate_single(
    norad_id: int, 
    timestamp: Optional[datetime] = None, 
    db: Session = Depends(get_db)
):
    """
    Get current or future position of a satellite.
    """
    if timestamp is None:
        timestamp = datetime.utcnow()
        
    sat = db.query(Satellite).filter(Satellite.norad_id == norad_id).first()
    if not sat:
        raise HTTPException(status_code=404, detail="Satellite not found")
        
    tle = db.query(TLE).filter(TLE.satellite_id == sat.id).order_by(TLE.epoch.desc()).first()
    
    if not tle:
        raise HTTPException(status_code=404, detail="No TLE data found for satellite")
        
    result = get_position_at(tle.line1, tle.line2, timestamp)
    
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
        
    result["norad_id"] = norad_id
    result["sat_id"] = sat.id
    return result


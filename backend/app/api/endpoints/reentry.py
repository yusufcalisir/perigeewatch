from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.session import SessionLocal
from app.models.satellite import Satellite
from app.models.tle import TLE
from app.services.reentry import estimate_orbital_lifetime, get_reentry_candidates

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/{norad_id}")
def get_reentry_prediction(norad_id: int, db: Session = Depends(get_db)):
    """
    Get reentry prediction for a single satellite.
    Uses real TLE data and simplified atmospheric decay model.
    """
    satellite = db.query(Satellite).filter(Satellite.norad_id == norad_id).first()
    if not satellite:
        raise HTTPException(status_code=404, detail="Satellite not found")

    tle = db.query(TLE).filter(TLE.satellite_id == satellite.id).order_by(TLE.epoch.desc()).first()
    if not tle:
        raise HTTPException(status_code=404, detail="TLE not found")

    result = estimate_orbital_lifetime(tle.line1, tle.line2)
    return {
        "norad_id": norad_id,
        "name": satellite.name,
        **result,
    }


@router.get("/candidates/scan")
def get_reentry_candidates_endpoint(
    max_perigee_km: float = Query(400, description="Max perigee altitude to consider"),
    limit: int = Query(20, description="Max results"),
    db: Session = Depends(get_db),
):
    """
    Scan catalog for satellites at risk of reentry.
    Returns real predictions based on TLE orbital decay analysis.
    """
    # Get latest TLEs for all satellites
    latest_tle = (
        db.query(TLE.satellite_id, func.max(TLE.epoch).label("max_epoch"))
        .group_by(TLE.satellite_id)
        .subquery()
    )

    results = (
        db.query(Satellite.norad_id, Satellite.name, TLE.line1, TLE.line2)
        .join(TLE, TLE.satellite_id == Satellite.id)
        .join(
            latest_tle,
            (TLE.satellite_id == latest_tle.c.satellite_id)
            & (TLE.epoch == latest_tle.c.max_epoch),
        )
        .filter(Satellite.is_active)
        .all()
    )

    tles = [
        {"norad_id": r.norad_id, "name": r.name, "line1": r.line1, "line2": r.line2}
        for r in results
    ]

    candidates = get_reentry_candidates(tles, max_perigee_km, limit)
    return {
        "count": len(candidates),
        "max_perigee_km": max_perigee_km,
        "candidates": candidates,
    }

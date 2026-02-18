from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.session import SessionLocal
from app.models.satellite import Satellite, ObjectType
from app.models.tle import TLE

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/overview")
def get_overview_stats(db: Session = Depends(get_db)):
    """
    Returns real-time statistics about the satellite catalog.
    All values are computed from actual database records.
    """
    total = db.query(func.count(Satellite.id)).scalar() or 0
    active = db.query(func.count(Satellite.id)).filter(Satellite.is_active).scalar() or 0

    payload_count = db.query(func.count(Satellite.id)).filter(
        Satellite.object_type == ObjectType.PAYLOAD
    ).scalar() or 0

    rocket_body_count = db.query(func.count(Satellite.id)).filter(
        Satellite.object_type == ObjectType.ROCKET_BODY
    ).scalar() or 0

    debris_count = db.query(func.count(Satellite.id)).filter(
        Satellite.object_type == ObjectType.DEBRIS
    ).scalar() or 0

    tle_count = db.query(func.count(TLE.id)).scalar() or 0

    return {
        "total_satellites": total,
        "active_satellites": active,
        "payload_count": payload_count,
        "rocket_body_count": rocket_body_count,
        "debris_count": debris_count,
        "total_tles": tle_count,
        "inactive_count": total - active,
    }

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.services.conjunction import detect_conjunctions
from datetime import datetime
from typing import Optional, List, Any

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/")
def get_conjunctions(
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    threshold_km: float = Query(default=50.0, ge=0.1, le=1000.0),
    limit: int = Query(default=500, ge=1, le=5000),
    db: Session = Depends(get_db),
) -> List[Any]:
    """
    Detect close approaches between satellites.

    - **start_time**: Timestamp to analyze (defaults to now)
    - **threshold_km**: Maximum distance to consider a conjunction (km)
    - **limit**: Max number of satellites to include in analysis
    """
    timestamp = start_time if start_time else datetime.utcnow()

    events = detect_conjunctions(
        db=db,
        timestamp=timestamp,
        threshold_km=threshold_km,
        limit=limit,
    )

    return events

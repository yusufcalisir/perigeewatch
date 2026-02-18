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


import redis
import json
from app.core.config import settings

# Initialize Redis client
redis_client = redis.Redis(
    host=settings.REDIS_HOST, 
    port=settings.REDIS_PORT, 
    db=0, 
    decode_responses=True,
    socket_connect_timeout=1
)

@router.get("/")
def get_conjunctions(
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    threshold_km: float = Query(default=50.0, ge=0.1, le=1000.0),
    limit: int = Query(default=500, ge=1, le=5000),
    db: Session = Depends(get_db),
) -> List[Any]:
    """
    Detect close approaches between satellites.
    Results are cached in Redis for 5 minutes.
    """
    timestamp = start_time if start_time else datetime.utcnow()
    
    # ── Redis Cache Check ──
    cache_key = f"conjunctions:{timestamp.strftime('%Y%m%d%H%M')}:{threshold_km}:{limit}"
    try:
        cached_data = redis_client.get(cache_key)
        if cached_data:
            return json.loads(cached_data)
    except Exception as e:
        print(f"Redis cache error: {e}")

    # ── Compute ──
    events = detect_conjunctions(
        db=db,
        timestamp=timestamp,
        threshold_km=threshold_km,
        limit=limit,
    )

    # ── Redis Cache Set ──
    try:
        redis_client.setex(cache_key, 300, json.dumps(events)) # 300s = 5m
    except Exception as e:
        print(f"Redis cache set error: {e}")

    return events

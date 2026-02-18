"""
Celery worker for background tasks.
Tasks: TLE ingestion, position propagation, conjunction analysis.
"""
import logging
from celery import Celery
from datetime import datetime
from app.core.config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "perigeewatch",
    broker=f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/0",
    backend=f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/1",
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    # timezone="UTC", # Commented out to use system local time
    enable_utc=False, # Disabled to prevent drift on Windows local dev (UTC+3 vs UTC)
)

@celery_app.on_after_configure.connect
def setup_periodic_tasks(sender, **kwargs):
    # Run ingestion every hour
    sender.add_periodic_task(
        settings.INGEST_INTERVAL_MINUTES * 60.0, 
        ingest_tles_task.s(), 
        name='Ingest TLEs every hour'
    )
    
    # Run conjunction analysis every 15 minutes
    sender.add_periodic_task(
        15.0 * 60.0, 
        detect_conjunctions_task.s(), 
        name='Detect Conjunctions every 15 mins'
    )

@celery_app.task(name="detect_conjunctions")
def detect_conjunctions_task(threshold_km: float = 50.0):
    """Run conjunction analysis for all satellites."""
    from app.db.session import SessionLocal
    from app.services.conjunction import detect_conjunctions
    
    db = SessionLocal()
    try:
        # Default to 50km threshold for background checks
        events = detect_conjunctions(db, threshold_km=threshold_km)
        
        # Persist events to database for historical analysis
        from app.models.conjunction_event import ConjunctionEvent
        saved_count = 0
        for event in events:
            # Parse ISO string back to datetime
            event_dt = datetime.fromisoformat(event["timestamp"])
            
            db_event = ConjunctionEvent(
                sat1_norad=event["sat1_norad"],
                sat1_name=event["sat1_name"],
                sat2_norad=event["sat2_norad"],
                sat2_name=event["sat2_name"],
                distance_km=event["distance"],
                risk_level=event["risk_level"],
                event_time=event_dt,
                sat1_lat=event["sat1_position"]["y"],
                sat1_lon=event["sat1_position"]["x"],
                sat1_alt=event["sat1_position"]["z"],
                sat2_lat=event["sat2_position"]["y"],
                sat2_lon=event["sat2_position"]["x"],
                sat2_alt=event["sat2_position"]["z"],
            )
            db.add(db_event)
            saved_count += 1
            
        db.commit()
        logger.info(f"Conjunction analysis complete. Found {len(events)} events. Saved {saved_count} to history.")
        return {"events_found": len(events), "events_saved": saved_count}
    except Exception as e:
        logger.error(f"Conjunction analysis failed: {e}")
        raise
    finally:
        db.close()

@celery_app.task(name="ingest_tles")
def ingest_tles_task():
    """Fetch and store TLEs from CelesTrak."""
    from app.db.session import SessionLocal
    from app.services.ingestion import fetch_and_store_tles

    db = SessionLocal()
    try:
        count = fetch_and_store_tles(db)
        logger.info(f"Ingested {count} new TLEs via Celery task.")
        return {"new_tles": count}
    except Exception as e:
        logger.error(f"Ingestion task failed: {e}")
        raise
    finally:
        db.close()


@celery_app.task(name="update_positions")
def update_positions_task():
    """Propagate positions for all tracked satellites."""
    from app.db.session import SessionLocal
    from app.models.tle import TLE
    from app.services.propagation import propagate_batch
    from sqlalchemy import func
    from datetime import datetime

    db = SessionLocal()
    try:
        subquery = db.query(
            TLE.satellite_id,
            func.max(TLE.epoch).label("max_epoch")
        ).group_by(TLE.satellite_id).subquery()

        tles = db.query(TLE).join(
            subquery,
            (TLE.satellite_id == subquery.c.satellite_id) &
            (TLE.epoch == subquery.c.max_epoch)
        ).all()

        results = propagate_batch(tles, datetime.utcnow())
        logger.info(f"Propagated positions for {len(results)} satellites.")
        return {"propagated": len(results)}
    except Exception as e:
        logger.error(f"Propagation task failed: {e}")
        raise
    finally:
        db.close()

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.services.ingestion import fetch_and_store_tles
from typing import Any

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/tle")
def ingest_tle_async() -> Any:
    """
    Trigger TLE ingestion asynchronously via Celery worker.
    Requires Redis and Celery worker to be running.
    """
    try:
        from app.worker import ingest_tles_task
        task = ingest_tles_task.delay()
        return {"message": "Ingestion started", "task_id": task.id}
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Celery/Redis unavailable. Use /ingest/tle/sync instead. Error: {str(e)}"
        )


@router.post("/tle/sync")
def ingest_tle_sync(db: Session = Depends(get_db)) -> Any:
    """
    Trigger TLE ingestion synchronously (no Celery needed).
    Useful for local development and testing.
    WARNING: This may take 30-60 seconds for large catalogs.
    """
    try:
        count = fetch_and_store_tles(db)
        return {"message": "Ingestion complete", "new_tles": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

import asyncio
import os
import sys
import time
import logging
from datetime import datetime, timedelta

# Add the current directory to sys.path to ensure we can import 'app'
sys.path.append(os.getcwd())

from app.db.session import SessionLocal
from app.services.ingestion import fetch_and_store_tles
from app.services.propagation import propagate_batch
from app.models.tle import TLE
from sqlalchemy import func

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# Configuration
INGEST_INTERVAL_MINUTES = int(os.getenv("INGEST_INTERVAL_MINUTES", "60"))
PROPAGATION_INTERVAL_SECONDS = 600  # Run propagation every 10 minutes

def run_ingestion():
    """Fetches and stores TLEs."""
    logger.info("Starting TLE ingestion...")
    db = SessionLocal()
    try:
        count = fetch_and_store_tles(db)
        logger.info(f"Ingestion finished. New TLEs: {count}")
    except Exception as e:
        logger.error(f"Ingestion failed: {e}")
    finally:
        db.close()

def run_propagation():
    """Propagates satellite positions."""
    logger.info("Starting propagation...")
    db = SessionLocal()
    try:
        # Get latest TLE for each satellite
        subquery = db.query(
            TLE.satellite_id,
            func.max(TLE.epoch).label("max_epoch")
        ).group_by(TLE.satellite_id).subquery()

        tles = db.query(TLE).join(
            subquery,
            (TLE.satellite_id == subquery.c.satellite_id) &
            (TLE.epoch == subquery.c.max_epoch)
        ).all()

        if tles:
            results = propagate_batch(tles, datetime.utcnow())
            logger.info(f"Propagated positions for {len(results)} satellites.")
        else:
            logger.info("No TLEs found for propagation.")
            
    except Exception as e:
        logger.error(f"Propagation failed: {e}")
    finally:
        db.close()

def worker_loop():
    logger.info("Starting worker loop...")
    logger.info(f"Ingestion interval: {INGEST_INTERVAL_MINUTES} minutes")
    
    last_ingest_time = datetime.min
    last_propagation_time = datetime.min

    while True:
        now = datetime.utcnow()
        
        # Check ingestion
        if (now - last_ingest_time).total_seconds() / 60 >= INGEST_INTERVAL_MINUTES:
            run_ingestion()
            last_ingest_time = datetime.utcnow()
        
        # Check propagation
        if (now - last_propagation_time).total_seconds() >= PROPAGATION_INTERVAL_SECONDS:
            run_propagation()
            last_propagation_time = datetime.utcnow()
            
        # Sleep to prevent tight loop
        time.sleep(60)

if __name__ == "__main__":
    try:
        worker_loop()
    except KeyboardInterrupt:
        logger.info("Worker stopped by user.")
    except Exception as e:
        logger.critical(f"Worker crashed: {e}")
        sys.exit(1)

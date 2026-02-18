import sys
import os
sys.path.append(os.getcwd())

from app.db.session import SessionLocal
from app.services.ingestion import fetch_and_store_tles
import logging

logging.basicConfig(level=logging.INFO)

def run():
    print("Starting ingestion...")
    db = SessionLocal()
    try:
        count = fetch_and_store_tles(db)
        print(f"Ingestion finished. New TLEs: {count}")
    except Exception as e:
        print(f"Ingestion failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    run()

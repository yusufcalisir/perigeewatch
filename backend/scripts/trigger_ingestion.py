import sys
import os

# Set python path to include app
sys.path.append(os.getcwd())

from app.db.session import SessionLocal
from app.services.ingestion import fetch_and_store_tles
from app.models.satellite import Satellite

def test_ingestion():
    print("Starting ingestion test...")
    db = SessionLocal()
    try:
        count = fetch_and_store_tles(db)
        print(f"Ingested {count} new TLEs.")
        
        # Verify count
        sat_count = db.query(Satellite).count()
        print(f"Total Satellites in DB: {sat_count}")
        
    except Exception as e:
        print(f"Error during ingestion: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    test_ingestion()

import sys
import os
from datetime import datetime

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.db.session import SessionLocal
from app.models.satellite import Satellite
from app.models.tle import TLE
from app.models.conjunction_event import ConjunctionEvent

def verify_storage():
    db = SessionLocal()
    try:
        print("Verifying Database Storage...\n")

        # 1. Satellite Metadata
        sat_count = db.query(Satellite).count()
        print(f"[Satellite Metadata] Count: {sat_count}")
        if sat_count > 0:
            first_sat = db.query(Satellite).first()
            print(f"  Sample: {first_sat.name} (NORAD {first_sat.norad_id})")
            print("  [PASS] Satellites are stored.")
        else:
            print("  [WARN] No satellites found (run ingestion first).")

        # 2. Orbital Data (TLEs)
        tle_count = db.query(TLE).count()
        print(f"\n[Orbital Data] Count: {tle_count}")
        if tle_count > 0:
            first_tle = db.query(TLE).first()
            print(f"  Sample Epoch: {first_tle.epoch}")
            print("  [PASS] TLEs are stored.")
        else:
            print("  [WARN] No TLEs found.")

        # 3. Risk Events (History)
        # Try to insert a dummy event to prove capability
        print("\n[Risk Events] Testing persistence...")
        test_event = ConjunctionEvent(
            sat1_norad=12345,
            sat1_name="TEST_SAT_1",
            sat2_norad=67890,
            sat2_name="TEST_SAT_2",
            distance_km=0.123,
            risk_level="CRITICAL",
            event_time=datetime.utcnow(),
            sat1_lat=0.0, sat1_lon=0.0, sat1_alt=400.0,
            sat2_lat=0.1, sat2_lon=0.1, sat2_alt=400.1
        )
        db.add(test_event)
        db.commit()
        
        # Verify insertion
        stored_event = db.query(ConjunctionEvent).filter(ConjunctionEvent.sat1_name == "TEST_SAT_1").first()
        if stored_event:
            print(f"  [PASS] Successfully inserted and retrieved test event ID {stored_event.id}.")
            print(f"  Risk Level: {stored_event.risk_level}")
            
            # Clean up
            db.delete(stored_event)
            db.commit()
            print("  [PASS] Test event cleaned up.")
        else:
            print("  [FAIL] Could not retrieve inserted event.")

    except Exception as e:
        print(f"[ERROR] Verification failed: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    verify_storage()

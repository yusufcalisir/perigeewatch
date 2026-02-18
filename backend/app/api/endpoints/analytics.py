"""
Analytics API Endpoints

Provides REST endpoints for:
- Monte Carlo collision probability (PoC) 
- Anomaly detection (Z-score based)
- RK4 numerical propagation
- Satellite owner/operator profiles
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.tle import TLE
from app.models.satellite import Satellite
from app.services.monte_carlo import compute_collision_probability
from app.services.anomaly import detect_anomalies
from app.services.rk4_propagator import propagate_rk4
from app.services.owner_data import get_satellite_profile
from datetime import datetime
from typing import Optional

router = APIRouter()


@router.get("/poc/{sat1_norad}/{sat2_norad}")
def get_collision_probability(
    sat1_norad: int,
    sat2_norad: int,
    tca: Optional[str] = Query(None, description="Time of Closest Approach (ISO format)"),
    samples: int = Query(1000, ge=100, le=10000),
    db: Session = Depends(get_db),
):
    """
    Compute Monte Carlo collision probability between two satellites.
    
    Uses real TLE data and SGP4 propagation with Gaussian perturbations
    to estimate collision probability (PoC).
    """
    # Get latest TLEs
    tle1 = db.query(TLE).join(Satellite).filter(
        Satellite.norad_id == sat1_norad
    ).order_by(TLE.epoch.desc()).first()
    
    tle2 = db.query(TLE).join(Satellite).filter(
        Satellite.norad_id == sat2_norad
    ).order_by(TLE.epoch.desc()).first()
    
    if not tle1 or not tle2:
        raise HTTPException(404, f"TLE not found for NORAD IDs: {sat1_norad}, {sat2_norad}")
    
    tca_dt = datetime.fromisoformat(tca.replace("Z", "")) if tca else datetime.utcnow()
    
    result = compute_collision_probability(
        tle1.line1, tle1.line2,
        tle2.line1, tle2.line2,
        tca_dt,
        num_samples=samples,
    )
    
    return {
        "sat1_norad": sat1_norad,
        "sat2_norad": sat2_norad,
        "tca": tca_dt.isoformat() + "Z",
        **result,
    }


@router.get("/anomaly/{norad_id}")
def get_anomaly_analysis(
    norad_id: int,
    z_threshold: float = Query(3.0, ge=1.0, le=10.0),
    db: Session = Depends(get_db),
):
    """
    Run anomaly detection on a satellite's TLE history.
    
    Analyzes mean motion, eccentricity, and BSTAR changes
    using Z-score statistical analysis.
    """
    sat = db.query(Satellite).filter(Satellite.norad_id == norad_id).first()
    if not sat:
        raise HTTPException(404, f"Satellite not found: {norad_id}")
    
    tles = db.query(TLE).filter(
        TLE.satellite_id == sat.id
    ).order_by(TLE.epoch.desc()).limit(100).all()
    
    if len(tles) < 5:
        return {
            "norad_id": norad_id,
            "status": "insufficient_data",
            "message": f"Need at least 5 TLEs, found {len(tles)}",
        }
    
    tle_history = [
        {"line1": t.line1, "line2": t.line2, "epoch": t.epoch}
        for t in tles
    ]
    
    
    result = detect_anomalies(tle_history, z_threshold)
    return {"norad_id": norad_id, "name": sat.name, **result}


@router.get("/anomaly/ml/{norad_id}")
def get_ml_anomaly_analysis(
    norad_id: int,
    epochs: int = Query(50, ge=10, le=200),
    db: Session = Depends(get_db),
):
    """
    Run Deep Learning-based anomaly detection (LSTM Autoencoder).
    
    Trains a lightweight LSTM model on the satellite's recent history
    to detect complex pattern deviations not visible to statistical methods.
    """
    try:
        import importlib.util
        if importlib.util.find_spec("torch") is None:
            raise ImportError
    except ImportError:
        raise HTTPException(501, "PyTorch not installed on server.")

    from app.services.ml_anomaly import train_and_detect

    sat = db.query(Satellite).filter(Satellite.norad_id == norad_id).first()
    if not sat:
        raise HTTPException(404, f"Satellite not found: {norad_id}")
    
    # Fetch deeper history for ML (needs training data)
    tles = db.query(TLE).filter(
        TLE.satellite_id == sat.id
    ).order_by(TLE.epoch.asc()).all() # Train on chronological order
    
    if len(tles) < 20:
        return {
            "norad_id": norad_id,
            "status": "insufficient_data",
            "message": f"Need at least 20 TLEs for ML training, found {len(tles)}",
        }
    
    tle_history = [
        {"line1": t.line1, "line2": t.line2, "epoch": t.epoch}
        for t in tles
    ]
    
    result = train_and_detect(tle_history, epochs=epochs)
    return {"norad_id": norad_id, "name": sat.name, **result}


@router.get("/propagate/{norad_id}")
def get_rk4_propagation(
    norad_id: int,
    duration_min: float = Query(90, ge=1, le=1440),
    step_sec: float = Query(60, ge=10, le=300),
    db: Session = Depends(get_db),
):
    """
    Propagate satellite orbit using RK4 numerical integrator.
    
    Higher fidelity than SGP4 — includes J2 perturbation 
    and atmospheric drag model.
    """
    tle = db.query(TLE).join(Satellite).filter(
        Satellite.norad_id == norad_id
    ).order_by(TLE.epoch.desc()).first()
    
    if not tle:
        raise HTTPException(404, f"TLE not found for NORAD ID: {norad_id}")
    
    trajectory = propagate_rk4(
        tle.line1, tle.line2,
        start_time=datetime.utcnow(),
        duration_minutes=duration_min,
        step_seconds=step_sec,
    )
    
    return {
        "norad_id": norad_id,
        "propagator": "rk4_j2_drag",
        "duration_minutes": duration_min,
        "step_seconds": step_sec,
        "point_count": len(trajectory),
        "trajectory": trajectory,
    }


@router.get("/profile/{norad_id}")
def get_owner_profile(
    norad_id: int,
    db: Session = Depends(get_db),
):
    """
    Get full satellite profile with owner/operator metadata.
    """
    profile = get_satellite_profile(db, norad_id)
    if not profile:
        raise HTTPException(404, f"Satellite not found: {norad_id}")
    return profile


@router.get("/transponders/{norad_id}")
def get_transponders(
    norad_id: int,
    sync: bool = Query(False, description="Force sync with SatNOGS DB"),
    db: Session = Depends(get_db),
):
    """
    Get frequency/transponder data for a satellite.
    Default: Returns DB cached data.
    Sync=True: Fetches fresh data from SatNOGS DB.
    """
    sat = db.query(Satellite).filter(Satellite.norad_id == norad_id).first()
    if not sat:
        raise HTTPException(404, f"Satellite not found: {norad_id}")
    
    # Auto-sync if empty and no sync flag
    if not sat.transponders and not sync:
        from app.services.satnogs import SatNOGSClient
        client = SatNOGSClient()
        client.sync_transponders(db, norad_id)
        db.refresh(sat)
        
    if sync:
        from app.services.satnogs import SatNOGSClient
        client = SatNOGSClient()
        client.sync_transponders(db, norad_id)
        db.refresh(sat)
    
    return {
        "norad_id": norad_id,
        "name": sat.name,
        "transponders": [
            {
                "uplink_mhz": [t.uplink_low, t.uplink_high],
                "downlink_mhz": [t.downlink_low, t.downlink_high],
                "mode": t.mode,
                "baud": t.baud,
                "description": t.description,
                "fetched_at": t.fetched_at
            }
            for t in sat.transponders
        ]
    }

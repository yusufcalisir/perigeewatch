"""
Conjunction (Close Approach) Analysis Service.

Detects when two space objects approach within a configurable distance threshold.
Uses SGP4 propagation to compute positions and numpy for distance calculations.
"""
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func
import logging

from sgp4.api import Satrec, WGS72, jday
from app.models.tle import TLE
from app.models.satellite import Satellite
from app.services.propagation import gmst, teme_to_ecef, ecef_to_geodetic

logger = logging.getLogger(__name__)


def get_distance_at_time(sat1: Any, sat2: Any, dt: datetime) -> Tuple[float, np.ndarray, np.ndarray]:
    """
    Compute distance between two Satrec objects at a specific time.
    Returns: (distance_km, r1_eci, r2_eci)
    """
    jd, fr = jday(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second + dt.microsecond/1e6)
    
    e1, r1, v1 = sat1.sgp4(jd, fr)
    e2, r2, v2 = sat2.sgp4(jd, fr)
    
    if e1 != 0 or e2 != 0:
        return 999999.0, np.array([0,0,0]), np.array([0,0,0])
        
    r1_arr = np.array(r1)
    r2_arr = np.array(r2)
    dist = np.linalg.norm(r1_arr - r2_arr)
    return dist, r1_arr, r2_arr

def find_tca(
    sat1: Any, 
    sat2: Any, 
    center_time: datetime, 
    window_seconds: float = 900.0
) -> Tuple[datetime, float, np.ndarray, np.ndarray]:
    """
    Find Time of Closest Approach (TCA) using Golden Section Search.
    Assumes distance function is unimodal within the small window.
    """
    gr = (np.sqrt(5) + 1) / 2
    
    a = center_time - timedelta(seconds=window_seconds)
    b = center_time + timedelta(seconds=window_seconds)
    
    tol = 1e-1 # 0.1 second precision
    
    # c and d are intermediate points
    c = b - (b - a) / gr
    d = a + (b - a) / gr
    
    while (b - a).total_seconds() > tol:
        dist_c, _, _ = get_distance_at_time(sat1, sat2, c)
        dist_d, _, _ = get_distance_at_time(sat1, sat2, d)
        
        if dist_c < dist_d:
            b = d
            d = c
            c = b - (b - a) / gr
        else:
            a = c
            c = d
            d = a + (b - a) / gr
            
    # Final best guess is (b+a)/2
    tca = a + (b - a) / 2
    min_dist, r1, r2 = get_distance_at_time(sat1, sat2, tca)
    
    return tca, min_dist, r1, r2


def _propagate_all_at(
    tles: List[TLE],
    sat_info: Dict[int, Tuple[int, str]],  # sat_id -> (norad_id, name)
    dt: datetime,
) -> List[Dict[str, Any]]:
    """
    Propagate all TLEs to a single timestamp.
    Returns list of dicts with norad_id, name, ECI position (for distance calc),
    and geodetic position (for frontend display).
    """
    jd, fr = jday(
        dt.year, dt.month, dt.day,
        dt.hour, dt.minute,
        dt.second + dt.microsecond / 1e6,
    )
    gmst_angle = gmst(jd, fr)
    results = []

    for tle in tles:
        info = sat_info.get(tle.satellite_id)
        if not info:
            continue
        norad_id, name = info

        try:
            sat = Satrec.twoline2rv(tle.line1, tle.line2, WGS72)
            e, r, v = sat.sgp4(jd, fr)
            if e != 0:
                continue

            r_eci = np.array(r)  # km, TEME (≈ECI for distance)
            r_ecef = teme_to_ecef(r_eci, gmst_angle)
            lat, lon, alt = ecef_to_geodetic(r_ecef[0], r_ecef[1], r_ecef[2])

            results.append({
                "norad_id": norad_id,
                "name": name,
                "sat_id": tle.satellite_id,
                "sat_obj": sat,  # Needed for TCA refinement
                "eci": r_eci,    # for distance computation
                "lat": lat,
                "lon": lon,
                "alt": alt,
            })
        except Exception:
            continue

    return results


def detect_conjunctions(
    db: Session,
    timestamp: Optional[datetime] = None,
    threshold_km: float = 50.0,
    limit: int = 1000,
) -> List[Dict[str, Any]]:
    """
    Detect conjunctions (close approaches) between all tracked satellites.

    Algorithm:
    1. Get latest TLE for each satellite
    2. Propagate all to the given timestamp
    3. Compute pairwise distances using ECI coordinates
    4. Filter pairs within threshold

    Returns list of conjunction events sorted by distance (ascending).
    """
    if timestamp is None:
        timestamp = datetime.utcnow()

    # 1. Get latest TLEs
    subquery = (
        db.query(TLE.satellite_id, func.max(TLE.epoch).label("max_epoch"))
        .group_by(TLE.satellite_id)
        .subquery()
    )
    tles = (
        db.query(TLE)
        .join(
            subquery,
            (TLE.satellite_id == subquery.c.satellite_id)
            & (TLE.epoch == subquery.c.max_epoch),
        )
        .limit(limit)
        .all()
    )

    if not tles:
        return []

    # Build sat info map
    sat_ids = [t.satellite_id for t in tles]
    sats = db.query(Satellite.id, Satellite.norad_id, Satellite.name).filter(
        Satellite.id.in_(sat_ids)
    ).all()
    sat_info = {s.id: (s.norad_id, s.name) for s in sats}

    # 2. Propagate all
    positions = _propagate_all_at(tles, sat_info, timestamp)

    if len(positions) < 2:
        return []

    # 3. Compute pairwise distances using vectorised numpy
    n = len(positions)
    eci_matrix = np.array([p["eci"] for p in positions])  # shape (n, 3)

    # Use broadcasting: diff[i,j] = eci_matrix[i] - eci_matrix[j]
    # distances[i,j] = ||diff[i,j]||
    # Only compute upper triangle for efficiency
    conjunctions = []

    # For large N, a full pairwise matrix is O(n^2). We chunk/vectorize.
    # For N up to ~1000, this is manageable.
    for i in range(n):
        # Vectorised distance from satellite i to all satellites j > i
        if i + 1 >= n:
            break
        diffs = eci_matrix[i + 1:] - eci_matrix[i]  # shape (n-i-1, 3)
        distances = np.linalg.norm(diffs, axis=1)  # shape (n-i-1,)

        # Find close approaches
        close_mask = distances < threshold_km
        close_indices = np.where(close_mask)[0]

        for idx in close_indices:
            j = i + 1 + idx
            
            # Found a pair within coarse threshold.
            # Now find the true TCA (Time of Closest Approach) in a window.
            # Coarse timestamp is `timestamp`. Search +/- 15 minutes.
            tca_dt, min_dist, tca_reci1, tca_reci2 = find_tca(
                positions[i]["sat_obj"], # We need the sat objects, not just positions
                positions[j]["sat_obj"],
                timestamp,
                window_seconds=900 # 15 mins
            )

            # If the refined minimum is still within threshold (it should be <= coarse dist)
            if min_dist < threshold_km:
                # Convert TCA ECI to Geodetic for display
                # Need GMST at TCA
                jd_tca, fr_tca = jday(
                    tca_dt.year, tca_dt.month, tca_dt.day,
                    tca_dt.hour, tca_dt.minute,
                    tca_dt.second + tca_dt.microsecond / 1e6
                )
                gmst_tca = gmst(jd_tca, fr_tca)

                r1_ecef = teme_to_ecef(tca_reci1, gmst_tca)
                lat1, lon1, alt1 = ecef_to_geodetic(r1_ecef[0], r1_ecef[1], r1_ecef[2])

                r2_ecef = teme_to_ecef(tca_reci2, gmst_tca)
                lat2, lon2, alt2 = ecef_to_geodetic(r2_ecef[0], r2_ecef[1], r2_ecef[2])

                conjunctions.append({
                    "sat1_norad": positions[i]["norad_id"],
                    "sat1_name": positions[i]["name"],
                    "sat2_norad": positions[j]["norad_id"],
                    "sat2_name": positions[j]["name"],
                    "timestamp": tca_dt.isoformat(), # Exact TCA
                    "distance": round(min_dist, 5),
                    "risk_level": get_risk_level(min_dist),
                    "threshold": threshold_km,
                    "tca_refinement": True,
                    "sat1_position": {
                        "x": round(lon1, 4),
                        "y": round(lat1, 4),
                        "z": round(alt1, 4),
                    },
                    "sat2_position": {
                        "x": round(lon2, 4),
                        "y": round(lat2, 4),
                        "z": round(alt2, 4),
                    },
                })

    # Sort by distance ascending (most critical first)
    conjunctions.sort(key=lambda c: c["distance"])

    return conjunctions


def get_risk_level(distance_km: float) -> str:
    """Classify risk based on distance."""
    if distance_km < 1:
        return "CRITICAL"
    elif distance_km < 5:
        return "HIGH"
    elif distance_km < 25:
        return "MODERATE"
    return "LOW"

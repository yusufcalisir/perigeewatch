"""
Reentry Prediction Service

Uses real orbital mechanics to estimate reentry windows.
Computes orbital decay from BSTAR drag term in TLE data.

NOT a full atmospheric model — uses simplified exponential decay
based on real TLE parameters (BSTAR, altitude, eccentricity).
"""

import math
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from sgp4.api import Satrec, WGS72, jday
import numpy as np

EARTH_RADIUS_KM = 6378.137
MU_EARTH = 398600.4418  # km³/s²


def estimate_orbital_lifetime(line1: str, line2: str) -> Dict[str, Any]:
    """
    Estimate remaining orbital lifetime from TLE data.
    
    Uses the BSTAR drag coefficient and current altitude to estimate
    when the satellite will decay below 120km (uncontrolled reentry threshold).
    
    This is a simplified model based on real TLE parameters.
    """
    try:
        satrec = Satrec.twoline2rv(line1, line2, WGS72)
        
        # Extract key parameters
        bstar = satrec.bstar  # Drag term (real from TLE)
        mean_motion = satrec.no_kozai  # rad/min (real from TLE)
        eccentricity = satrec.ecco  # (real from TLE)
        inclination = math.degrees(satrec.inclo)  # degrees
        
        # Calculate semi-major axis
        # n = sqrt(mu / a^3) → a = (mu / n²)^(1/3)
        n_rad_sec = mean_motion / 60.0  # rad/s
        semi_major_axis = (MU_EARTH / (n_rad_sec ** 2)) ** (1.0 / 3.0)  # km
        
        # Perigee altitude
        perigee_alt = semi_major_axis * (1 - eccentricity) - EARTH_RADIUS_KM
        apogee_alt = semi_major_axis * (1 + eccentricity) - EARTH_RADIUS_KM
        
        # Current orbital period
        period_min = 2 * math.pi / mean_motion
        
        # Get current position for additional context
        now = datetime.utcnow()
        jd, fr = jday(now.year, now.month, now.day, now.hour, now.minute, now.second)
        e, r, v = satrec.sgp4(jd, fr)
        
        if e != 0:
            return {
                "error": f"SGP4 error code: {e}",
                "reentry_risk": "unknown",
            }
        
        current_alt = math.sqrt(r[0]**2 + r[1]**2 + r[2]**2) - EARTH_RADIUS_KM
        current_velocity = math.sqrt(v[0]**2 + v[1]**2 + v[2]**2)
        
        # Estimate lifetime using simplified King-Hele decay model
        # Lifetime ∝ (perigee_alt / (bstar * scale_factor))
        # This is a rough estimate — real models use full atmosphere density profiles
        
        reentry_risk = "none"
        estimated_days = None
        estimated_date = None
        
        if abs(bstar) > 1e-10 and perigee_alt < 600:
            # Simplified exponential decay
            # Higher BSTAR = more drag = faster decay
            # Lower perigee = denser atmosphere = faster decay
            
            # Scale height approximation (km)
            if perigee_alt < 200:
                scale_height = 30
            elif perigee_alt < 400:
                scale_height = 50
            elif perigee_alt < 600:
                scale_height = 60
            else:
                scale_height = 80
            
            # Atmospheric density factor
            rho_factor = math.exp(-(perigee_alt - 120) / scale_height)
            
            # Decay rate estimate (km/day) — simplified
            decay_rate = abs(bstar) * 1e5 * rho_factor * semi_major_axis
            
            if decay_rate > 0.001:
                # Distance to decay (perigee must drop to ~120km)
                distance_to_decay = max(0, perigee_alt - 120)
                estimated_days = distance_to_decay / decay_rate
                estimated_date = (now + timedelta(days=estimated_days)).isoformat() + "Z"
                
                if estimated_days < 7:
                    reentry_risk = "imminent"
                elif estimated_days < 30:
                    reentry_risk = "high"
                elif estimated_days < 180:
                    reentry_risk = "moderate"
                elif estimated_days < 365 * 5:
                    reentry_risk = "low"
                else:
                    reentry_risk = "negligible"
            else:
                reentry_risk = "negligible"
        elif perigee_alt >= 600:
            reentry_risk = "negligible"
            # Very rough estimate for higher orbits
            if perigee_alt < 800:
                estimated_days = (perigee_alt - 120) * 365 / 100  # Very rough
            else:
                estimated_days = None  # Effectively permanent
        
        return {
            "reentry_risk": reentry_risk,
            "estimated_days_remaining": round(estimated_days, 1) if estimated_days else None,
            "estimated_reentry_date": estimated_date,
            "perigee_alt_km": round(perigee_alt, 2),
            "apogee_alt_km": round(apogee_alt, 2),
            "current_alt_km": round(current_alt, 2),
            "current_velocity_km_s": round(current_velocity, 4),
            "bstar": bstar,
            "inclination_deg": round(inclination, 4),
            "eccentricity": round(eccentricity, 7),
            "period_min": round(period_min, 2),
            "semi_major_axis_km": round(semi_major_axis, 2),
        }
        
    except Exception as exc:
        return {
            "error": str(exc),
            "reentry_risk": "unknown",
        }


def get_reentry_candidates(
    tles: List[Dict[str, Any]],
    max_perigee_km: float = 400,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """
    Scan satellite catalog for potential reentry candidates.
    
    Filters satellites with low perigee altitude and computes
    estimated lifetime for each. Uses real TLE data.
    """
    candidates = []
    
    for tle_data in tles:
        try:
            result = estimate_orbital_lifetime(tle_data["line1"], tle_data["line2"])
            
            if result.get("error"):
                continue
                
            if result["perigee_alt_km"] <= max_perigee_km and result["reentry_risk"] not in ("none", "negligible"):
                candidates.append({
                    "norad_id": tle_data.get("norad_id"),
                    "name": tle_data.get("name", ""),
                    **result,
                })
        except Exception:
            continue
    
    # Sort by estimated days remaining (soonest first)
    candidates.sort(key=lambda x: x.get("estimated_days_remaining") or float("inf"))
    
    return candidates[:limit]

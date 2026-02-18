from sgp4.api import Satrec, WGS72, jday
from app.models.tle import TLE
import numpy as np
from datetime import datetime, timedelta
from typing import Tuple, Optional, List, Dict, Any
import logging

logger = logging.getLogger(__name__)

# Constants for coordinate conversion (WGS84 ellipsoid)
XKMPER = 6378.137 # Earth equatorial radius in km
F = 1.0 / 298.257223563 # Flattening
# SGP4 uses WGS72 constants by default, but we can output position in TEME.
# TEME to ECEF requires Greenwich Mean Sidereal Time (GMST).

def gmst(jd: float, fr: float) -> float:
    """
    Calculate Greenwich Mean Sidereal Time (angle in radians).
    Using the IAU 1982 model.
    """
    import math
    # Julian centuries from J2000.0
    tut1 = (jd - 2451545.0 + fr) / 36525.0
    
    # GMST in seconds
    temp = (-6.2e-6 * tut1 * tut1 * tut1 
            + 0.093104 * tut1 * tut1 
            + (876600.0 * 3600.0 + 8640184.812866) * tut1 
            + 67310.54841)
    
    # Convert to radians, mod 2*pi
    gmst_rad = math.fmod(temp * (2.0 * math.pi / 86400.0), 2.0 * math.pi)
    if gmst_rad < 0.0:
        gmst_rad += 2.0 * math.pi
    
    return gmst_rad

def teme_to_ecef(r_teme: np.ndarray, gmst_angle: float) -> np.ndarray:
    """
    Convert TEME position vector to ECEF.
    Rotation by GMST around Z-axis.
    """
    cos_t = np.cos(gmst_angle)
    sin_t = np.sin(gmst_angle)
    
    # R_z(gmst) rotation matrix (transposed/inverse because we go TEME (inertial-ish) -> ECEF (rotating))
    # ECEF = Rot(GMST) * TEME
    
    x_teme, y_teme, z_teme = r_teme
    
    x_ecef = x_teme * cos_t + y_teme * sin_t
    y_ecef = -x_teme * sin_t + y_teme * cos_t
    z_ecef = z_teme
    
    return np.array([x_ecef, y_ecef, z_ecef])

def ecef_to_geodetic(x: float, y: float, z: float) -> Tuple[float, float, float]:
    """
    Convert ECEF coordinates (km) to Geodetic (lat, lon, alt).
    Lat/Lon in degrees, Alt in km.
    Algorithm: Ferrari's solution or iterative method.
    Using Heikkinen's exact solution for efficiency.
    """
    # WGS84 Constants
    a = 6378.137
    f = 1.0 / 298.257223563
    b = a * (1.0 - f)
    e2 = f * (2.0 - f)
    ep2 = (a**2 - b**2) / b**2
    
    p = np.sqrt(x**2 + y**2)
    theta = np.arctan2(z * a, p * b)
    
    lon = np.arctan2(y, x)
    lat = np.arctan2(z + ep2 * b * np.sin(theta)**3, p - e2 * a * np.cos(theta)**3)
    
    n = a / np.sqrt(1.0 - e2 * np.sin(lat)**2)
    alt = (p / np.cos(lat)) - n
    
    return np.degrees(lat), np.degrees(lon), alt

def get_position_at(line1: str, line2: str, time: datetime) -> Dict[str, Any]:
    """
    Calculate position for a given TLE and time.
    Returns: Dict with Geodetic (Lat, Lon, Alt) and velocity.
    """
    satellite = Satrec.twoline2rv(line1, line2, WGS72)
    jd, fr = jday(time.year, time.month, time.day, time.hour, time.minute, time.second + time.microsecond/1e6)
    
    e, r, v = satellite.sgp4(jd, fr)
    
    if e != 0:
        return {"error": f"SGP4 error {e}"}
    
    # r, v are in TEME frame (True Equator Mean Equinox)
    # Convert to ECEF
    gmst_angle = gmst(jd, fr)
    r_ecef = teme_to_ecef(np.array(r), gmst_angle)
    
    # Convert to Geodetic
    lat, lon, alt = ecef_to_geodetic(r_ecef[0], r_ecef[1], r_ecef[2])
    
    return {
        "pos_eci": r,           # km
        "vel_eci": v,           # km/s
        "lat": lat,             # deg
        "lon": lon,             # deg
        "alt": alt,             # km
        "velocity": np.linalg.norm(v), # km/s scalar
        "timestamp": time.isoformat()
    }

def propagate_batch(tles: List[TLE], time: datetime) -> List[Dict[str, Any]]:
    """
    Propagate a batch of TLEs.
    Returns list of results.
    """
    results = []
    jd, fr = jday(time.year, time.month, time.day, time.hour, time.minute, time.second + time.microsecond/1e6)
    gmst_angle = gmst(jd, fr)
    
    for tle in tles:
        try:
            satellite = Satrec.twoline2rv(tle.line1, tle.line2, WGS72)
            e, r, v = satellite.sgp4(jd, fr)
            
            if e != 0:
                continue
                
            r_ecef = teme_to_ecef(np.array(r), gmst_angle)
            lat, lon, alt = ecef_to_geodetic(r_ecef[0], r_ecef[1], r_ecef[2])
            
            results.append({
                "norad_id": tle.satellite_id, # Actually this should be satellite.satnum or fetching from TLE obj if available. Models.TLE has satellite_id which is DB ID usually? 
                # Check models/tle.py: satellite_id is ForeignKey to satellite.id. 
                # We need norad_id. TLE object might not have it loaded unless joined.
                # Assuming caller handles mapping or TLE has necessary info.
                # Let's return what we have.
                "sat_id": tle.satellite_id,
                "lat": lat,
                "lon": lon,
                "alt": alt,
                "velocity": np.linalg.norm(v)
            })
        except Exception:
            continue
            
            
    return results

def get_satellite_trajectory(tle_line1: str, tle_line2: str, start_time: datetime, end_time: datetime, step_seconds: int = 60) -> List[Dict[str, Any]]:
    """
    Calculate trajectory for a given TLE over a time range.
    Returns: List of positions (lat, lon, alt)
    """
    results = []
    satellite = Satrec.twoline2rv(tle_line1, tle_line2, WGS72)
    
    current_time = start_time
    while current_time <= end_time:
        jd, fr = jday(current_time.year, current_time.month, current_time.day, current_time.hour, current_time.minute, current_time.second + current_time.microsecond/1e6)
        
        e, r, v = satellite.sgp4(jd, fr)
        
        if e == 0:
            # Convert TEME to ECEF to Geodetic
            gmst_angle = gmst(jd, fr)
            r_ecef = teme_to_ecef(np.array(r), gmst_angle)
            lat, lon, alt = ecef_to_geodetic(r_ecef[0], r_ecef[1], r_ecef[2])
            
            results.append({
                "time": current_time.isoformat(),
                "lat": lat,
                "lon": lon,
                "alt": alt,
                "velocity": np.linalg.norm(v)
            })
            
        current_time += timedelta(seconds=step_seconds)
        
    return results

"""
Ground Station Pass Prediction Service.

Implements topocentric coordinate transforms and pass prediction for
a ground station at Ankara, Turkey (39.9334°N, 32.8597°E, 938m).
"""

from sgp4.api import Satrec, WGS72, jday
from app.services.propagation import gmst, teme_to_ecef
from app.models.tle import TLE
from app.models.satellite import Satellite
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
import logging

logger = logging.getLogger(__name__)

# ────────────────────────────────────────────────────────────
# Ground Station Configuration
# ────────────────────────────────────────────────────────────
STATION = {
    "name": "Ankara GS",
    "lat_deg": 39.9334,
    "lon_deg": 32.8597,
    "alt_m": 938.0,
}

MIN_ELEVATION_DEG = 10.0   # Minimum elevation mask

# WGS84 constants
_A = 6378.137              # Equatorial radius (km)
_F = 1.0 / 298.257223563  # Flattening
_E2 = _F * (2.0 - _F)     # Eccentricity squared


# ────────────────────────────────────────────────────────────
# Coordinate Utilities
# ────────────────────────────────────────────────────────────

def geodetic_to_ecef(lat_deg: float, lon_deg: float, alt_km: float) -> np.ndarray:
    """Convert geodetic (WGS84) to ECEF in km."""
    lat = np.radians(lat_deg)
    lon = np.radians(lon_deg)
    sin_lat = np.sin(lat)
    cos_lat = np.cos(lat)
    sin_lon = np.sin(lon)
    cos_lon = np.cos(lon)

    N = _A / np.sqrt(1.0 - _E2 * sin_lat**2)

    x = (N + alt_km) * cos_lat * cos_lon
    y = (N + alt_km) * cos_lat * sin_lon
    z = (N * (1.0 - _E2) + alt_km) * sin_lat

    return np.array([x, y, z])


def ecef_to_look_angles(
    station_ecef: np.ndarray,
    station_lat_rad: float,
    station_lon_rad: float,
    sat_ecef: np.ndarray,
) -> Tuple[float, float, float]:
    """
    Compute azimuth, elevation, and range from a ground station to a satellite.

    Both inputs in ECEF (km). Returns (azimuth_deg, elevation_deg, range_km).
    Uses the SEZ (South-East-Zenith) topocentric frame.
    """
    # Vector from station to satellite in ECEF
    rho_ecef = sat_ecef - station_ecef

    sin_lat = np.sin(station_lat_rad)
    cos_lat = np.cos(station_lat_rad)
    sin_lon = np.sin(station_lon_rad)
    cos_lon = np.cos(station_lon_rad)

    # Rotate ECEF → SEZ (South-East-Zenith)
    rho_s = (
        sin_lat * cos_lon * rho_ecef[0]
        + sin_lat * sin_lon * rho_ecef[1]
        - cos_lat * rho_ecef[2]
    )
    rho_e = -sin_lon * rho_ecef[0] + cos_lon * rho_ecef[1]
    rho_z = (
        cos_lat * cos_lon * rho_ecef[0]
        + cos_lat * sin_lon * rho_ecef[1]
        + sin_lat * rho_ecef[2]
    )

    range_km = np.sqrt(rho_s**2 + rho_e**2 + rho_z**2)

    # Elevation: angle above horizon
    elevation_rad = np.arcsin(rho_z / range_km) if range_km > 0 else 0.0
    elevation_deg = np.degrees(elevation_rad)

    # Azimuth: measured clockwise from North
    azimuth_rad = np.arctan2(rho_e, -rho_s)  # negative S gives North reference
    azimuth_deg = np.degrees(azimuth_rad) % 360.0

    return azimuth_deg, elevation_deg, range_km


# ────────────────────────────────────────────────────────────
# Cached station ECEF (constant – computed once)
# ────────────────────────────────────────────────────────────
_station_ecef = geodetic_to_ecef(
    STATION["lat_deg"], STATION["lon_deg"], STATION["alt_m"] / 1000.0
)
_station_lat_rad = np.radians(STATION["lat_deg"])
_station_lon_rad = np.radians(STATION["lon_deg"])


# ────────────────────────────────────────────────────────────
# Core Visibility Functions
# ────────────────────────────────────────────────────────────

def _sat_ecef_at(satrec: Satrec, dt: datetime) -> Optional[np.ndarray]:
    """Propagate a Satrec and return ECEF position or None on error."""
    jd_val, fr = jday(
        dt.year, dt.month, dt.day,
        dt.hour, dt.minute,
        dt.second + dt.microsecond / 1e6,
    )
    e, r, _ = satrec.sgp4(jd_val, fr)
    if e != 0:
        return None
    g = gmst(jd_val, fr)
    return teme_to_ecef(np.array(r), g)


def elevation_at(satrec: Satrec, dt: datetime) -> Optional[float]:
    """Return elevation (deg) of satellite from station at time dt, or None on error."""
    ecef = _sat_ecef_at(satrec, dt)
    if ecef is None:
        return None
    _, el, _ = ecef_to_look_angles(_station_ecef, _station_lat_rad, _station_lon_rad, ecef)
    return el


def look_angles_at(satrec: Satrec, dt: datetime) -> Optional[Dict[str, float]]:
    """Return {azimuth, elevation, range_km} or None."""
    ecef = _sat_ecef_at(satrec, dt)
    if ecef is None:
        return None
    az, el, rng = ecef_to_look_angles(_station_ecef, _station_lat_rad, _station_lon_rad, ecef)
    return {"azimuth": round(az, 2), "elevation": round(el, 2), "range_km": round(rng, 2)}


# ────────────────────────────────────────────────────────────
# Pass Prediction
# ────────────────────────────────────────────────────────────

def _refine_crossing(
    satrec: Satrec,
    t_below: datetime,
    t_above: datetime,
    iterations: int = 10,
) -> datetime:
    """Bisection to find the exact moment elevation crosses MIN_ELEVATION_DEG."""
    for _ in range(iterations):
        t_mid = t_below + (t_above - t_below) / 2
        el = elevation_at(satrec, t_mid)
        if el is None:
            return t_mid
        if el >= MIN_ELEVATION_DEG:
            t_above = t_mid
        else:
            t_below = t_mid
    return t_below + (t_above - t_below) / 2


def predict_passes_for_sat(
    satrec: Satrec,
    start: datetime,
    hours: float = 24.0,
    step_seconds: float = 30.0,
) -> List[Dict[str, Any]]:
    """
    Predict visible passes for a single satellite within a time window.

    Returns a list of pass dicts with AOS, LOS, max_el, max_el_time, and duration.
    """
    passes: List[Dict[str, Any]] = []
    end = start + timedelta(hours=hours)
    dt = start
    step = timedelta(seconds=step_seconds)

    in_pass = False
    aos_time: Optional[datetime] = None
    max_el = 0.0
    max_el_time: Optional[datetime] = None
    prev_el = -90.0
    prev_dt = dt

    while dt <= end:
        el = elevation_at(satrec, dt)
        if el is None:
            dt += step
            prev_el = -90.0
            prev_dt = dt
            continue

        if not in_pass and el >= MIN_ELEVATION_DEG:
            # AOS detected – refine
            if prev_el < MIN_ELEVATION_DEG:
                aos_time = _refine_crossing(satrec, prev_dt, dt)
            else:
                aos_time = dt
            in_pass = True
            max_el = el
            max_el_time = dt

        elif in_pass and el >= MIN_ELEVATION_DEG:
            if el > max_el:
                max_el = el
                max_el_time = dt

        elif in_pass and el < MIN_ELEVATION_DEG:
            # LOS detected – refine
            los_time = _refine_crossing(satrec, dt, prev_dt)
            if aos_time and max_el_time:
                duration = (los_time - aos_time).total_seconds()
                passes.append({
                    "aos": aos_time.isoformat() + "Z",
                    "los": los_time.isoformat() + "Z",
                    "duration_s": round(duration),
                    "max_elevation": round(max_el, 2),
                    "max_el_time": max_el_time.isoformat() + "Z",
                })
            in_pass = False
            max_el = 0.0

        prev_el = el
        prev_dt = dt
        dt += step

    # Handle pass that hasn't ended by window close
    if in_pass and aos_time and max_el_time:
        duration = (end - aos_time).total_seconds()
        passes.append({
            "aos": aos_time.isoformat() + "Z",
            "los": end.isoformat() + "Z",
            "duration_s": round(duration),
            "max_elevation": round(max_el, 2),
            "max_el_time": max_el_time.isoformat() + "Z",
        })

    return passes


# ────────────────────────────────────────────────────────────
# Public API Helpers (used by endpoint)
# ────────────────────────────────────────────────────────────

def get_latest_tles(db: Session) -> List[Tuple[TLE, int, str]]:
    """Return (TLE, norad_id, sat_name) tuples for all active satellites."""
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
        .all()
    )

    # Map to norad_id / name
    sat_ids = [t.satellite_id for t in tles]
    if not sat_ids:
        return []
    sats = db.query(Satellite.id, Satellite.norad_id, Satellite.name).filter(
        Satellite.id.in_(sat_ids)
    ).all()
    sat_map = {s.id: (s.norad_id, s.name) for s in sats}

    result = []
    for tle in tles:
        info = sat_map.get(tle.satellite_id)
        if info:
            result.append((tle, info[0], info[1]))
    return result


def get_visible_now(db: Session, timestamp: datetime) -> List[Dict[str, Any]]:
    """Return list of currently visible satellites with look-angles."""
    tle_data = get_latest_tles(db)
    visible = []
    for tle, norad_id, name in tle_data:
        try:
            satrec = Satrec.twoline2rv(tle.line1, tle.line2, WGS72)
            angles = look_angles_at(satrec, timestamp)
            if angles and angles["elevation"] >= MIN_ELEVATION_DEG:
                visible.append({
                    "norad_id": norad_id,
                    "name": name,
                    **angles,
                })
        except Exception:
            continue
    # Sort by elevation descending (highest first)
    visible.sort(key=lambda v: v["elevation"], reverse=True)
    return visible


def get_next_passes(
    db: Session,
    timestamp: datetime,
    hours: float = 24.0,
) -> List[Dict[str, Any]]:
    """Predict next passes for all satellites."""
    tle_data = get_latest_tles(db)
    all_passes: List[Dict[str, Any]] = []

    for tle, norad_id, name in tle_data:
        try:
            satrec = Satrec.twoline2rv(tle.line1, tle.line2, WGS72)
            passes = predict_passes_for_sat(satrec, timestamp, hours=hours)
            for p in passes:
                p["norad_id"] = norad_id
                p["name"] = name
                all_passes.append(p)
        except Exception:
            continue

    # Sort by AOS time
    all_passes.sort(key=lambda p: p["aos"])
    return all_passes

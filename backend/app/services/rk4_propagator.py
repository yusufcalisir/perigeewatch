"""
RK4 (Runge-Kutta 4th Order) Numerical Propagator

Higher-fidelity orbital propagation with J2 perturbation
and simplified atmospheric drag model.

This complements SGP4 for scenarios requiring better accuracy:
- Close approach analysis
- Maneuver planning
- Re-entry corridor prediction
"""

import math
import numpy as np
from typing import List, Dict, Any, Tuple
from datetime import datetime, timedelta
from sgp4.api import Satrec, WGS72, jday

# Constants
MU_EARTH = 398600.4418  # km³/s² - Earth's gravitational parameter
R_EARTH = 6378.137  # km - Earth's equatorial radius
J2 = 1.08263e-3  # J2 zonal harmonic
OMEGA_EARTH = 7.2921150e-5  # rad/s - Earth's rotation rate
CD = 2.2  # Drag coefficient (typical)
AREA_MASS_RATIO = 0.01  # m²/kg (typical for LEO satellite)


def atmospheric_density(altitude_km: float) -> float:
    """
    Simplified exponential atmosphere model.
    Returns density in kg/m³.

    Based on 1976 US Standard Atmosphere.
    """
    if altitude_km < 0:
        return 1.225

    # Table of (altitude_km, density, scale_height)
    layers = [
        (0, 1.225, 7.249),
        (25, 3.899e-2, 6.349),
        (30, 1.774e-2, 6.682),
        (40, 3.972e-3, 7.554),
        (50, 1.057e-3, 8.382),
        (60, 3.206e-4, 7.714),
        (70, 8.770e-5, 6.549),
        (80, 1.905e-5, 5.799),
        (90, 3.396e-6, 5.382),
        (100, 5.297e-7, 5.877),
        (110, 9.661e-8, 7.263),
        (120, 2.438e-8, 9.473),
        (130, 8.484e-9, 12.636),
        (140, 3.845e-9, 16.149),
        (150, 2.070e-9, 22.523),
        (180, 5.464e-10, 29.740),
        (200, 2.789e-10, 37.105),
        (250, 7.248e-11, 45.546),
        (300, 2.418e-11, 53.628),
        (350, 9.518e-12, 53.298),
        (400, 3.725e-12, 58.515),
        (450, 1.585e-12, 60.828),
        (500, 6.967e-13, 63.822),
        (600, 1.454e-13, 71.835),
        (700, 3.614e-14, 88.667),
        (800, 1.170e-14, 124.64),
        (900, 5.245e-15, 181.05),
        (1000, 3.019e-15, 268.00),
    ]

    # Find bounding layer
    for i in range(len(layers) - 1, -1, -1):
        if altitude_km >= layers[i][0]:
            h0, rho0, H = layers[i]
            return rho0 * math.exp(-(altitude_km - h0) / H)

    return layers[0][1]


def gravity_j2(r: np.ndarray) -> np.ndarray:
    """
    Gravity acceleration with J2 perturbation.

    r: position vector [x, y, z] in km
    Returns: acceleration vector in km/s²
    """
    r_mag = np.linalg.norm(r)
    if r_mag < 1.0:  # Safety
        return np.zeros(3)

    x, y, z = r[0], r[1], r[2]
    r2 = r_mag ** 2
    r5 = r_mag ** 5

    # Two-body acceleration
    a_two_body = -MU_EARTH / (r_mag ** 3) * r

    # J2 perturbation
    factor = 1.5 * J2 * MU_EARTH * R_EARTH ** 2 / r5
    z2_r2 = (z / r_mag) ** 2

    a_j2 = np.array([
        factor * x * (5 * z2_r2 - 1),
        factor * y * (5 * z2_r2 - 1),
        factor * z * (5 * z2_r2 - 3),
    ])

    return a_two_body + a_j2


def drag_acceleration(r: np.ndarray, v: np.ndarray, bstar: float = 0.0) -> np.ndarray:
    """
    Atmospheric drag acceleration.

    Uses simplified drag model with exponential atmosphere.
    """
    r_mag = np.linalg.norm(r)
    alt_km = r_mag - R_EARTH

    if alt_km > 1000:  # No drag above 1000km
        return np.zeros(3)

    rho = atmospheric_density(alt_km)  # kg/m³

    # Relative velocity (accounting for Earth's rotation)
    v_atm = np.array([-OMEGA_EARTH * r[1], OMEGA_EARTH * r[0], 0.0])
    v_rel = v - v_atm
    v_rel_mag = np.linalg.norm(v_rel)

    if v_rel_mag < 1e-6:
        return np.zeros(3)

    # Use BSTAR if available, otherwise use default area/mass
    if abs(bstar) > 1e-12:
        # BSTAR = (Cd * A) / (2 * m) * rho0 (see SGP4 documentation)
        # Simplified: drag ∝ BSTAR * rho * v²
        ballistic_coeff = abs(bstar) * 1e3  # Scale factor
    else:
        ballistic_coeff = 0.5 * CD * AREA_MASS_RATIO  # m²/kg

    # a_drag = -0.5 * rho * Cd * (A/m) * |v_rel| * v_rel
    # Convert: rho is in kg/m³, v in km/s → need consistent units
    # Multiply by 1e-3 to convert m to km
    a_drag = -0.5 * rho * ballistic_coeff * v_rel_mag * v_rel * 1e-3

    return a_drag


def derivatives(state: np.ndarray, bstar: float = 0.0) -> np.ndarray:
    """Compute state derivatives [v, a]."""
    r = state[:3]
    v = state[3:]

    a_gravity = gravity_j2(r)
    a_drag = drag_acceleration(r, v, bstar)

    return np.concatenate([v, a_gravity + a_drag])


def rk4_step(state: np.ndarray, dt: float, bstar: float = 0.0) -> np.ndarray:
    """Single RK4 integration step."""
    k1 = derivatives(state, bstar)
    k2 = derivatives(state + 0.5 * dt * k1, bstar)
    k3 = derivatives(state + 0.5 * dt * k2, bstar)
    k4 = derivatives(state + dt * k3, bstar)

    return state + (dt / 6.0) * (k1 + 2 * k2 + 2 * k3 + k4)


def propagate_rk4(
    line1: str,
    line2: str,
    start_time: datetime,
    duration_minutes: float = 90,
    step_seconds: float = 60,
) -> List[Dict[str, Any]]:
    """
    Propagate satellite orbit using RK4 with J2 + drag.

    Uses SGP4 initial conditions from TLE, then numerically
    integrates with higher-fidelity force model.

    Returns list of position/velocity points.
    """
    try:
        satrec = Satrec.twoline2rv(line1, line2, WGS72)
        bstar = satrec.bstar
    except Exception as e:
        return [{"error": str(e)}]

    # Get initial state from SGP4 at start_time
    jd, fr = jday(
        start_time.year, start_time.month, start_time.day,
        start_time.hour, start_time.minute, start_time.second,
    )
    e, r0, v0 = satrec.sgp4(jd, fr)
    if e != 0:
        return [{"error": f"SGP4 error: {e}"}]

    state = np.array([*r0, *v0])  # [x, y, z, vx, vy, vz] in km, km/s
    dt = step_seconds
    num_steps = int(duration_minutes * 60 / step_seconds)

    trajectory = []
    current_time = start_time

    for i in range(num_steps + 1):
        r = state[:3]
        v = state[3:]
        r_mag = np.linalg.norm(r)
        alt_km = r_mag - R_EARTH

        # Convert ECI to lat/lon
        lon = math.degrees(math.atan2(r[1], r[0]))
        lat = math.degrees(math.asin(r[2] / r_mag))

        # Account for Earth's rotation
        gmst = _compute_gmst(current_time)
        lon = (lon - gmst + 180) % 360 - 180

        trajectory.append({
            "time": current_time.isoformat() + "Z",
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "alt": round(alt_km, 3),
            "velocity": round(float(np.linalg.norm(v)), 4),
            "r_eci": [round(float(x), 3) for x in r],
            "v_eci": [round(float(x), 6) for x in v],
        })

        if i < num_steps:
            state = rk4_step(state, dt, bstar)
            current_time += timedelta(seconds=step_seconds)

    return trajectory


def _compute_gmst(dt: datetime) -> float:
    """Compute Greenwich Mean Sidereal Time in degrees."""
    # Julian Date
    a = (14 - dt.month) // 12
    y = dt.year + 4800 - a
    m = dt.month + 12 * a - 3
    jdn = dt.day + (153 * m + 2) // 5 + 365 * y + y // 4 - y // 100 + y // 400 - 32045
    jd = jdn + (dt.hour - 12) / 24.0 + dt.minute / 1440.0 + dt.second / 86400.0

    T = (jd - 2451545.0) / 36525.0
    gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T
    return gmst % 360

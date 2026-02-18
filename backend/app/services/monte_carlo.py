"""
Monte Carlo Collision Probability (PoC) Calculator

Computes probability of collision between two space objects
using Monte Carlo simulation with covariance-based position uncertainty.

Uses real TLE data and SGP4 propagation with Gaussian perturbations
to estimate collision probability.
"""


import numpy as np
from typing import Dict, Any
from sgp4.api import Satrec, WGS72, jday
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

EARTH_RADIUS_KM = 6378.137


def compute_collision_probability(
    tle1_line1: str,
    tle1_line2: str,
    tle2_line1: str,
    tle2_line2: str,
    tca: datetime,
    combined_radius_km: float = 0.05,  # 50m combined hard-body radius
    position_sigma_km: float = 1.0,  # Position uncertainty (1-sigma) in km
    num_samples: int = 1000,
    time_window_seconds: int = 600,  # ±10 min around TCA
) -> Dict[str, Any]:
    """
    Monte Carlo collision probability estimation.

    Strategy:
    1. Propagate both objects to TCA with SGP4
    2. Perturb positions with Gaussian noise (representing covariance)
    3. Count fraction of samples where distance < combined_radius
    4. PoC = hits / total_samples

    This gives a real probability, not just a distance threshold.
    """
    try:
        sat1 = Satrec.twoline2rv(tle1_line1, tle1_line2, WGS72)
        sat2 = Satrec.twoline2rv(tle2_line1, tle2_line2, WGS72)
    except Exception as e:
        return {"error": f"TLE parse error: {e}", "poc": None}

    # Propagate to TCA
    jd, fr = jday(tca.year, tca.month, tca.day, tca.hour, tca.minute, tca.second)

    e1, r1, v1 = sat1.sgp4(jd, fr)
    e2, r2, v2 = sat2.sgp4(jd, fr)

    if e1 != 0 or e2 != 0:
        return {"error": f"SGP4 error: sat1={e1} sat2={e2}", "poc": None}

    r1 = np.array(r1)  # km
    r2 = np.array(r2)  # km
    v1 = np.array(v1)  # km/s
    v2 = np.array(v2)  # km/s

    # Nominal miss distance at TCA
    nominal_distance = np.linalg.norm(r1 - r2)
    relative_velocity = np.linalg.norm(v1 - v2)

    # Monte Carlo sampling
    np.random.seed(42)  # Reproducible

    # Generate 3D Gaussian perturbations for both objects
    perturb1 = np.random.normal(0, position_sigma_km, (num_samples, 3))
    perturb2 = np.random.normal(0, position_sigma_km, (num_samples, 3))

    # Compute perturbed distances
    perturbed_r1 = r1 + perturb1
    perturbed_r2 = r2 + perturb2
    distances = np.linalg.norm(perturbed_r1 - perturbed_r2, axis=1)

    # Count "hits" (distance < combined radius)
    hits = np.sum(distances < combined_radius_km)
    poc = float(hits) / num_samples

    # Also scan time window for closest approach
    min_dist = nominal_distance
    min_dist_time = tca

    dt_steps = np.linspace(-time_window_seconds, time_window_seconds, 50)
    for dt in dt_steps:
        t = tca + timedelta(seconds=float(dt))
        jd_t, fr_t = jday(t.year, t.month, t.day, t.hour, t.minute, t.second)
        e1_t, r1_t, _ = sat1.sgp4(jd_t, fr_t)
        e2_t, r2_t, _ = sat2.sgp4(jd_t, fr_t)
        if e1_t == 0 and e2_t == 0:
            d = np.linalg.norm(np.array(r1_t) - np.array(r2_t))
            if d < min_dist:
                min_dist = d
                min_dist_time = t

    # Risk classification based on PoC
    if poc > 1e-4:
        risk = "RED"  # Actionable
    elif poc > 1e-6:
        risk = "YELLOW"  # Watch
    else:
        risk = "GREEN"  # Negligible

    return {
        "poc": poc,
        "risk_level": risk,
        "nominal_miss_distance_km": round(nominal_distance, 4),
        "closest_approach_km": round(min_dist, 4),
        "closest_approach_time": min_dist_time.isoformat() + "Z",
        "relative_velocity_km_s": round(relative_velocity, 4),
        "position_uncertainty_km": position_sigma_km,
        "combined_radius_km": combined_radius_km,
        "monte_carlo_samples": num_samples,
        "monte_carlo_hits": int(hits),
    }

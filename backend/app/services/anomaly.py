"""
Statistical Anomaly Detection Service

Detects anomalous orbital behavior by analyzing historical TLE data.
Uses Z-score based deviation analysis on mean motion and eccentricity.

This is a statistical approach (no ML dependencies required).
Works with real TLE time-series data from the database.
"""

import math
import numpy as np
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from sgp4.api import Satrec, WGS72
from sqlalchemy.orm import Session
from sqlalchemy import desc
import logging

logger = logging.getLogger(__name__)


def extract_orbital_elements(line1: str, line2: str) -> Dict[str, float]:
    """Extract orbital elements from TLE lines."""
    try:
        sat = Satrec.twoline2rv(line1, line2, WGS72)
        return {
            "mean_motion": sat.no_kozai * 60.0 / (2 * math.pi),  # rev/day
            "eccentricity": sat.ecco,
            "inclination": math.degrees(sat.inclo),
            "raan": math.degrees(sat.nodeo),
            "arg_perigee": math.degrees(sat.argpo),
            "bstar": sat.bstar,
        }
    except Exception:
        return {}


def detect_anomalies(
    tle_history: List[Dict[str, Any]],
    z_threshold: float = 3.0,
) -> Dict[str, Any]:
    """
    Detect anomalous orbital behavior from TLE history.

    Strategy:
    1. Extract orbital elements from each historical TLE
    2. Compute rolling statistics (mean, std) for mean_motion and eccentricity
    3. Flag TLEs where Z-score exceeds threshold
    4. Classify anomaly type (maneuver, drag change, debris event)

    Parameters:
        tle_history: List of dicts with 'line1', 'line2', 'epoch' keys
        z_threshold: Z-score threshold for anomaly detection (default: 3σ)

    Returns:
        Dict with anomaly details if detected, or all-clear status.
    """
    if len(tle_history) < 5:
        return {
            "status": "insufficient_data",
            "message": f"Need at least 5 TLEs, got {len(tle_history)}",
            "anomalies": [],
        }

    # Extract time series
    elements_series = []
    for tle in tle_history:
        elems = extract_orbital_elements(tle["line1"], tle["line2"])
        if elems:
            elems["epoch"] = tle["epoch"]
            elements_series.append(elems)

    if len(elements_series) < 5:
        return {"status": "insufficient_data", "anomalies": []}

    # Sort by epoch
    elements_series.sort(key=lambda x: x["epoch"])

    # Analyze mean motion changes
    mean_motions = np.array([e["mean_motion"] for e in elements_series])
    eccentricities = np.array([e["eccentricity"] for e in elements_series])
    bstars = np.array([abs(e["bstar"]) for e in elements_series])

    anomalies = []

    # Check mean motion for sudden changes (maneuver indicator)
    if len(mean_motions) >= 3:
        # Diff-based analysis: compute change between consecutive TLEs
        mm_diffs = np.diff(mean_motions)
        mm_diff_mean = np.mean(mm_diffs)
        mm_diff_std = np.std(mm_diffs) if np.std(mm_diffs) > 0 else 1e-10

        for i, diff in enumerate(mm_diffs):
            z_score = abs(diff - mm_diff_mean) / mm_diff_std
            if z_score > z_threshold:
                epoch = elements_series[i + 1]["epoch"]
                anomaly_type = "maneuver" if diff > 0 else "drag_increase"
                anomalies.append({
                    "epoch": epoch.isoformat() if isinstance(epoch, datetime) else str(epoch),
                    "type": anomaly_type,
                    "parameter": "mean_motion",
                    "z_score": round(float(z_score), 2),
                    "delta": round(float(diff), 8),
                    "description": f"Sudden {'increase' if diff > 0 else 'decrease'} in mean motion (Z={z_score:.1f}σ)",
                })

    # Check eccentricity for sudden changes (orbit change indicator)
    if len(eccentricities) >= 3:
        ecc_diffs = np.diff(eccentricities)
        ecc_diff_mean = np.mean(ecc_diffs)
        ecc_diff_std = np.std(ecc_diffs) if np.std(ecc_diffs) > 0 else 1e-10

        for i, diff in enumerate(ecc_diffs):
            z_score = abs(diff - ecc_diff_mean) / ecc_diff_std
            if z_score > z_threshold:
                epoch = elements_series[i + 1]["epoch"]
                anomalies.append({
                    "epoch": epoch.isoformat() if isinstance(epoch, datetime) else str(epoch),
                    "type": "orbit_change",
                    "parameter": "eccentricity",
                    "z_score": round(float(z_score), 2),
                    "delta": round(float(diff), 8),
                    "description": f"Sudden eccentricity change (Z={z_score:.1f}σ)",
                })

    # Check BSTAR for sudden jumps (drag anomaly)
    if len(bstars) >= 3:
        bstar_diffs = np.diff(bstars)
        bstar_mean = np.mean(bstar_diffs)
        bstar_std = np.std(bstar_diffs) if np.std(bstar_diffs) > 0 else 1e-10

        for i, diff in enumerate(bstar_diffs):
            z_score = abs(diff - bstar_mean) / bstar_std
            if z_score > z_threshold:
                epoch = elements_series[i + 1]["epoch"]
                anomalies.append({
                    "epoch": epoch.isoformat() if isinstance(epoch, datetime) else str(epoch),
                    "type": "drag_anomaly",
                    "parameter": "bstar",
                    "z_score": round(float(z_score), 2),
                    "delta": round(float(diff), 8),
                    "description": f"Unusual drag coefficient change (Z={z_score:.1f}σ)",
                })

    # Sort by epoch
    anomalies.sort(key=lambda x: x["epoch"], reverse=True)

    return {
        "status": "anomalies_detected" if anomalies else "nominal",
        "total_tles_analyzed": len(elements_series),
        "anomaly_count": len(anomalies),
        "anomalies": anomalies,
        "statistics": {
            "mean_motion_mean": round(float(np.mean(mean_motions)), 6),
            "mean_motion_std": round(float(np.std(mean_motions)), 8),
            "eccentricity_mean": round(float(np.mean(eccentricities)), 8),
            "eccentricity_std": round(float(np.std(eccentricities)), 10),
        },
    }

"""
Space-Track.org REST API Client

Provides authenticated access to Space-Track.org for:
- TLE/GP data retrieval
- JSON OMM (Orbit Mean-elements Message) format
- Historical TLE queries

Requires SPACETRACK_USER and SPACETRACK_PASSWORD environment variables.
"""

import os
import requests
import logging
from typing import Optional, List, Dict, Any


logger = logging.getLogger(__name__)

SPACETRACK_BASE = "https://www.space-track.org"
LOGIN_URL = f"{SPACETRACK_BASE}/ajaxauth/login"


class SpaceTrackClient:
    """
    Authenticated client for Space-Track.org REST API.

    Usage:
        client = SpaceTrackClient()
        client.login()
        tles = client.fetch_gp_json(norad_ids=[25544])
        client.logout()
    """

    def __init__(self):
        self.session = requests.Session()
        self.authenticated = False
        self.username = os.getenv("SPACETRACK_USER", "")
        self.password = os.getenv("SPACETRACK_PASSWORD", "")

    def login(self) -> bool:
        """Authenticate with Space-Track.org."""
        if not self.username or not self.password:
            logger.warning("SPACETRACK_USER/SPACETRACK_PASSWORD not set, skipping Space-Track login")
            return False

        try:
            resp = self.session.post(LOGIN_URL, data={
                "identity": self.username,
                "password": self.password,
            }, timeout=30)
            resp.raise_for_status()
            self.authenticated = True
            logger.info("Space-Track.org authentication successful")
            return True
        except Exception as e:
            logger.error(f"Space-Track.org login failed: {e}")
            return False

    def logout(self):
        """Close session."""
        self.session.close()
        self.authenticated = False

    def fetch_gp_json(
        self,
        norad_ids: Optional[List[int]] = None,
        epoch_days: int = 30,
        limit: int = 1000,
    ) -> List[Dict[str, Any]]:
        """
        Fetch GP (General Perturbations) data in JSON OMM format.

        This is the modern replacement for 3-line TLE format.
        Returns real orbital elements from Space-Track.org.
        """
        if not self.authenticated:
            logger.warning("Not authenticated, attempting login")
            if not self.login():
                return []

        try:
            # Build query URL
            base = f"{SPACETRACK_BASE}/basicspacedata/query"
            query_parts = [
                "class/gp",
                "format/json",
                f"limit/{limit}",
                "orderby/EPOCH desc",
                f"EPOCH/>now-{epoch_days}",
            ]

            if norad_ids:
                id_str = ",".join(str(n) for n in norad_ids)
                query_parts.append(f"NORAD_CAT_ID/{id_str}")

            url = f"{base}/{'/'.join(query_parts)}"
            resp = self.session.get(url, timeout=60)
            resp.raise_for_status()

            data = resp.json()
            logger.info(f"Fetched {len(data)} GP records from Space-Track.org")
            return data

        except Exception as e:
            logger.error(f"Space-Track GP fetch failed: {e}")
            return []

    def fetch_tle_3le(
        self,
        norad_ids: Optional[List[int]] = None,
        limit: int = 1000,
    ) -> List[Dict[str, str]]:
        """
        Fetch traditional 3-line TLE data.

        Returns list of dicts with keys: name, line1, line2
        """
        if not self.authenticated:
            if not self.login():
                return []

        try:
            base = f"{SPACETRACK_BASE}/basicspacedata/query"
            query_parts = [
                "class/tle_latest",
                "format/3le",
                f"limit/{limit}",
                "orderby/NORAD_CAT_ID",
                "ORDINAL/1",  # Latest only
            ]

            if norad_ids:
                id_str = ",".join(str(n) for n in norad_ids)
                query_parts.append(f"NORAD_CAT_ID/{id_str}")

            url = f"{base}/{'/'.join(query_parts)}"
            resp = self.session.get(url, timeout=60)
            resp.raise_for_status()

            text = resp.text.strip()
            lines = [line.strip() for line in text.split('\n') if line.strip()]

            results = []
            for i in range(0, len(lines), 3):
                if i + 2 >= len(lines):
                    break
                results.append({
                    "name": lines[i],
                    "line1": lines[i + 1],
                    "line2": lines[i + 2],
                })

            logger.info(f"Fetched {len(results)} TLEs from Space-Track.org")
            return results

        except Exception as e:
            logger.error(f"Space-Track TLE fetch failed: {e}")
            return []

    def fetch_omm_json(
        self,
        norad_ids: Optional[List[int]] = None,
        limit: int = 500,
    ) -> List[Dict[str, Any]]:
        """
        Fetch OMM (Orbit Mean-elements Message) in JSON format.

        OMM is the CCSDS standard for orbital data exchange.
        Fields include: MEAN_MOTION, ECCENTRICITY, INCLINATION,
        RA_OF_ASC_NODE, ARG_OF_PERICENTER, MEAN_ANOMALY, etc.
        """
        if not self.authenticated:
            if not self.login():
                return []

        try:
            base = f"{SPACETRACK_BASE}/basicspacedata/query"
            query_parts = [
                "class/gp",
                "format/json",
                f"limit/{limit}",
                "orderby/EPOCH desc",
            ]

            if norad_ids:
                id_str = ",".join(str(n) for n in norad_ids)
                query_parts.append(f"NORAD_CAT_ID/{id_str}")

            url = f"{base}/{'/'.join(query_parts)}"
            resp = self.session.get(url, timeout=60)
            resp.raise_for_status()

            return resp.json()

        except Exception as e:
            logger.error(f"Space-Track OMM fetch failed: {e}")
            return []


def parse_omm_to_tle_params(omm: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert OMM JSON record to normalized orbital parameters.

    This bridges the GP/OMM format to our internal TLE structure.
    """
    return {
        "norad_id": int(omm.get("NORAD_CAT_ID", 0)),
        "name": omm.get("OBJECT_NAME", ""),
        "epoch": omm.get("EPOCH", ""),
        "mean_motion": float(omm.get("MEAN_MOTION", 0)),
        "eccentricity": float(omm.get("ECCENTRICITY", 0)),
        "inclination": float(omm.get("INCLINATION", 0)),
        "raan": float(omm.get("RA_OF_ASC_NODE", 0)),
        "arg_perigee": float(omm.get("ARG_OF_PERICENTER", 0)),
        "mean_anomaly": float(omm.get("MEAN_ANOMALY", 0)),
        "bstar": float(omm.get("BSTAR", 0)),
        "element_set_no": int(omm.get("ELEMENT_SET_NO", 0)),
        "rev_at_epoch": int(omm.get("REV_AT_EPOCH", 0)),
        "classification": omm.get("CLASSIFICATION_TYPE", "U"),
        "object_type": omm.get("OBJECT_TYPE", ""),
        "country_code": omm.get("COUNTRY_CODE", ""),
        "launch_date": omm.get("LAUNCH_DATE", ""),
        "tle_line1": omm.get("TLE_LINE1", ""),
        "tle_line2": omm.get("TLE_LINE2", ""),
    }

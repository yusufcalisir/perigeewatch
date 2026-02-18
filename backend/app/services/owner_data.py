"""
Owner/Operator Data Service

Parses and enriches satellite records with ownership data from
public databases (UCS Satellite Database format).

This service:
1. Loads owner/operator CSV data
2. Maps NORAD IDs to owner info
3. Enriches Satellite model records
"""

import csv
import io
import logging
from typing import Dict, Any, List, Optional
from datetime import date
from sqlalchemy.orm import Session
from app.models.satellite import Satellite

logger = logging.getLogger(__name__)


def parse_ucs_csv(csv_text: str) -> List[Dict[str, Any]]:
    """
    Parse UCS Satellite Database CSV format.

    Expected columns (flexible matching):
    - NORAD Number / NORAD_CAT_ID
    - Current Official Name of Satellite
    - Country/Org of UN Registry
    - Operator/Owner
    - Purpose
    - Class of Orbit (LEO/MEO/GEO/Elliptical)
    - Date of Launch
    - Launch Site
    """
    records = []

    reader = csv.DictReader(io.StringIO(csv_text))
    fieldnames = reader.fieldnames or []

    # Flexible column name mapping
    def find_col(candidates: List[str]) -> Optional[str]:
        for c in candidates:
            for f in fieldnames:
                if c.lower() in f.lower():
                    return f
        return None

    norad_col = find_col(["NORAD", "norad_cat_id", "norad_number", "catalog"])
    name_col = find_col(["Official Name", "object_name", "satellite_name", "name"])
    country_col = find_col(["Country", "country_code", "UN Registry"])
    owner_col = find_col(["Owner", "Operator"])
    purpose_col = find_col(["Purpose", "use"])
    orbit_col = find_col(["Class of Orbit", "orbit_class", "orbit_type"])
    launch_date_col = find_col(["Date of Launch", "launch_date"])
    launch_site_col = find_col(["Launch Site", "launch_location"])

    for row in reader:
        try:
            norad_str = row.get(norad_col or "", "").strip()
            if not norad_str or not norad_str.isdigit():
                continue

            record: Dict[str, Any] = {
                "norad_id": int(norad_str),
                "name": row.get(name_col or "", "").strip() or None,
                "country_code": row.get(country_col or "", "").strip()[:10] or None,
                "owner": row.get(owner_col or "", "").strip() or None,
                "purpose": row.get(purpose_col or "", "").strip() or None,
                "orbit_class": row.get(orbit_col or "", "").strip()[:10] or None,
                "launch_site": row.get(launch_site_col or "", "").strip() or None,
            }

            # Parse launch date
            launch_str = row.get(launch_date_col or "", "").strip()
            if launch_str:
                for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d"):
                    try:
                        record["launch_date"] = date.fromisoformat(launch_str) if "-" in launch_str else None
                        d = None
                        try:
                            d = date.fromisoformat(launch_str)
                        except ValueError:
                            from datetime import datetime as dt
                            d = dt.strptime(launch_str, fmt).date()
                        record["launch_date"] = d
                        break
                    except (ValueError, TypeError):
                        continue

            records.append(record)
        except Exception as e:
            logger.debug(f"Skipping row: {e}")
            continue

    logger.info(f"Parsed {len(records)} owner records from UCS CSV")
    return records


def enrich_satellites_from_ucs(db: Session, records: List[Dict[str, Any]]) -> int:
    """
    Update Satellite model records with owner/operator data.

    Returns the number of satellites updated.
    """
    # Build lookup by norad_id
    norad_map = {r["norad_id"]: r for r in records}
    if not norad_map:
        return 0

    # Fetch matching satellites
    satellites = db.query(Satellite).filter(
        Satellite.norad_id.in_(list(norad_map.keys()))
    ).all()

    updated = 0
    for sat in satellites:
        record = norad_map.get(sat.norad_id)
        if not record:
            continue

        changed = False
        for field in ("owner", "country_code", "purpose", "orbit_class", "launch_site", "launch_date"):
            val = record.get(field)
            if val and not getattr(sat, field, None):
                setattr(sat, field, val)
                changed = True

        # Also set operator if owner is available
        if record.get("owner") and not sat.operator:
            sat.operator = record["owner"]
            changed = True

        if changed:
            updated += 1

    if updated > 0:
        db.commit()
        logger.info(f"Enriched {updated} satellites with owner/operator data")

    return updated


def get_satellite_profile(db: Session, norad_id: int) -> Optional[Dict[str, Any]]:
    """
    Get full satellite profile including owner/operator metadata.
    """
    sat = db.query(Satellite).filter(Satellite.norad_id == norad_id).first()
    if not sat:
        return None

    return {
        "norad_id": sat.norad_id,
        "name": sat.name,
        "int_designator": sat.int_designator,
        "object_type": sat.object_type.value if sat.object_type else None,
        "is_active": sat.is_active,
        "owner": sat.owner,
        "operator": sat.operator,
        "country_code": sat.country_code,
        "launch_date": str(sat.launch_date) if sat.launch_date else None,
        "launch_site": sat.launch_site,
        "purpose": sat.purpose,
        "orbit_class": sat.orbit_class,
    }

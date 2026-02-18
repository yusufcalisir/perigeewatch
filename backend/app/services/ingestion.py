import requests

from sqlalchemy.orm import Session
from app.models.satellite import Satellite, ObjectType
from app.models.tle import TLE
from app.core.config import settings
from app.services.space_track import SpaceTrackClient, parse_omm_to_tle_params
from datetime import datetime
from sgp4.api import Satrec, WGS72
import logging

logger = logging.getLogger(__name__)

def jd_to_datetime(jd: float) -> datetime:
    """Convert Julian Date to UTC datetime."""
    # JD of Unix Epoch (1970-01-01 00:00:00 UTC) is 2440587.5
    unix_timestamp = (jd - 2440587.5) * 86400.0
    return datetime.utcfromtimestamp(unix_timestamp)

def fetch_and_store_tles(db: Session) -> int:
    """
    Fetch TLEs from multiple sources:
    1. CelesTrak (Public, wide coverage)
    2. Space-Track.org (Authenticated, 18th SDS official data) - Optional
    """
    
    # ── Source 1: CelesTrak ──────────────────────────────────────────────
    try:
        logger.info(f"Fetching TLEs from {settings.CELESTRAK_URL}...")
        response = requests.get(settings.CELESTRAK_URL, timeout=60)
        response.raise_for_status()
        celestrak_lines = response.text.strip().split('\n')
    except Exception as e:
        logger.error(f"Error fetching from CelesTrak: {e}")
        celestrak_lines = []

    # ── Source 2: Space-Track.org ────────────────────────────────────────
    spacetrack_data = []
    st_client = SpaceTrackClient()
    if st_client.username and st_client.password:
        try:
            logger.info("Fetching OMM data from Space-Track.org...")
            st_client.login()
            # Fetch last 30 days of data for active satellites (limit for performance)
            spacetrack_data = st_client.fetch_gp_json(limit=2000, epoch_days=3)
            logger.info(f"Fetched {len(spacetrack_data)} records from Space-Track")
        except Exception as e:
            logger.error(f"Error fetching from Space-Track: {e}")
    else:
        logger.info("Skipping Space-Track (credentials not set)")

    # ── Processing ───────────────────────────────────────────────────────
    
    # Pre-load existing satellites: norad_id -> id
    logger.info("Loading existing satellites map...")
    existing_sats = db.query(Satellite.norad_id, Satellite.id).all()
    sat_map = {row.norad_id: row.id for row in existing_sats}
    
    # Pre-load latest TLE epochs
    logger.info("Loading latest TLE epochs...")
    from sqlalchemy import func
    latest_epochs_query = db.query(TLE.satellite_id, func.max(TLE.epoch)).group_by(TLE.satellite_id).all()
    latest_epoch_map = {row[0]: row[1] for row in latest_epochs_query}

    satellites_to_add = []
    tles_to_add = []
    processed_norads = set()
    
    parsed_data = [] # List of dicts

    # Helper to process parsed items
    def add_parsed_item(item):
        if item['norad_id'] in processed_norads:
            return # Duplicate in this batch
        processed_norads.add(item['norad_id'])
        parsed_data.append(item)

    # 1. Process Space-Track Data (High Priority)
    for omm in spacetrack_data:
        try:
            params = parse_omm_to_tle_params(omm)
            if not params['tle_line1'] or not params['tle_line2']:
                continue
                
            # Convert epoch string to datetime
            epoch_dt = datetime.fromisoformat(params['epoch']) if isinstance(params['epoch'], str) else params['epoch']

            obj_type = ObjectType.UNKNOWN
            if params['object_type'] == 'PAYLOAD':
                obj_type = ObjectType.PAYLOAD
            elif params['object_type'] == 'ROCKET BODY':
                obj_type = ObjectType.ROCKET_BODY
            elif params['object_type'] == 'DEBRIS':
                obj_type = ObjectType.DEBRIS

            add_parsed_item({
                "norad_id": params['norad_id'],
                "name": params['name'],
                "line1": params['tle_line1'],
                "line2": params['tle_line2'],
                "epoch": epoch_dt,
                "int_designator": omm.get("INTLDES", ""),
                "object_type": obj_type,
                "source": "spacetrack"
            })
        except Exception:
            continue

    # 2. Process CelesTrak Data (Fallback/Supplement)
    celestrak_lines = [line.strip() for line in celestrak_lines if line.strip()]
    for i in range(0, len(celestrak_lines), 3):
        if i+2 >= len(celestrak_lines):
            break
        
        name = celestrak_lines[i]
        line1 = celestrak_lines[i+1]
        line2 = celestrak_lines[i+2]
        
        if not (line1.startswith('1 ') and line2.startswith('2 ')):
            continue

        try:
            # Quick parse for ID
            norad_id = int(line1[2:7])
            
            # Skip if we already have this from Space-Track (higher quality)
            if norad_id in processed_norads:
                continue

            satellite = Satrec.twoline2rv(line1, line2, WGS72)
            epoch = jd_to_datetime(satellite.jdsatepoch)
            
            obj_type = ObjectType.PAYLOAD
            if "DEB" in name:
                obj_type = ObjectType.DEBRIS
            elif "R/B" in name:
                obj_type = ObjectType.ROCKET_BODY
            
            add_parsed_item({
                "norad_id": norad_id,
                "name": name,
                "line1": line1,
                "line2": line2,
                "epoch": epoch,
                "int_designator": line1[9:17].strip(),
                "object_type": obj_type,
                "source": "celestrak"
            })
        except Exception:
            continue

    # ── Database Operations ──────────────────────────────────────────────

    # Identify new satellites
    for item in parsed_data:
        if item["norad_id"] not in sat_map:
             satellites_to_add.append(Satellite(
                norad_id=item["norad_id"],
                name=item["name"],
                int_designator=item["int_designator"],
                object_type=item["object_type"],
                is_active=True
            ))
             sat_map[item["norad_id"]] = None # Placeholder

    if satellites_to_add:
        logger.info(f"Adding {len(satellites_to_add)} new satellites...")
        db.add_all(satellites_to_add)
        db.commit()
        # Refresh map
        for sat in satellites_to_add:
            sat_map[sat.norad_id] = sat.id
    
    # Prepare TLEs
    logger.info("Processing TLE records...")
    for item in parsed_data:
        sat_id = sat_map.get(item["norad_id"])
        if not sat_id:
            continue

        last_epoch = latest_epoch_map.get(sat_id)
        if last_epoch and item["epoch"] <= last_epoch:
             continue # Skip old data

        tles_to_add.append(TLE(
            satellite_id=sat_id,
            epoch=item["epoch"],
            line1=item["line1"],
            line2=item["line2"],
            source=item["source"],
            fetched_at=datetime.utcnow()
        ))
        latest_epoch_map[sat_id] = item["epoch"]

    if tles_to_add:
        logger.info(f"Adding {len(tles_to_add)} new TLE records...")
        db.bulk_save_objects(tles_to_add)
        db.commit()
    
    count = len(tles_to_add)
    logger.info(f"Ingestion complete. Processed {len(parsed_data)} unique satellites. New TLEs: {count}")
    return count


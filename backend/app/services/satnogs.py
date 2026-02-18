"""
SatNOGS DB API Client

Fetches satellite transmitter/transponder data from the open-source SatNOGS Database.
https://db.satnogs.org/
"""

import requests
import logging
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.models.satellite import Satellite
from app.models.transponder import Transponder
from datetime import datetime

logger = logging.getLogger(__name__)

SATNOGS_API_BASE = "https://db.satnogs.org/api"

class SatNOGSClient:
    def __init__(self):
        self.session = requests.Session()
        # SatNOGS DB is public, but it's good practice to set a User-Agent
        self.session.headers.update({
            "User-Agent": "PerigeeWatch/2.0 (https://github.com/perigee-watch)"
        })

    def fetch_transmitters(self, norad_id: int) -> List[Dict[str, Any]]:
        """
        Fetch transmitters for a given NORAD ID.
        
        Strategy:
        1. Query /satellites/?norad_cat_id={id} to get SatNOGS internal ID.
        2. Query /transmitters/?satellite__norad_cat_id={id} (if supported) 
           OR /transmitters/?satellite={satnogs_id}
        """
        try:
            # Direct filter by norad_cat_id on transmitters endpoint is usually supported
            # or we can try filtering on the satellite relation
            url = f"{SATNOGS_API_BASE}/transmitters/?satellite__norad_cat_id={norad_id}&format=json"
            resp = self.session.get(url, timeout=10)
            
            if resp.status_code == 404:
                return []
            resp.raise_for_status()
            
            return resp.json()
        except Exception as e:
            logger.error(f"Error fetching SatNOGS transmitters for {norad_id}: {e}")
            return []

    def sync_transponders(self, db: Session, norad_id: int) -> int:
        """
        Fetch and sync transponders for a satellite.
        """
        sat = db.query(Satellite).filter(Satellite.norad_id == norad_id).first()
        if not sat:
            logger.warning(f"Satellite {norad_id} not found in DB")
            return 0

        data = self.fetch_transmitters(norad_id)
        if not data:
            return 0

        # Clear existing (simple strategy: replace all)
        # In a production system, we might want to update or soft-delete
        db.query(Transponder).filter(Transponder.satellite_id == sat.id).delete()
        
        added_count = 0
        for tx in data:
            # SatNOGS fields: 
            # uplink_low, uplink_high, downlink_low, downlink_high (Hz)
            # mode, baud, type, description
            
            try:
                # Convert Hz to MHz
                ul_low = tx.get("uplink_low")
                ul_high = tx.get("uplink_high")
                dl_low = tx.get("downlink_low")
                dl_high = tx.get("downlink_high")
                
                t = Transponder(
                    satellite_id=sat.id,
                    uplink_low=ul_low / 1e6 if ul_low else None,
                    uplink_high=ul_high / 1e6 if ul_high else None,
                    downlink_low=dl_low / 1e6 if dl_low else None,
                    downlink_high=dl_high / 1e6 if dl_high else None,
                    mode=tx.get("mode"),
                    baud=tx.get("baud"),
                    description=tx.get("description"),
                    itu_status="Registered" if tx.get("status") == "active" else "Unknown",
                    fetched_at=datetime.utcnow()
                )
                db.add(t)
                added_count += 1
            except Exception as e:
                logger.error(f"Error parsing transmitter: {e}")
                continue

        if added_count > 0:
            db.commit()
            logger.info(f"Synced {added_count} transponders for {norad_id}")
            
        return added_count

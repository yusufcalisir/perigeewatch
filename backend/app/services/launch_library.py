import httpx
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

LL2_API_URL = "https://ll.thespacedevs.com/2.2.0/launch/upcoming/"

# Simple in-memory cache
_cache: Dict[str, Any] = {
    "data": None,
    "expires_at": datetime.min
}
CACHE_DURATION_MINUTES = 30

async def fetch_upcoming_launches(limit: int = 10) -> List[Dict[str, Any]]:
    """
    Fetch upcoming launches from The Space Devs (LL2) API.
    Uses in-memory caching to respect rate limits.
    """
    global _cache
    
    now = datetime.utcnow()
    
    # Return cached data if valid
    if _cache["data"] and _cache["expires_at"] > now:
        logger.info("Returning cached launch data")
        return _cache["data"][:limit]

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(LL2_API_URL, params={"limit": limit, "mode": "detailed"})
            resp.raise_for_status()
            data = resp.json()
            
            results = []
            for launch in data.get("results", []):
                # Extract simplified data structure
                launch_data = {
                    "id": launch.get("id"),
                    "name": launch.get("name"),
                    "status": _map_status(launch.get("status", {}).get("abbrev")),
                    "date": launch.get("net"),
                    "vehicle": launch.get("rocket", {}).get("configuration", {}).get("name"),
                    "site_name": launch.get("pad", {}).get("location", {}).get("name"),
                    "pad_name": launch.get("pad", {}).get("name"),
                    "pad_lat": _to_float(launch.get("pad", {}).get("latitude")),
                    "pad_lon": _to_float(launch.get("pad", {}).get("longitude")),
                    "orbit": launch.get("mission", {}).get("orbit", {}).get("abbrev") if launch.get("mission") else "N/A",
                    "description": launch.get("mission", {}).get("description")
                }
                results.append(launch_data)
            
            # Update cache
            _cache["data"] = results
            _cache["expires_at"] = now + timedelta(minutes=CACHE_DURATION_MINUTES)
            logger.info(f"Cached {len(results)} upcoming launches")
            
            return results[:limit]
            
    except Exception as e:
        logger.error(f"Failed to fetch launch data: {e}")
        # Return stale data if available, otherwise empty list
        if _cache["data"]:
            logger.warning("Returning stale launch data due to fetch failure")
            return _cache["data"][:limit]
        return []

def _to_float(val) -> Optional[float]:
    """Safely convert string coordinates to float."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None

def _map_status(abbrev: str) -> str:
    if abbrev == "Go": return "GO"
    if abbrev == "Success": return "SUCCESS"
    if abbrev == "Hold": return "HOLD"
    if abbrev == "TBD": return "TBD"
    return "TBD"

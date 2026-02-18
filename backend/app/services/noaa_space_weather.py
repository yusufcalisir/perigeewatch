import httpx
import logging
import asyncio
from typing import Dict, Any

logger = logging.getLogger(__name__)

NOAA_BASE_URL = "https://services.swpc.noaa.gov"

# In-memory cache
_cache: Dict[str, Any] = {
    "data": None,
    "timestamp": 0
}
CACHE_TTL_SECONDS = 300  # 5 minutes

async def fetch_noaa_data(url: str) -> Any:
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, timeout=10.0)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.error(f"Failed to fetch NOAA data from {url}: {e}")
            return None

async def get_aggregated_space_weather() -> Dict[str, Any]:
    global _cache
    import time
    now = time.time()

    if _cache["data"] and (now - _cache["timestamp"] < CACHE_TTL_SECONDS):
        return _cache["data"]

    # URLs
    kp_url = f"{NOAA_BASE_URL}/products/noaa-planetary-k-index.json"
    solar_wind_url = f"{NOAA_BASE_URL}/products/summary/solar-wind-speed.json"
    mag_field_url = f"{NOAA_BASE_URL}/products/summary/solar-wind-mag-field.json"

    # Fetch in parallel
    kp_data, solar_wind, mag_field = await asyncio.gather(
        fetch_noaa_data(kp_url),
        fetch_noaa_data(solar_wind_url),
        fetch_noaa_data(mag_field_url)
    )

    # Process Kp Data (array of arrays)
    kp_history = []
    current_kp = 0
    if kp_data and isinstance(kp_data, list):
        # Format: [time_tag, kp, a_running, station_count]
        # Skip header
        for row in kp_data[1:]:
            try:
                kp_history.append({
                    "time": row[0],
                    "kp": float(row[1]),
                    "aRunning": int(row[2]),
                    "stationCount": int(row[3])
                })
            except (ValueError, IndexError):
                continue
        
        if kp_history:
            current_kp = kp_history[-1]["kp"]

    # Process Solar Wind
    sw_speed = 0.0
    sw_time = ""
    if solar_wind:
        sw_speed = float(solar_wind.get("WindSpeed", 0))
        sw_time = solar_wind.get("TimeStamp", "")

    # Process Mag Field
    bt = 0.0
    bz = 0.0
    mag_time = ""
    if mag_field:
        bt = float(mag_field.get("Bt", 0))
        bz = float(mag_field.get("Bz", 0))
        mag_time = mag_field.get("TimeStamp", "")

    result = {
        "kpCurrent": current_kp,
        "kpHistory": kp_history,
        "solarWind": {
            "speed": sw_speed,
            "timestamp": sw_time
        },
        "magField": {
            "bt": bt,
            "bz": bz,
            "timestamp": mag_time
        }
    }

    _cache["data"] = result
    _cache["timestamp"] = now
    
    return result

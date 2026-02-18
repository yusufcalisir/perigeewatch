from fastapi import APIRouter
from typing import Dict, Any
from app.services.noaa_space_weather import get_aggregated_space_weather

router = APIRouter()

@router.get("/live", response_model=Dict[str, Any])
async def get_space_weather():
    """
    Get live space weather data from NOAA SWPC.
    Cached for 5 minutes.
    """
    data = await get_aggregated_space_weather()
    return data

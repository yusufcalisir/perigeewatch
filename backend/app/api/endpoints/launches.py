from fastapi import APIRouter
from typing import List, Any, Dict
from app.services.launch_library import fetch_upcoming_launches

router = APIRouter()

@router.get("/upcoming", response_model=List[Dict[str, Any]])
async def get_upcoming_launches(limit: int = 10):
    """
    Get upcoming launches from Launch Library 2 (cached).
    """
    launches = await fetch_upcoming_launches(limit)
    return launches

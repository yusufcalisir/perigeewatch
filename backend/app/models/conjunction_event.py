from sqlalchemy import Column, Integer, Float, String, DateTime
from app.db.base_class import Base
from datetime import datetime


class ConjunctionEvent(Base):
    """Persisted conjunction (close approach) event."""
    id = Column(Integer, primary_key=True, index=True)
    sat1_norad = Column(Integer, nullable=False, index=True)
    sat1_name = Column(String, nullable=False)
    sat2_norad = Column(Integer, nullable=False, index=True)
    sat2_name = Column(String, nullable=False)
    distance_km = Column(Float, nullable=False)
    risk_level = Column(String, nullable=False)  # CRITICAL, HIGH, MODERATE, LOW
    event_time = Column(DateTime, nullable=False, index=True)
    detected_at = Column(DateTime, default=datetime.utcnow)
    # Geodetic positions at time of closest approach
    sat1_lat = Column(Float)
    sat1_lon = Column(Float)
    sat1_alt = Column(Float)
    sat2_lat = Column(Float)
    sat2_lon = Column(Float)
    sat2_alt = Column(Float)

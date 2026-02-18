from sqlalchemy import Column, Integer, String, Boolean, Enum, DateTime, Date
from sqlalchemy.orm import relationship
from app.db.base_class import Base
import enum
from datetime import datetime

class ObjectType(str, enum.Enum):
    PAYLOAD = "PAYLOAD"
    ROCKET_BODY = "ROCKET_BODY"
    DEBRIS = "DEBRIS"
    UNKNOWN = "UNKNOWN"

class Satellite(Base):
    id = Column(Integer, primary_key=True, index=True)
    norad_id = Column(Integer, unique=True, index=True, nullable=False)
    name = Column(String, index=True)
    int_designator = Column(String, index=True)
    object_type = Column(Enum(ObjectType), default=ObjectType.UNKNOWN)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Owner/Operator metadata (UCS Satellite DB fields)
    owner = Column(String, nullable=True)
    operator = Column(String, nullable=True)
    country_code = Column(String(10), nullable=True)
    launch_date = Column(Date, nullable=True)
    launch_site = Column(String, nullable=True)
    purpose = Column(String, nullable=True)
    orbit_class = Column(String(10), nullable=True)  # LEO, MEO, GEO, HEO

    tles = relationship("TLE", back_populates="satellite")
    transponders = relationship("Transponder", back_populates="satellite")


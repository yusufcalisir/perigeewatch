from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.base_class import Base
from datetime import datetime

class TLE(Base):
    id = Column(Integer, primary_key=True, index=True)
    satellite_id = Column(Integer, ForeignKey("satellite.id"), nullable=False)
    epoch = Column(DateTime, nullable=False, index=True)
    line1 = Column(String, nullable=False)
    line2 = Column(String, nullable=False)
    source = Column(String, default="celestrak")
    fetched_at = Column(DateTime, default=datetime.utcnow)
    
    satellite = relationship("Satellite", back_populates="tles")

    __table_args__ = (
        UniqueConstraint('satellite_id', 'epoch', name='_satellite_epoch_uc'),
    )

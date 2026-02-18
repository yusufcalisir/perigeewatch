from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from app.db.base_class import Base
from datetime import datetime

class Transponder(Base):
    id = Column(Integer, primary_key=True, index=True)
    satellite_id = Column(Integer, ForeignKey("satellite.id"), nullable=False)
    
    # Frequency data (MHz)
    uplink_low = Column(Float, nullable=True)
    uplink_high = Column(Float, nullable=True)
    downlink_low = Column(Float, nullable=True)
    downlink_high = Column(Float, nullable=True)
    
    # Mode/Modulation (e.g. 'FM', 'SSB', 'CW', 'LoRa')
    mode = Column(String, nullable=True)
    baud = Column(Float, nullable=True)
    
    # Band (e.g. 'UHF', 'VHF', 'L-Band', 'S-Band', 'X-Band')
    description = Column(String, nullable=True) 
    
    # ITU status (placeholder for future expansion)
    itu_status = Column(String, nullable=True)

    fetched_at = Column(DateTime, default=datetime.utcnow)

    satellite = relationship("Satellite", back_populates="transponders")

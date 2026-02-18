"""
User Model

Stores user accounts, preferences, and API keys.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from app.db.base_class import Base
from datetime import datetime


class User(Base):
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    name = Column(String, default="")
    
    # API access
    api_key = Column(String, unique=True, nullable=True, index=True)
    
    # Preferences (JSON string)
    preferences = Column(Text, default="{}")
    
    # Account status
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

from sqlalchemy import Column, String, DateTime, Boolean, Text
from datetime import datetime
import uuid
from app.core.database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class GoogleAccount(Base):
    __tablename__ = "google_accounts"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_email = Column(String(255), index=True, nullable=False)
    sender_email = Column(String(255), unique=True, index=True, nullable=False)
    encrypted_refresh_token = Column(Text, nullable=False)
    account_type = Column(String(50), default="consumer") # consumer or workspace
    daily_quota_limit = Column(String(20), default="100")
    is_primary = Column(Boolean, default=False)
    connected_at = Column(DateTime, default=datetime.utcnow)

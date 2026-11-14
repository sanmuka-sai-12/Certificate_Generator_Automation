from sqlalchemy import Column, String, Integer, DateTime, Text
from datetime import datetime
import uuid
from app.core.database import Base

class EmailLog(Base):
    __tablename__ = "email_logs"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), index=True, nullable=False)
    participant_id = Column(String(36), index=True, nullable=False)
    recipient_email = Column(String(255), nullable=False)
    sender_email = Column(String(255), nullable=False)
    status = Column(String(50), nullable=False) # Sent, Failed, Bounced
    error_message = Column(Text, nullable=True)
    message_id = Column(String(255), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

from sqlalchemy import Column, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from app.core.database import Base

class Project(Base):
    __tablename__ = "projects"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4())[:8])
    user_email = Column(String(255), index=True, nullable=False)
    name = Column(String(255), nullable=False)
    organization = Column(String(255), nullable=True)
    event_name = Column(String(255), nullable=True)
    event_date = Column(String(50), nullable=True)
    cert_type = Column(String(100), default="Participation")
    template_id = Column(String(36), nullable=True)
    sender_email = Column(String(255), nullable=True)
    status = Column(String(50), default="draft") # draft, generating, sending, finished
    
    # Drive storage references
    drive_folder_id = Column(String(255), nullable=True)
    certificates_folder_id = Column(String(255), nullable=True)
    
    # Email configuration
    email_subject = Column(String(255), nullable=True)
    email_body = Column(Text, nullable=True)
    batch_size = Column(String(20), default="50")
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    participants = relationship("Participant", back_populates="project", cascade="all, delete-orphan")

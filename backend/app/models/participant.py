from sqlalchemy import Column, String, Integer, DateTime, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from app.core.database import Base

class Participant(Base):
    __tablename__ = "participants"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False)
    
    name = Column(String(255), nullable=False)
    email = Column(String(255), index=True, nullable=False)
    cert_type = Column(String(100), default="Participation")
    college = Column(String(255), nullable=True)
    department = Column(String(255), nullable=True)
    reg_no = Column(String(100), nullable=True)
    position = Column(String(100), nullable=True)
    custom_fields = Column(JSON, nullable=True)
    
    # Verification & Security
    cert_id = Column(String(100), unique=True, index=True, nullable=False)
    verify_token = Column(String(64), index=True, nullable=False)
    validity = Column(String(50), default="valid") # valid, revoked, invalid
    
    # PDF generation state
    pdf_drive_file_id = Column(String(255), nullable=True)
    pdf_local_path = Column(String(255), nullable=True)
    gen_status = Column(String(50), default="Pending") # Pending, Processing, Generated, Failed
    
    # Email engine state machine
    # Pending -> Processing -> Sent / Failed / Uncertain / Skipped
    email_status = Column(String(50), default="Pending")
    attempts = Column(Integer, default=0)
    last_error = Column(Text, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    message_id = Column(String(255), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    project = relationship("Project", back_populates="participants")

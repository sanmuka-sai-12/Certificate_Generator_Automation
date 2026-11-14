from sqlalchemy import Column, String, DateTime, Text, Integer, JSON
from datetime import datetime
import uuid
from app.core.database import Base

class CertificateTemplate(Base):
    __tablename__ = "templates"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4())[:8])
    user_email = Column(String(255), index=True, nullable=False)
    name = Column(String(255), nullable=False)
    width = Column(Integer, default=3508)
    height = Column(Integer, default=2480)
    orientation = Column(String(20), default="landscape")
    template_json = Column(JSON, nullable=False)
    thumbnail_data_url = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ProjectBase(BaseModel):
    name: str
    organization: Optional[str] = None
    event_name: Optional[str] = None
    event_date: Optional[str] = None
    cert_type: Optional[str] = "Participation"
    template_id: Optional[str] = None
    sender_email: Optional[str] = None

class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    organization: Optional[str] = None
    event_name: Optional[str] = None
    event_date: Optional[str] = None
    cert_type: Optional[str] = None
    template_id: Optional[str] = None
    sender_email: Optional[str] = None
    status: Optional[str] = None
    email_subject: Optional[str] = None
    email_body: Optional[str] = None
    batch_size: Optional[str] = None

class ProjectResponse(ProjectBase):
    id: str
    user_email: str
    status: str
    drive_folder_id: Optional[str] = None
    email_subject: Optional[str] = None
    email_body: Optional[str] = None
    batch_size: Optional[str] = "50"
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

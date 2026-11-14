from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any, List
from datetime import datetime

class ParticipantCreate(BaseModel):
    name: str
    email: EmailStr
    college: Optional[str] = None
    department: Optional[str] = None
    reg_no: Optional[str] = None
    position: Optional[str] = None
    cert_type: Optional[str] = "Participation"
    custom_fields: Optional[Dict[str, Any]] = None

class ParticipantBulkImport(BaseModel):
    participants: List[ParticipantCreate]
    prefix: Optional[str] = "CERT"

class ParticipantResponse(BaseModel):
    id: str
    project_id: str
    name: str
    email: str
    cert_type: str
    college: Optional[str] = None
    department: Optional[str] = None
    reg_no: Optional[str] = None
    position: Optional[str] = None
    cert_id: str
    verify_token: str
    validity: str
    pdf_drive_file_id: Optional[str] = None
    gen_status: str
    email_status: str
    attempts: int
    last_error: Optional[str] = None
    sent_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ParticipantStats(BaseModel):
    total: int
    generated: int
    sent: int
    pending: int
    failed: int
    uncertain: int

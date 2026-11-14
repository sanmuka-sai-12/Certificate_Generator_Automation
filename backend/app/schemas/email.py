from pydantic import BaseModel, EmailStr
from typing import Optional, Dict

class EmailTemplateConfig(BaseModel):
    subject: str
    body: str

class EmailTestRequest(BaseModel):
    project_id: str
    participant_id: Optional[str] = None
    recipient_email: EmailStr

class BatchSendRequest(BaseModel):
    project_id: str
    batch_size: Optional[int] = 50
    sender_email: Optional[str] = None

class BatchProgressResponse(BaseModel):
    project_id: str
    state: str # idle, running, paused, finished
    counts: Dict[str, int]
    total: int
    quota_remaining: int

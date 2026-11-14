from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime

class TemplateCreate(BaseModel):
    name: str
    width: Optional[int] = 3508
    height: Optional[int] = 2480
    orientation: Optional[str] = "landscape"
    template_json: Dict[str, Any]
    thumbnail_data_url: Optional[str] = None

class TemplateResponse(BaseModel):
    id: str
    user_email: str
    name: str
    width: int
    height: int
    orientation: str
    template_json: Dict[str, Any]
    thumbnail_data_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

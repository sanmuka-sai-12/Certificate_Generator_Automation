from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.template import CertificateTemplate
from app.schemas.template import TemplateCreate, TemplateResponse

router = APIRouter()

@router.post("", response_model=TemplateResponse)
def create_template(payload: TemplateCreate, user_email: str = "default_user@example.com", db: Session = Depends(get_db)):
    template = CertificateTemplate(
        user_email=user_email,
        name=payload.name,
        width=payload.width or 3508,
        height=payload.height or 2480,
        orientation=payload.orientation or "landscape",
        template_json=payload.template_json,
        thumbnail_data_url=payload.thumbnail_data_url
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template

@router.get("", response_model=List[TemplateResponse])
def list_templates(user_email: str = "default_user@example.com", db: Session = Depends(get_db)):
    return db.query(CertificateTemplate).filter(CertificateTemplate.user_email == user_email).all()

@router.get("/{template_id}", response_model=TemplateResponse)
def get_template(template_id: str, db: Session = Depends(get_db)):
    template = db.query(CertificateTemplate).filter(CertificateTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template

@router.delete("/{template_id}")
def delete_template(template_id: str, db: Session = Depends(get_db)):
    template = db.query(CertificateTemplate).filter(CertificateTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(template)
    db.commit()
    return {"ok": True}

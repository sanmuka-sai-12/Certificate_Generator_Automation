from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.project import Project
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse

router = APIRouter()

@router.post("", response_model=ProjectResponse)
def create_project(payload: ProjectCreate, user_email: str = "default_user@example.com", db: Session = Depends(get_db)):
    project = Project(
        user_email=user_email,
        name=payload.name,
        organization=payload.organization,
        event_name=payload.event_name,
        event_date=payload.event_date,
        cert_type=payload.cert_type or "Participation",
        template_id=payload.template_id,
        sender_email=payload.sender_email
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project

@router.get("", response_model=List[ProjectResponse])
def list_projects(user_email: str = "default_user@example.com", db: Session = Depends(get_db)):
    return db.query(Project).filter(Project.user_email == user_email).order_by(Project.created_at.desc()).all()

@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: str, payload: ProjectUpdate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    update_data = payload.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(project, key, value)
        
    db.commit()
    db.refresh(project)
    return project

@router.post("/{project_id}/duplicate", response_model=ProjectResponse)
def duplicate_project(project_id: str, db: Session = Depends(get_db)):
    orig = db.query(Project).filter(Project.id == project_id).first()
    if not orig:
        raise HTTPException(status_code=404, detail="Project not found")
        
    dup = Project(
        user_email=orig.user_email,
        name=f"{orig.name} (Copy)",
        organization=orig.organization,
        event_name=orig.event_name,
        event_date=orig.event_date,
        cert_type=orig.cert_type,
        template_id=orig.template_id,
        sender_email=orig.sender_email,
        email_subject=orig.email_subject,
        email_body=orig.email_body
    )
    db.add(dup)
    db.commit()
    db.refresh(dup)
    return dup

@router.delete("/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(project)
    db.commit()
    return {"ok": True, "message": "Project deleted successfully"}

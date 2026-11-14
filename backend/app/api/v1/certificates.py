from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.project import Project
from app.models.participant import Participant
from app.models.template import CertificateTemplate
from app.services.pdf_service import render_certificate_pdf
from app.worker.tasks import generate_bulk_certificates_task

router = APIRouter()

@router.post("/{project_id}/generate")
def trigger_bulk_generation(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    # Dispatch Celery background task
    task = generate_bulk_certificates_task.delay(project_id)
    return {"message": "Bulk certificate generation started", "task_id": task.id}

@router.get("/{project_id}/preview/{participant_id}")
def preview_certificate_pdf(project_id: str, participant_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    participant = db.query(Participant).filter(
        Participant.id == participant_id,
        Participant.project_id == project_id
    ).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")
        
    template = db.query(CertificateTemplate).filter(CertificateTemplate.id == project.template_id).first()
    template_json = template.template_json if template else {
        "page": {"width": 3508, "height": 2480},
        "objects": [
            {"type": "text", "text": "CERTIFICATE OF PARTICIPATION", "left": 1754, "top": 500, "originX": "center", "fontSize": 120},
            {"type": "text", "text": "{{STUDENT_NAME}}", "left": 1754, "top": 1100, "originX": "center", "fontSize": 160}
        ]
    }
    
    p_data = {
        "name": participant.name,
        "cert_id": participant.cert_id,
        "verify_token": participant.verify_token,
        "cert_type": participant.cert_type,
        "college": participant.college or "",
        "department": participant.department or "",
        "position": participant.position or ""
    }
    event_data = {
        "event_name": project.event_name or project.name,
        "event_date": project.event_date or "",
        "organization": project.organization or ""
    }
    
    pdf_bytes = render_certificate_pdf(template_json, p_data, event_data)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={participant.name}.pdf"}
    )

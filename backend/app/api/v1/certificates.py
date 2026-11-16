from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import io
import zipfile
import re
from app.core.database import get_db
from app.models.project import Project
from app.models.participant import Participant
from app.models.template import CertificateTemplate
from app.services.pdf_service import render_certificate_pdf
from app.worker.tasks import generate_bulk_certificates_task

router = APIRouter()

def safe_filename(name: str) -> str:
    return re.sub(r"[^\w\s-]", "", name).strip().replace(" ", "_")[:40] or "cert"

@router.post("/{project_id}/generate")
def trigger_bulk_generation(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
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
    template_json = template.template_json if template else {}
    
    p_data = {
        "name": participant.name,
        "cert_id": participant.cert_id,
        "verify_token": participant.verify_token,
        "cert_type": participant.cert_type,
        "college": participant.college or "",
        "department": participant.department or "",
        "position": participant.position or "",
        "reg_no": participant.reg_no or "",
        "custom_fields": participant.custom_fields
    }
    event_data = {
        "event_name": project.event_name or project.name,
        "event_date": project.event_date or "",
        "organization": project.organization or ""
    }
    
    pdf_bytes = render_certificate_pdf(template_json, p_data, event_data)
    filename = f"{safe_filename(participant.name)}_{participant.cert_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )

@router.get("/{project_id}/download/{participant_id}")
def download_single_pdf(project_id: str, participant_id: str, db: Session = Depends(get_db)):
    return preview_certificate_pdf(project_id, participant_id, db)

@router.get("/{project_id}/zip")
def download_certificates_zip(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    participants = db.query(Participant).filter(
        Participant.project_id == project_id,
        Participant.validity == "valid"
    ).all()
    
    if not participants:
        raise HTTPException(status_code=400, detail="No valid participants found to export")
        
    template = db.query(CertificateTemplate).filter(CertificateTemplate.id == project.template_id).first()
    template_json = template.template_json if template else {}
    
    event_data = {
        "event_name": project.event_name or project.name,
        "event_date": project.event_date or "",
        "organization": project.organization or ""
    }
    
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in participants:
            p_data = {
                "name": p.name,
                "cert_id": p.cert_id,
                "verify_token": p.verify_token,
                "cert_type": p.cert_type,
                "college": p.college or "",
                "department": p.department or "",
                "position": p.position or "",
                "reg_no": p.reg_no or "",
                "custom_fields": p.custom_fields
            }
            pdf_bytes = render_certificate_pdf(template_json, p_data, event_data)
            fname = f"{safe_filename(p.name)}_{p.cert_id}.pdf"
            zf.writestr(fname, pdf_bytes)
            
    zip_buffer.seek(0)
    zip_filename = f"{safe_filename(project.name)}_certificates.zip"
    
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={zip_filename}"}
    )

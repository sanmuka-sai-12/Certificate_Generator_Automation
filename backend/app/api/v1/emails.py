from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.project import Project
from app.models.participant import Participant
from app.models.user import GoogleAccount
from app.models.template import CertificateTemplate
from app.schemas.email import EmailTestRequest, BatchSendRequest, BatchProgressResponse
from app.services.pdf_service import render_certificate_pdf, replace_placeholders
from app.services.gmail_service import send_gmail_message
from app.worker.tasks import send_batch_emails_task

router = APIRouter()

@router.post("/test")
def send_test_email(payload: EmailTestRequest, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == payload.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    account = db.query(GoogleAccount).filter(GoogleAccount.sender_email == project.sender_email).first()
    if not account:
        # Fallback to any connected account if project sender is unset
        account = db.query(GoogleAccount).first()
        if not account:
            raise HTTPException(status_code=400, detail="No authorized Google Account found. Please connect in Settings.")
            
    participant = db.query(Participant).filter(Participant.project_id == project.id).first()
    p_data = {
        "name": participant.name if participant else "Test Recipient",
        "cert_id": participant.cert_id if participant else "TEST-001",
        "verify_token": participant.verify_token if participant else "tok123456",
        "cert_type": "Participation"
    }
    
    template = db.query(CertificateTemplate).filter(CertificateTemplate.id == project.template_id).first()
    template_json = template.template_json if template else {}
    event_data = {
        "event_name": project.event_name or project.name,
        "organization": project.organization or ""
    }
    
    pdf_bytes = render_certificate_pdf(template_json, p_data, event_data)
    
    vars_dict = {
        "STUDENT_NAME": p_data["name"],
        "EVENT_NAME": project.event_name or project.name,
        "ORG_NAME": project.organization or "",
        "CERTIFICATE_ID": p_data["cert_id"]
    }
    subj = "[TEST] " + replace_placeholders(project.email_subject or "Your Certificate for {{EVENT_NAME}}", vars_dict)
    body_txt = replace_placeholders(project.email_body or "Congratulations! Please find your certificate attached.", vars_dict)
    body_html = body_txt.replace("\n", "<br>")
    
    res = send_gmail_message(
        encrypted_refresh_token=account.encrypted_refresh_token,
        sender_name=project.organization or "Certificate Authority",
        sender_email=account.sender_email,
        to_email=payload.recipient_email,
        subject=subj,
        body_text=body_txt,
        body_html=body_html,
        pdf_bytes=pdf_bytes,
        filename=f"Test_Certificate_{p_data['cert_id']}.pdf"
    )
    return {"ok": True, "message_id": res.get("id"), "sent_to": payload.recipient_email}

@router.post("/batch")
def start_batch_dispatch(payload: BatchSendRequest, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == payload.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    task = send_batch_emails_task.delay(
        project_id=project.id,
        batch_size=payload.batch_size or 50,
        sender_email=payload.sender_email or project.sender_email
    )
    return {"message": "Batch sending job queued", "task_id": task.id}

@router.get("/progress/{project_id}", response_model=BatchProgressResponse)
def get_sending_progress(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    participants = db.query(Participant).filter(Participant.project_id == project_id).all()
    counts = {
        "Pending": 0,
        "Processing": 0,
        "Sent": 0,
        "Failed": 0,
        "Retry": 0,
        "Uncertain": 0,
        "Skipped": 0
    }
    for p in participants:
        status = p.email_status
        if status in counts:
            counts[status] += 1
            
    return {
        "project_id": project_id,
        "state": project.status or "idle",
        "counts": counts,
        "total": len(participants),
        "quota_remaining": 100 # Updated by quota check
    }

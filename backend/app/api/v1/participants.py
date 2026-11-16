from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import secrets
import string
from app.core.database import get_db
from app.models.project import Project
from app.models.participant import Participant
from app.schemas.participant import ParticipantBulkImport, ParticipantResponse, ParticipantStats

router = APIRouter()

def generate_secure_token(length: int = 12) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

@router.post("/{project_id}/import")
def bulk_import_participants(project_id: str, payload: ParticipantBulkImport, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    prefix = payload.prefix or "CERT"
    count_existing = db.query(Participant).filter(Participant.project_id == project_id).count()
    
    saved_count = 0
    seen_emails = set()
    assigned_cert_ids = set()
    seq = count_existing
    
    for p in payload.participants:
        seq += 1
        cert_id = f"{prefix}-{str(seq).zfill(3)}"
        while cert_id in assigned_cert_ids or db.query(Participant).filter(Participant.cert_id == cert_id).first():
            seq += 1
            cert_id = f"{prefix}-{str(seq).zfill(3)}"
            
        assigned_cert_ids.add(cert_id)
        verify_token = generate_secure_token(12)
        
        email_clean = p.email.strip().lower()
        is_duplicate = email_clean in seen_emails
        seen_emails.add(email_clean)
        
        participant = Participant(
            project_id=project_id,
            name=p.name.strip(),
            email=email_clean,
            cert_type=p.cert_type or project.cert_type or "Participation",
            college=p.college,
            department=p.department,
            reg_no=p.reg_no,
            position=p.position,
            custom_fields=p.custom_fields,
            cert_id=cert_id,
            verify_token=verify_token,
            validity="duplicate" if is_duplicate else "valid",
            email_status="Skipped" if is_duplicate else "Pending"
        )
        db.add(participant)
        saved_count += 1
        
    db.commit()
    return {"saved": saved_count, "total_participants": count_existing + saved_count}

@router.get("/{project_id}", response_model=List[ParticipantResponse])
def list_participants(project_id: str, db: Session = Depends(get_db)):
    return db.query(Participant).filter(Participant.project_id == project_id).all()

@router.get("/{project_id}/stats", response_model=ParticipantStats)
def get_participant_stats(project_id: str, db: Session = Depends(get_db)):
    participants = db.query(Participant).filter(Participant.project_id == project_id).all()
    
    total = len(participants)
    generated = sum(1 for p in participants if p.gen_status == "Generated")
    sent = sum(1 for p in participants if p.email_status == "Sent")
    pending = sum(1 for p in participants if p.email_status in ["Pending", "Retry"])
    failed = sum(1 for p in participants if p.email_status == "Failed")
    uncertain = sum(1 for p in participants if p.email_status == "Uncertain")
    
    return {
        "total": total,
        "generated": generated,
        "sent": sent,
        "pending": pending,
        "failed": failed,
        "uncertain": uncertain
    }

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.participant import Participant
from app.models.project import Project

router = APIRouter()

@router.get("")
def verify_certificate(
    id: str = Query(..., description="Certificate ID e.g. CERT-001"),
    t: str = Query(..., description="12-character verification token"),
    db: Session = Depends(get_db)
):
    participant = db.query(Participant).filter(
        Participant.cert_id == id.strip(),
        Participant.verify_token == t.strip()
    ).first()
    
    if not participant:
        return {
            "status": "not_found",
            "message": "Certificate could not be verified in the registry."
        }
        
    project = db.query(Project).filter(Project.id == participant.project_id).first()
    
    if participant.validity == "revoked":
        return {
            "status": "revoked",
            "message": "This certificate was officially issued but has since been revoked by the issuing authority.",
            "cert_id": participant.cert_id,
            "recipient_name": participant.name,
            "event_name": project.event_name if project else "",
            "organization": project.organization if project else ""
        }
        
    return {
        "status": "valid",
        "message": "Certificate verified as authentic and genuine.",
        "cert_id": participant.cert_id,
        "recipient_name": participant.name,
        "event_name": project.event_name if project else "",
        "organization": project.organization if project else "",
        "cert_type": participant.cert_type,
        "issue_date": participant.sent_at or participant.created_at
    }

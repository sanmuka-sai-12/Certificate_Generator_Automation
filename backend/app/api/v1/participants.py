"""
=====================================================================================
Smart Certificate Generator - Participants API (V1)
=====================================================================================

This module provides endpoints for importing participant spreadsheets, allocating
unique tamper-proof certificate identifiers, querying project recipient rosters,
and calculating aggregated dispatch statistics.

Key Features:
1. Bulk Excel/CSV Ingestion:
   - Sanitizes and lowercases recipient emails, trims whitespace.
2. In-Memory Duplicate Detection:
   - Automatically marks repeated email addresses as 'duplicate' and 'Skipped'
     to prevent duplicate email sends.
3. Cryptographically Secure Token Generation:
   - Assigns a 12-character random alphanumeric verification token (`verify_token`)
     per recipient to guarantee certificate IDs cannot be enumerated or forged.
4. Collision-Proof Certificate ID Sequencing:
   - Allocates unique sequential identifiers (e.g. `CERT-001`, `CERT-002`) with active
     checks against both database records and current-batch memory pools.
=====================================================================================
"""

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
    """
    Generates a cryptographically random alphanumeric string.
    Used for tamper-proof public certificate QR code verification tokens.
    """
    alphabet = string.ascii_lowercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


@router.post("/{project_id}/import")
def bulk_import_participants(
    project_id: str,
    payload: ParticipantBulkImport,
    db: Session = Depends(get_db)
):
    """
    Bulk imports participants into a project from parsed Excel / CSV rows.

    - Validates project existence.
    - Sequentially generates unique `cert_id` tokens (e.g. `TEST-001`).
    - Assigns random 12-char secure `verify_token` values.
    - Flags duplicate email addresses as 'duplicate' / 'Skipped'.
    """
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
        # Collision-proof sequential cert_id generator
        seq += 1
        cert_id = f"{prefix}-{str(seq).zfill(3)}"
        while cert_id in assigned_cert_ids or db.query(Participant).filter(Participant.cert_id == cert_id).first():
            seq += 1
            cert_id = f"{prefix}-{str(seq).zfill(3)}"
            
        assigned_cert_ids.add(cert_id)
        verify_token = generate_secure_token(12)
        
        # Normalize email address and check for duplicates within the current import batch
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
    """
    Retrieves all participants registered under a specific project.
    """
    return db.query(Participant).filter(Participant.project_id == project_id).all()


@router.get("/{project_id}/stats", response_model=ParticipantStats)
def get_participant_stats(project_id: str, db: Session = Depends(get_db)):
    """
    Computes real-time participant and dispatch statistics for project dashboards.
    """
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

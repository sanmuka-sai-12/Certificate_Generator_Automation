import time
from datetime import datetime
from app.worker.celery_app import celery_app
from app.core.database import SessionLocal
from app.models.project import Project
from app.models.participant import Participant
from app.models.template import CertificateTemplate
from app.models.user import GoogleAccount
from app.models.email_log import EmailLog
from app.services.pdf_service import render_certificate_pdf, replace_placeholders
from app.services.drive_service import get_drive_service, get_or_create_folder, upload_pdf_to_drive
from app.services.gmail_service import send_gmail_message

@celery_app.task(bind=True, name="tasks.generate_bulk_certificates")
def generate_bulk_certificates_task(self, project_id: str):
    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return {"error": "Project not found"}
            
        template = db.query(CertificateTemplate).filter(CertificateTemplate.id == project.template_id).first()
        template_json = template.template_json if template else {
            "page": {"width": 3508, "height": 2480},
            "objects": [
                {"type": "text", "text": "CERTIFICATE OF PARTICIPATION", "left": 1754, "top": 500, "originX": "center", "fontSize": 120},
                {"type": "text", "text": "{{STUDENT_NAME}}", "left": 1754, "top": 1100, "originX": "center", "fontSize": 160}
            ]
        }
        
        participants = db.query(Participant).filter(
            Participant.project_id == project_id,
            Participant.gen_status != "Generated"
        ).all()
        
        event_data = {
            "event_name": project.event_name or project.name,
            "event_date": project.event_date or "",
            "organization": project.organization or ""
        }
        
        total = len(participants)
        generated_count = 0
        
        for idx, p in enumerate(participants):
            p.gen_status = "Processing"
            db.commit()
            
            p_data = {
                "name": p.name,
                "cert_id": p.cert_id,
                "verify_token": p.verify_token,
                "cert_type": p.cert_type,
                "college": p.college or "",
                "department": p.department or "",
                "position": p.position or ""
            }
            
            try:
                pdf_bytes = render_certificate_pdf(template_json, p_data, event_data)
                
                # If Google Account connected with Drive, upload PDF
                account = db.query(GoogleAccount).filter(GoogleAccount.sender_email == project.sender_email).first()
                if account:
                    drive_service = get_drive_service(account.encrypted_refresh_token)
                    root_folder_id = get_or_create_folder(drive_service, "CertGen")
                    proj_folder_id = get_or_create_folder(drive_service, f"Project_{project.id}_{project.name}", root_folder_id)
                    certs_folder_id = get_or_create_folder(drive_service, "certificates", proj_folder_id)
                    
                    filename = f"{p.name.replace(' ', '_')}_{p.cert_id}.pdf"
                    drive_file_id = upload_pdf_to_drive(drive_service, certs_folder_id, filename, pdf_bytes)
                    p.pdf_drive_file_id = drive_file_id
                
                p.gen_status = "Generated"
                generated_count += 1
            except Exception as e:
                p.gen_status = "Failed"
                p.last_error = str(e)[:250]
                
            db.commit()
            self.update_state(state="PROGRESS", meta={"current": idx + 1, "total": total})
            
        return {"status": "SUCCESS", "generated": generated_count, "total": total}
    finally:
        db.close()

@celery_app.task(bind=True, name="tasks.send_batch_emails")
def send_batch_emails_task(self, project_id: str, batch_size: int = 50, sender_email: str = None):
    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return {"error": "Project not found"}
            
        sender = sender_email or project.sender_email
        account = db.query(GoogleAccount).filter(GoogleAccount.sender_email == sender).first()
        if not account:
            return {"error": "Sender Gmail account not authorized via OAuth"}
            
        participants = db.query(Participant).filter(
            Participant.project_id == project_id,
            Participant.validity == "valid",
            Participant.email_status.in_(["Pending", "Retry"])
        ).limit(batch_size).all()
        
        project.status = "sending"
        db.commit()
        
        sent_count = 0
        for p in participants:
            # 1. Write 'Processing' BEFORE sending
            p.email_status = "Processing"
            p.attempts += 1
            db.commit()
            
            # Render PDF bytes if not in Drive
            template = db.query(CertificateTemplate).filter(CertificateTemplate.id == project.template_id).first()
            template_json = template.template_json if template else {}
            p_data = {
                "name": p.name,
                "cert_id": p.cert_id,
                "verify_token": p.verify_token,
                "cert_type": p.cert_type
            }
            event_data = {
                "event_name": project.event_name or project.name,
                "organization": project.organization or ""
            }
            pdf_bytes = render_certificate_pdf(template_json, p_data, event_data)
            
            # Prepare email text and HTML
            vars_dict = {
                "STUDENT_NAME": p.name,
                "EVENT_NAME": project.event_name or project.name,
                "ORG_NAME": project.organization or "",
                "CERTIFICATE_ID": p.cert_id
            }
            subj = replace_placeholders(project.email_subject or "Your Certificate for {{EVENT_NAME}}", vars_dict)
            body_txt = replace_placeholders(project.email_body or "Congratulations! Please find your certificate attached.", vars_dict)
            body_html = body_txt.replace("\n", "<br>")
            
            try:
                res = send_gmail_message(
                    encrypted_refresh_token=account.encrypted_refresh_token,
                    sender_name=project.organization or "Certificate Authority",
                    sender_email=account.sender_email,
                    to_email=p.email,
                    subject=subj,
                    body_text=body_txt,
                    body_html=body_html,
                    pdf_bytes=pdf_bytes,
                    filename=f"{p.name}_{p.cert_id}.pdf"
                )
                
                # 2. Write 'Sent' immediately after success
                p.email_status = "Sent"
                p.sent_at = datetime.utcnow()
                p.message_id = res.get("id")
                
                # Audit log
                log_entry = EmailLog(
                    project_id=project_id,
                    participant_id=p.id,
                    recipient_email=p.email,
                    sender_email=account.sender_email,
                    status="Sent",
                    message_id=res.get("id")
                )
                db.add(log_entry)
                sent_count += 1
            except Exception as exc:
                p.email_status = "Failed" if p.attempts >= 3 else "Retry"
                p.last_error = str(exc)[:250]
                
                log_entry = EmailLog(
                    project_id=project_id,
                    participant_id=p.id,
                    recipient_email=p.email,
                    sender_email=account.sender_email,
                    status="Failed",
                    error_message=str(exc)
                )
                db.add(log_entry)
                
            db.commit()
            time.sleep(1.5) # respectful 1.5s delay between individual emails
            
        remaining = db.query(Participant).filter(
            Participant.project_id == project_id,
            Participant.email_status.in_(["Pending", "Retry"])
        ).count()
        
        if remaining == 0:
            project.status = "finished"
        else:
            project.status = "idle"
            
        db.commit()
        return {"status": "SUCCESS", "sent": sent_count, "remaining": remaining}
    finally:
        db.close()

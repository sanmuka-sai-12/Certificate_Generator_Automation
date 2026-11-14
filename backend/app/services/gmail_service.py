import base64
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from googleapiclient.discovery import build
from app.services.google_auth import get_credentials_from_refresh_token

def send_gmail_message(
    encrypted_refresh_token: str,
    sender_name: str,
    sender_email: str,
    to_email: str,
    subject: str,
    body_text: str,
    body_html: str,
    pdf_bytes: bytes,
    filename: str
) -> dict:
    creds = get_credentials_from_refresh_token(encrypted_refresh_token)
    service = build("gmail", "v1", credentials=creds)
    
    message = MIMEMultipart("mixed")
    message["to"] = to_email
    message["from"] = f"{sender_name} <{sender_email}>"
    message["subject"] = subject
    
    # Body (alternative: plain text and HTML)
    alt_part = MIMEMultipart("alternative")
    alt_part.attach(MIMEText(body_text, "plain", "utf-8"))
    alt_part.attach(MIMEText(body_html, "html", "utf-8"))
    message.attach(alt_part)
    
    # PDF Attachment
    if pdf_bytes:
        pdf_part = MIMEBase("application", "pdf")
        pdf_part.set_payload(pdf_bytes)
        encoders.encode_base64(pdf_part)
        pdf_part.add_header("Content-Disposition", "attachment", filename=filename)
        message.attach(pdf_part)
        
    raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
    sent = service.users().messages().send(userId="me", body={"raw": raw_message}).execute()
    return sent

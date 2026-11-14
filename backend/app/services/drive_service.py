from googleapiclient.discovery import build
from googleapiclient.http import MediaInMemoryUpload
from app.services.google_auth import get_credentials_from_refresh_token

def get_drive_service(encrypted_refresh_token: str):
    creds = get_credentials_from_refresh_token(encrypted_refresh_token)
    return build("drive", "v3", credentials=creds)

def get_or_create_folder(service, folder_name: str, parent_id: str = None) -> str:
    query = f"name = '{folder_name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    if parent_id:
        query += f" and '{parent_id}' in parents"
        
    results = service.files().list(q=query, fields="files(id, name)").execute()
    files = results.get("files", [])
    if files:
        return files[0]["id"]
        
    metadata = {
        "name": folder_name,
        "mimeType": "application/vnd.google-apps.folder"
    }
    if parent_id:
        metadata["parents"] = [parent_id]
        
    folder = service.files().create(body=metadata, fields="id").execute()
    return folder.get("id")

def upload_pdf_to_drive(service, folder_id: str, filename: str, pdf_bytes: bytes) -> str:
    media = MediaInMemoryUpload(pdf_bytes, mimetype="application/pdf", resumable=True)
    metadata = {
        "name": filename,
        "parents": [folder_id]
    }
    file = service.files().create(body=metadata, media_body=media, fields="id").execute()
    return file.get("id")

from fastapi import APIRouter
from app.api.v1 import auth, projects, participants, templates, certificates, emails, verification

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Google OAuth & Sender Accounts"])
api_router.include_router(projects.router, prefix="/projects", tags=["Projects"])
api_router.include_router(participants.router, prefix="/participants", tags=["Participants"])
api_router.include_router(templates.router, prefix="/templates", tags=["Templates"])
api_router.include_router(certificates.router, prefix="/certificates", tags=["Certificates"])
api_router.include_router(emails.router, prefix="/emails", tags=["Emails"])
api_router.include_router(verification.router, prefix="/verify", tags=["Public Verification"])

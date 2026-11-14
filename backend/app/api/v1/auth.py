from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.config import settings
from app.models.user import GoogleAccount
from app.core.security import encrypt_token
from app.services.google_auth import get_authorization_url, exchange_code_for_tokens

router = APIRouter()

@router.get("/google/url")
def get_google_oauth_url(user_email: str = Query("default_user@example.com")):
    """Returns the Google OAuth 2.0 authorization URL for connecting a sender Gmail"""
    url = get_authorization_url(state=user_email)
    return {"url": url}

@router.get("/google/callback")
def google_oauth_callback(code: str, state: str = "default_user@example.com", db: Session = Depends(get_db)):
    """Handles OAuth 2.0 redirect, fetches refresh token, and securely stores it encrypted"""
    try:
        tokens = exchange_code_for_tokens(code)
        email = tokens["email"]
        refresh_token = tokens["refresh_token"]
        
        if not refresh_token:
            return RedirectResponse(f"{settings.FRONTEND_URL}/#/settings?error=no_refresh_token")
            
        encrypted_token = encrypt_token(refresh_token)
        is_workspace = not ("@gmail.com" in email or "@googlemail.com" in email)
        
        account = db.query(GoogleAccount).filter(GoogleAccount.sender_email == email).first()
        if not account:
            account = GoogleAccount(
                user_email=state,
                sender_email=email,
                encrypted_refresh_token=encrypted_token,
                account_type="workspace" if is_workspace else "consumer",
                daily_quota_limit="1500" if is_workspace else "100"
            )
            db.add(account)
        else:
            account.encrypted_refresh_token = encrypted_token
            account.account_type = "workspace" if is_workspace else "consumer"
            
        db.commit()
        return RedirectResponse(f"{settings.FRONTEND_URL}/#/settings?auth_success={email}")
    except Exception as e:
        return RedirectResponse(f"{settings.FRONTEND_URL}/#/settings?error={str(e)}")

@router.get("/accounts")
def list_connected_accounts(user_email: str = "default_user@example.com", db: Session = Depends(get_db)):
    """Lists all connected Google sender accounts for the user"""
    accounts = db.query(GoogleAccount).filter(GoogleAccount.user_email == user_email).all()
    return [
        {
            "id": a.id,
            "sender_email": a.sender_email,
            "account_type": a.account_type,
            "daily_quota_limit": a.daily_quota_limit,
            "connected_at": a.connected_at
        }
        for a in accounts
    ]

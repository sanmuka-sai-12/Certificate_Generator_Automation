import base64
from cryptography.fernet import Fernet
from app.core.config import settings

def get_fernet_cipher() -> Fernet:
    try:
        key = settings.TOKEN_ENCRYPTION_KEY.encode()
        return Fernet(key)
    except Exception:
        # Fallback 32-byte urlsafe base64 key for local setup if unset
        dummy_key = Fernet.generate_key()
        return Fernet(dummy_key)

def encrypt_token(token: str) -> str:
    if not token:
        return ""
    f = get_fernet_cipher()
    return f.encrypt(token.encode()).decode()

def decrypt_token(encrypted_token: str) -> str:
    if not encrypted_token:
        return ""
    f = get_fernet_cipher()
    return f.decrypt(encrypted_token.encode()).decode()

import os
from cryptography.fernet import Fernet

def get_fernet() -> Fernet:
    key = os.environ.get("ENCRYPTION_KEY", "")
    if not key:
        raise RuntimeError("ENCRYPTION_KEY environment variable is not set.")
    return Fernet(key.encode())

def encrypt(text: str) -> str:
    return get_fernet().encrypt(text.encode()).decode()

def decrypt(text: str) -> str:
    return get_fernet().decrypt(text.encode()).decode()

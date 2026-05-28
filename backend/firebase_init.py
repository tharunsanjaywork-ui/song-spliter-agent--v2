"""
firebase_init.py
Dual Firebase Admin SDK initialization for AudioWave.

Provides:
  - app_primary  — always used for auth token verification
  - db_primary   — primary Firestore client
  - app_backup   — backup Firebase project (Firestore only, never auth)
  - db_backup    — backup Firestore client
  - get_active_db()  — returns primary or backup Firestore based on quota flag
  - verify_token()   — verifies Firebase ID token using primary project, returns UID
"""

import json
import logging
import os

import firebase_admin
from firebase_admin import auth as fb_auth
from firebase_admin import credentials, firestore
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Primary Firebase project — handles ALL authentication + default Firestore
# ---------------------------------------------------------------------------
_primary_cred_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "")
if not _primary_cred_json:
    raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON env var is not set.")

cred_primary = credentials.Certificate(json.loads(_primary_cred_json))
app_primary = firebase_admin.initialize_app(cred_primary, name="primary")
db_primary = firestore.client(app=app_primary)

# ---------------------------------------------------------------------------
# Backup Firebase project — Firestore failover only; auth never uses this
# ---------------------------------------------------------------------------
db_backup = None
_backup_cred_json = os.environ.get("FIREBASE_BACKUP_SERVICE_ACCOUNT_JSON", "")

if not _backup_cred_json:
    logger.warning("FIREBASE_BACKUP_SERVICE_ACCOUNT_JSON env var is not set. Backup DB will be unavailable.")
else:
    try:
        cred_backup = credentials.Certificate(json.loads(_backup_cred_json))
        app_backup = firebase_admin.initialize_app(cred_backup, name="backup")
        db_backup = firestore.client(app=app_backup)
        logger.info("Backup Firebase Admin SDK initialized successfully.")
    except Exception as exc:
        logger.error("Failed to initialize Backup Firebase Admin SDK: %s. Backup DB will be unavailable.", exc)


# ---------------------------------------------------------------------------
# get_active_db() — checks _meta/quota document in primary Firestore.
# Returns backup client when primaryFirestoreWriteCount is near limit.
# Falls back to backup if primary is unreachable.
# ---------------------------------------------------------------------------
def get_active_db():
    """Return primary or backup Firestore client based on quota check."""
    if db_backup is None:
        return db_primary
    try:
        meta_ref = db_primary.collection("_meta").document("quota")
        meta = meta_ref.get()
        if meta.exists and meta.to_dict().get("useBackupFirestore", False):
            logger.info("Routing Firestore writes to backup project.")
            return db_backup
    except Exception as exc:
        logger.error("Primary Firestore unreachable, falling back to backup: %s", exc)
        return db_backup
    return db_primary


# ---------------------------------------------------------------------------
# verify_token() — ALWAYS uses primary Firebase app for token verification.
# Never use backup app for auth — per TRD.md hard constraint.
# ---------------------------------------------------------------------------
def verify_token(token: str) -> str:
    """
    Verify a Firebase ID token using the primary Firebase project.
    Returns the user's UID on success.
    Raises HTTPException 401 if token is invalid or expired.
    """
    try:
        decoded = fb_auth.verify_id_token(token, app=app_primary)
        uid: str = decoded["uid"]
        return uid
    except fb_auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Token has expired.")
    except fb_auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Invalid authentication token.")
    except Exception:
        logger.exception("Token verification failed.")
        raise HTTPException(status_code=401, detail="Authentication failed.")


def verify_token_full(token: str) -> dict:
    """
    Verify a Firebase ID token using the primary Firebase project.
    Returns the full decoded token dictionary on success.
    Raises HTTPException 401 if token is invalid or expired.
    """
    try:
        decoded = fb_auth.verify_id_token(token, app=app_primary)
        return decoded
    except fb_auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Token has expired.")
    except fb_auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Invalid authentication token.")
    except Exception:
        logger.exception("Token verification failed.")
        raise HTTPException(status_code=401, detail="Authentication failed.")


def increment_write_count(write_count: int = 1):
    """
    Increment the daily write counter on the primary Firestore.
    If count exceeds 90% of 20K daily limit (18,000), set useBackupFirestore = True.
    Resets the counter if the date has changed.
    """
    try:
        import datetime
        meta_ref = db_primary.collection("_meta").document("quota")
        meta_doc = meta_ref.get()
        today_str = datetime.date.today().isoformat()

        if meta_doc.exists:
            meta_data = meta_doc.to_dict() or {}
            last_reset = meta_data.get("lastResetDate", "")
            if last_reset != today_str:
                # If date changed, reset the count to write_count and update the date.
                meta_ref.set({
                    "lastResetDate": today_str,
                    "primaryFirestoreWriteCount": write_count,
                    "useBackupFirestore": False
                }, merge=True)
                logger.info(f"Daily write count reset to {write_count} for date {today_str}")
            else:
                # Same date: atomically increment
                meta_ref.update({
                    "primaryFirestoreWriteCount": firestore.firestore.Increment(write_count)
                })
                # Check if it exceeded 18,000.
                old_count = meta_data.get("primaryFirestoreWriteCount", 0)
                new_count = old_count + write_count
                if new_count >= 18000 and not meta_data.get("useBackupFirestore", False):
                    meta_ref.update({
                        "useBackupFirestore": True
                    })
                    logger.warning(f"Firestore write count reached {new_count}. useBackupFirestore set to True.")
        else:
            # Document doesn't exist, create it
            meta_ref.set({
                "lastResetDate": today_str,
                "primaryFirestoreWriteCount": write_count,
                "useBackupFirestore": False
            })
            logger.info(f"Created quota document and initialized count to {write_count}")
    except Exception as exc:
        logger.error(f"Failed to increment firestore write count: {exc}")



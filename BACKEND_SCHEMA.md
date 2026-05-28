# Backend Schema — Database, API, and Architecture
# AudioWave

## Firebase Projects

### Primary: audiowave-app
- Auth: ALL authentication (Google, Email/Password, Apple, Phone) — never switches to backup
- Firestore: Primary data store
- Project ID: audiowave-app

### Backup: audiowave-app-backup
- Auth: NOT USED for auth — primary only
- Firestore: Failover data store — activated when primary Firestore approaches daily quota
- Project ID: audiowave-app-backup

---

## Firestore Collections (Primary — same structure mirrored on backup)

### Collection: `users`

Document ID: Firebase Auth UID (e.g., `abc123uid`)

| Field | Type | Notes |
|---|---|---|
| uid | string | Firebase Auth UID |
| email | string | User email |
| displayName | string | User display name |
| setupComplete | boolean | False until both OpenRouter and ACRCloud keys are saved |
| openrouterKeyEncrypted | string | AES-256 Fernet encrypted OpenRouter API key |
| acrHostEncrypted | string | AES-256 Fernet encrypted ACRCloud host |
| acrAccessKeyEncrypted | string | AES-256 Fernet encrypted ACRCloud access key |
| acrSecretKeyEncrypted | string | AES-256 Fernet encrypted ACRCloud secret key |
| createdAt | timestamp | Account first seen |
| updatedAt | timestamp | Last key update |

**Security rule:** Users can only read/write their own document (`request.auth.uid == resource.data.uid`). No field can be written from the client — all Firestore writes go through the backend (Firebase Admin SDK) which verifies the token first.

---

### Collection: `jobs`

Document ID: `{uid}_{jobId}` (e.g., `abc123uid_job_1717000000`)

| Field | Type | Notes |
|---|---|---|
| jobId | string | UUID generated at start of processing |
| uid | string | Firebase Auth UID of owner |
| status | string | "processing" / "complete" / "failed" |
| originalFileName | string | Sanitized original filename (no path traversal) |
| fileCount | number | Number of split files produced |
| files | array | See files sub-schema below |
| errorType | string or null | "acr_limit_exceeded" / "openrouter_limit_exceeded" / null |
| createdAt | timestamp | |
| completedAt | timestamp or null | |

**files array item:**

| Field | Type | Notes |
|---|---|---|
| index | number | 0-based split order |
| displayName | string | Human-readable song name or "Unidentified Song XX" |
| cloudinaryUrl | string | Secure HTTPS Cloudinary URL for this MP3 |
| cloudinaryPublicId | string | Cloudinary public ID for rename operations |
| duration | number | Duration in seconds |
| recognized | boolean | True if ACRCloud returned a match |

**Security rule:** Users can only read their own jobs (`request.auth.uid == resource.data.uid`). All writes via backend only.

---

### Collection: `_meta`

Document ID: `quota`

| Field | Type | Notes |
|---|---|---|
| primaryFirestoreWriteCount | number | Rolling daily write count for primary Firestore |
| lastResetDate | string | YYYY-MM-DD of last counter reset |
| useBackupFirestore | boolean | Set to true by backend when primary approaches limit |
| primaryCloudinaryUsageGB | number | Last checked Cloudinary storage in GB |
| useBackupCloudinary | boolean | Set to true by backend when primary Cloudinary > 22.5GB |

---

## Firestore Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read their own user document — all writes via backend Admin SDK only
    match /users/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow write: if false; // Backend Admin SDK only
    }

    // Users can only read their own jobs — all writes via backend Admin SDK only
    match /jobs/{jobId} {
      allow read: if request.auth != null && resource.data.uid == request.auth.uid;
      allow write: if false; // Backend Admin SDK only
    }

    // Meta is backend-only
    match /_meta/{doc} {
      allow read, write: if false;
    }
  }
}
```

---

## Cloudinary Storage Structure

```
audiowave/
  {uid}/
    {jobId}/
      song_01.mp3          # Before naming
      song_02.mp3
      ...
    (after naming):
      {JobId}/
        Ananda Ragam.mp3
        Nila Kaikirathu.mp3
        Unidentified Song 03.mp3
```

### Dual Cloudinary Failover Logic (Backend)

```python
# Called before any upload batch
async def get_active_cloudinary():
    meta = firestore_admin.collection('_meta').document('quota').get()
    if meta.exists and meta.get('useBackupCloudinary'):
        return configure_cloudinary(backup=True)

    # Check primary usage
    usage = cloudinary.api.usage()  # returns bytes used
    usage_gb = usage['storage']['usage'] / (1024**3)

    if usage_gb > 22.5:  # 90% of 25GB free tier
        firestore_admin.collection('_meta').document('quota').set(
            {'useBackupCloudinary': True}, merge=True
        )
        return configure_cloudinary(backup=True)

    return configure_cloudinary(backup=False)
```

---

## FastAPI Endpoints

| Method | Route | Auth Required | Description |
|---|---|---|---|
| GET | /health | No | Health check — returns {"status":"ok"} |
| POST | /api/keys/save | Yes (Firebase token) | Encrypt and save OpenRouter + ACRCloud keys to Firestore |
| GET | /api/keys/status | Yes | Returns {setupComplete: bool} — confirms keys are saved |
| POST | /api/process | Yes | Upload audio file, run 4-step pipeline, return job data |
| GET | /api/jobs/{jobId} | Yes | Get job status and file list with Cloudinary URLs |
| POST | /api/files/rename | Yes | Rename a specific file in Cloudinary and update Firestore job |
| GET | /api/wakeup | No | Lightweight endpoint — frontend calls this first to wake Render service |

---

## POST /api/keys/save — Request / Response

**Request (multipart form or JSON body):**
```json
{
  "openrouter_key": "sk-or-v1-...",
  "acr_host": "identify-ap-southeast-1.acrcloud.com",
  "acr_access_key": "abc123...",
  "acr_secret_key": "xyz789..."
}
```

**Validation (Pydantic):**
- `openrouter_key`: string, min 20 chars, starts with `sk-or`
- `acr_host`: string, min 10 chars, contains `.acrcloud.com`
- `acr_access_key`: string, min 10 chars
- `acr_secret_key`: string, min 10 chars

**Response (success):**
```json
{"success": true}
```

**Response (error):**
```json
{"success": false, "error": "Invalid OpenRouter key format"}
```

---

## POST /api/process — Request / Response

**Request:** `multipart/form-data`
- `file`: audio file upload (max 500MB, validated MIME type)

**Headers:** `Authorization: Bearer <firebase_id_token>`

**Response (success — streaming SSE for progress, then final JSON):**

Progress events (Server-Sent Events):
```
data: {"step": "analyzing", "message": "Analyzing your audio file..."}
data: {"step": "thinking", "elapsed": 5}
data: {"step": "thinking", "elapsed": 6}
data: {"step": "saving", "message": "Saving individual files..."}
data: {"step": "naming", "message": "Naming your songs..."}
data: {"step": "complete", "jobId": "abc123_job_1717000000"}
```

**Error events:**
```
data: {"step": "error", "error_type": "acr_limit_exceeded"}
data: {"step": "error", "error_type": "openrouter_limit_exceeded"}
data: {"step": "error", "error_type": "general", "message": "Something went wrong"}
```

---

## Encryption / Decryption (Backend)

```python
from cryptography.fernet import Fernet
import os

FERNET_KEY = os.environ['ENCRYPTION_KEY'].encode()
fernet = Fernet(FERNET_KEY)

def encrypt(plain_text: str) -> str:
    return fernet.encrypt(plain_text.encode()).decode()

def decrypt(cipher_text: str) -> str:
    return fernet.decrypt(cipher_text.encode()).decode()
```

Keys are decrypted from Firestore in-memory only at the moment of the API call. Never logged. Never returned to frontend.

---

## Firebase Admin SDK Initialization (Backend)

```python
import firebase_admin
from firebase_admin import credentials, firestore, auth
import json, os

# Primary
cred_primary = credentials.Certificate(json.loads(os.environ['FIREBASE_SERVICE_ACCOUNT_JSON']))
app_primary = firebase_admin.initialize_app(cred_primary, name='primary')
db_primary = firestore.client(app=app_primary)

# Backup
cred_backup = credentials.Certificate(json.loads(os.environ['FIREBASE_BACKUP_SERVICE_ACCOUNT_JSON']))
app_backup = firebase_admin.initialize_app(cred_backup, name='backup')
db_backup = firestore.client(app=app_backup)

def get_active_db():
    """Return primary or backup Firestore client based on quota check."""
    meta_ref = db_primary.collection('_meta').document('quota')
    try:
        meta = meta_ref.get()
        if meta.exists and meta.to_dict().get('useBackupFirestore', False):
            return db_backup
    except Exception:
        return db_backup  # If primary is unreachable, use backup
    return db_primary
```

Auth token verification always uses primary Firebase project only.

---

## Sensitive Fields — Never Exposed

- `openrouterKeyEncrypted` — never returned to client, decrypted only in-memory on server
- `acrHostEncrypted` — same
- `acrAccessKeyEncrypted` — same
- `acrSecretKeyEncrypted` — same
- Firebase service account JSON — never in any source file
- Cloudinary API secret — never in any source file
- `ENCRYPTION_KEY` — Render env var only

---

## User Roles

| Role | Permissions |
|---|---|
| authenticated user | Read own user doc, read own jobs, call all /api/* endpoints |
| backend (Admin SDK) | Read/write all Firestore documents, upload to Cloudinary |
| unauthenticated | /health and /api/wakeup only |

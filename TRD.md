# Technical Requirements Document
# AudioWave — AI-Powered Audio Editor & Song Splitter

## Why This Stack

This project has two fundamentally different workloads.

**Workload A — Audio Editor:** Runs entirely in the browser. Web Audio API slices AudioBuffers. WaveSurfer.js renders waveforms on canvas. No server needed. Files never leave the device. Works offline on Android Chrome.

**Workload B — Python Pipeline:** librosa, pydub, scipy, numpy cannot run in a browser. FastAPI on Render wraps the existing splitter_agent.py with minimal changes. Async file upload handling, Firebase token verification, Cloudinary upload, and encrypted key retrieval all happen here.

**Dual Firebase + Dual Cloudinary:** Two Firebase projects and two Cloudinary accounts provide failover when free tier limits are approached. Auth always stays on the primary Firebase. Firestore and Cloudinary switch to backup when primary reaches capacity.

---

## Frontend

- **Framework:** Next.js 14 App Router + TypeScript
- **Styling:** Tailwind CSS v3
- **Animations:** Framer Motion v11
- **Audio Engine:** WaveSurfer.js v7 + Web Audio API
- **State:** React Context + useState/useReducer (no Zustand needed — state is page-scoped)
- **File Packaging:** JSZip + file-saver (ZIP download of multiple MP3s)
- **Auth Client:** Firebase JS SDK v10

## Backend

- **Language:** Python 3.11
- **Framework:** FastAPI
- **Server:** Uvicorn
- **Core pipeline libraries:** librosa, scipy, numpy, pydub, openai (OpenRouter client), requests (ACRCloud)
- **Additional:** cloudinary SDK, cryptography (Fernet AES-256), firebase-admin, python-multipart, python-dotenv, httpx

## Authentication

- **Provider:** Firebase Auth (primary: audiowave-app)
- **Backup auth project:** audiowave-app-backup — auth never uses backup; backup is Firestore/storage only
- **Methods:** Google OAuth, Email/Password, Apple, Phone
- **Session:** Firebase `browserLocalPersistence` — persists auth state in localStorage, auto-restores on return visit
- **Backend:** Every protected FastAPI endpoint verifies `Authorization: Bearer <firebase_id_token>` using `firebase_admin.auth.verify_id_token()` against primary project

## Database

- **Primary:** Firestore in audiowave-app project
- **Backup:** Firestore in audiowave-app-backup project
- **Failover logic (backend):** At the start of every Firestore write, check if primary daily write quota is near limit (track writes in a counter document). If primary is at >90% of 20K daily writes, route subsequent writes to backup Firestore. Reads always try primary first, then backup.
- **Collections:**
  - `users/{uid}` — `setupComplete: bool`, `openrouterKey: string (encrypted)`, `acrHost: string (encrypted)`, `acrAccessKey: string (encrypted)`, `acrSecretKey: string (encrypted)`, `createdAt: timestamp`
  - `jobs/{uid}_{jobId}` — `status: string`, `files: [{cloudinaryUrl, displayName, duration}]`, `createdAt: timestamp`
  - `_meta/quota` — `primaryWriteCount: number`, `lastReset: timestamp` (for failover tracking)

## File Storage

- **Primary Cloudinary:** Cloud name: dmi2mjb0c
- **Backup Cloudinary:** Cloud name: dn81t6uww
- **Failover logic (backend):** On startup and before each upload batch, query Cloudinary usage API. If primary usage > 90% of 25GB (22.5GB), switch all uploads to backup account.
- **Upload path pattern:** `audiowave/{uid}/{jobId}/song_{index:02d}.mp3`
- **After naming:** Files renamed in Cloudinary to `audiowave/{uid}/{jobId}/{SongName}.mp3`
- **Delivery:** Secure HTTPS URLs stored in Firestore jobs document, returned to frontend

## Hosting

- **Frontend:** Render Static Site (Next.js `output: 'export'`) OR Render Node.js Web Service
- **Backend:** Render Python Web Service (separate service, same Render account)
- **Wakeup handling:** Render free tier sleeps after 15 min inactivity. Frontend shows "Waking up the server... (~30s)" if first request to backend times out, then retries automatically.

## Security Architecture

Per ULTIMATE-SECURITY-RULES.md:

### Secrets Management
- ALL credentials live ONLY in Render Environment Variables — never in any source file
- `.env.example` contains variable names with empty values only
- `.gitignore` excludes all `.env*` files except `.env.example`
- Firebase public config (`NEXT_PUBLIC_FIREBASE_*`) is intentionally public — these are safe to expose in frontend bundle
- All other keys (Cloudinary, Firebase service account, encryption key) are backend-only via Render env vars

### User API Key Encryption
- User's OpenRouter key and ACRCloud credentials encrypted with `cryptography.fernet.Fernet`
- Encryption key: 32-byte URL-safe base64 key stored in `ENCRYPTION_KEY` Render env var
- Stored encrypted in Firestore — never in plain text anywhere
- Decrypted in-memory in FastAPI only at the moment of the API call, never logged

### Input Validation
- All FastAPI endpoints use Pydantic v2 models for request validation
- File uploads: MIME type validated by reading magic bytes (python-magic), not just Content-Type header
- Max upload size: 500MB (for long mixtapes)
- API key inputs: length and character validation before encryption and storage

### Auth on Every Protected Endpoint
- Every FastAPI endpoint that touches user data verifies Firebase ID token
- Token UID extracted from verified token — never trusted from request body

### CORS
- FastAPI CORS middleware: allowed origins explicitly set to the Render frontend URL
- No wildcard `*` in production

### Rate Limiting
- slowapi on FastAPI: 5 requests/15min per IP on `/api/process` (heavy pipeline endpoint)
- 60 requests/min per IP on all other endpoints
- Return 429 with `Retry-After` header

### Error Handling
- No stack traces ever returned to client
- Generic error messages in responses
- Full error + request context logged server-side only
- ACRCloud error 3003 → mapped to `{"error_type": "acr_limit_exceeded"}`
- OpenRouter 402/balance errors → mapped to `{"error_type": "openrouter_limit_exceeded"}`

### File Upload Safety
- Accepted MIME types: audio/mpeg, audio/wav, audio/ogg, audio/flac, audio/aac, audio/mp4, audio/x-m4a
- Magic bytes validation via `python-magic`
- Files renamed to UUID on server before processing — original filename never used for paths
- Files deleted from server disk immediately after Cloudinary upload

### XSS Prevention
- No `dangerouslySetInnerHTML` anywhere
- All user-supplied filenames (rename feature) sanitized before display using `DOMPurify`
- CSP headers set

## Key Libraries — Frontend

| Library | Version | Purpose |
|---|---|---|
| next | 14.x | Framework |
| typescript | 5.x | Type safety |
| tailwindcss | 3.x | Styling |
| framer-motion | 11.x | All animations |
| wavesurfer.js | 7.x | Waveform timeline |
| firebase | 10.x | Auth + Firestore client |
| jszip | 3.x | ZIP download |
| file-saver | 2.x | Browser download trigger |
| dompurify | 3.x | Sanitize user input before render |

## Key Libraries — Backend

| Library | Purpose |
|---|---|
| fastapi | Web framework |
| uvicorn | ASGI server |
| librosa | Audio feature extraction (Step 1) |
| pydub | Audio splitting and export (Step 3) |
| scipy | Signal processing, peak finding |
| numpy | Array math |
| openai | OpenRouter client (Step 2) |
| requests | ACRCloud HTTP calls (Step 4) |
| cloudinary | File upload to Cloudinary |
| cryptography | Fernet AES-256 for API key encryption |
| firebase-admin | ID token verification + Firestore writes |
| python-multipart | File upload parsing |
| python-dotenv | .env loading |
| python-magic | Magic bytes MIME validation |
| slowapi | Rate limiting |
| httpx | Async HTTP (Cloudinary usage check) |

## Environment Variables

### Frontend (.env.local) — All NEXT_PUBLIC_ values are intentionally public Firebase config

```
# Firebase public config — intentionally public (safe to expose in browser bundle)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Backend URL
NEXT_PUBLIC_BACKEND_URL=https://your-audiowave-backend.onrender.com
```

### Backend (Render Environment Variables — NEVER in any file)

```
# Primary Firebase Service Account (full JSON as single-line string)
FIREBASE_SERVICE_ACCOUNT_JSON=

# Backup Firebase Service Account (full JSON as single-line string)
FIREBASE_BACKUP_SERVICE_ACCOUNT_JSON=

# Primary Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Backup Cloudinary
CLOUDINARY_BACKUP_CLOUD_NAME=
CLOUDINARY_BACKUP_API_KEY=
CLOUDINARY_BACKUP_API_SECRET=

# Encryption key for user API keys (generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
ENCRYPTION_KEY=

# Frontend URL for CORS
FRONTEND_URL=https://your-audiowave-frontend.onrender.com
```

## Hard Constraints
- Free tier only — no paid services
- All audio editing must be client-side — no audio file uploads for the editor feature
- User API keys must never appear in logs, responses, error messages, or frontend code
- Must work on Android Chrome 90+ and desktop Chrome/Firefox/Safari
- Python backend must accept audio files up to 500MB
- ACRCloud error 3003 and OpenRouter 402 must be caught and returned as typed error codes — never raw error strings
- Primary Firebase handles all auth — backup Firebase is Firestore/storage failover only
- No credentials of any kind in any source file committed to GitHub

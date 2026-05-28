# BEHAVIOUR.md
# Coding Instructions for Claude Opus — AudioWave
# Place this file in the project root. Read this COMPLETELY before writing any line of code.

---

## WHO YOU ARE

You are a senior full-stack developer building AudioWave — an AI-powered web app that lets users edit audio files in the browser and split long YouTube mixtape downloads into individually named MP3 tracks using a Python AI pipeline.

You write clean, simple, correct code. You never over-engineer. You always read ALL existing files before touching anything. You never guess — you read the file that contains the answer.

---

## THE FIVE FILES YOU MUST READ FIRST

Before every single task, read these files in order:

1. `PRD.md` — what the app does, all features, user stories
2. `TRD.md` — exact tech stack, libraries, environment variables, security rules
3. `APP_FLOW.md` — every page route, every user journey, every error message
4. `BACKEND_SCHEMA.md` — every Firestore collection, every API endpoint, encryption logic, failover logic
5. `UI_UX.md` — exact colors (hex values), fonts, animation specs, component styles

Do not write any code until you have read all five files. If you cannot find a detail, read the relevant file again — do not guess.

---

## TECH STACK — USE ONLY THIS

### Frontend
- Framework: **Next.js 14 App Router with TypeScript**
- Styling: **Tailwind CSS v3**
- Animations: **Framer Motion v11**
- Audio: **WaveSurfer.js v7** + Web Audio API
- Auth client: **Firebase JS SDK v10**
- State: **React Context + useState/useReducer** (no Zustand, no Redux)
- File packaging: **JSZip + file-saver**
- Sanitization: **DOMPurify** (for any user-input text rendered in DOM)

### Backend
- Language: **Python 3.11**
- Framework: **FastAPI**
- Server: **Uvicorn**
- Pipeline: **librosa, pydub, scipy, numpy**
- LLM client: **openai** SDK pointed at OpenRouter base URL
- Music recognition: **requests** to ACRCloud REST API
- Storage: **cloudinary** SDK
- Encryption: **cryptography** (Fernet)
- Auth: **firebase-admin** SDK
- Rate limiting: **slowapi**
- File validation: **python-magic**

**Never use a different library than what is listed above without asking first.**
**Never install an extra library without asking first.**

---

## PAGES — THESE ARE THE ONLY PAGES THAT EXIST

| Route | Page Name |
|---|---|
| `/` | Login page |
| `/welcome` | Welcome page |
| `/editor` | Standalone Audio Editor |
| `/generator` | Generator hub (redirects to setup or upload based on setupComplete) |
| `/generator/setup` | First-time API key setup guide |
| `/generator/upload` | Audio file upload |
| `/generator/processing` | Pipeline progress (chat-style) |
| `/generator/preview` | Preview split songs |
| `/generator/editor` | Correction editor (same as /editor, pre-loaded with unselected files) |

**Never create a page that is not in this list.**

---

## USER FLOWS — NEVER BREAK THESE

### Auth
- User visits `/` → if session exists → redirect to `/welcome`
- User logs in → `setPersistence(auth, browserLocalPersistence)` → redirect to `/welcome`
- User visits any protected page without session → redirect to `/`
- Logout → clear session → redirect to `/`

### Generator first-time
- Click Generator on welcome → check `setupComplete` from Firestore → if false → popup → /generator/setup → complete guide → /generator/upload
- Second visit: check `setupComplete` → if true → go directly to /generator/upload

### Processing
- Upload file → /generator/processing → SSE stream → 4 chat messages one by one → done → preview songs button → /generator/preview → warning popup → select correct files → correct files downloadable → incorrect files → /generator/editor

### Token exceeded
- ACR 3003 error → popup → Continue → /generator/setup scrolled to ACRCloud section
- OpenRouter 402 error → popup → Continue → /generator/setup scrolled to OpenRouter section

---

## UI RULES — FOLLOW EXACTLY

### Colors — Use CSS Variables — Set These in globals.css First

```css
:root {
  --bg-deep: #080C14;
  --bg-surface: #0D1421;
  --glass-bg: rgba(255,255,255,0.04);
  --glass-border: rgba(255,255,255,0.08);
  --accent-cyan: #00D4FF;
  --accent-violet: #7B5EA7;
  --text-primary: #F0F4FF;
  --text-secondary: #7A8BA0;
  --text-muted: #3D4F63;
  --success: #22C55E;
  --warning: #F59E0B;
  --error: #EF4444;
  --waveform-filled: #00D4FF;
  --waveform-empty: #1E3A4A;
  --waveform-cursor: #FF6B35;
}
```

**Never use a color that is not in this list.**

### Fonts
- Heading: `Syne` (Google Fonts) — use for `<h1>`, `<h2>`, page titles, card titles, step numbers
- Body: `DM Sans` (Google Fonts) — use for all `<p>`, `<label>`, descriptions, tooltips, button text
- Monospace: `JetBrains Mono` (Google Fonts) — use for timestamps, seconds counters, file sizes, timecodes

Add to `app/layout.tsx`:
```tsx
import { Syne, DM_Sans, JetBrains_Mono } from 'next/font/google'
```

### Cards
```
background: var(--glass-bg)
backdrop-filter: blur(20px)
border: 1px solid var(--glass-border)
border-radius: 16px
```

Hover state: `border-color: rgba(0,212,255,0.2)` + `box-shadow: 0 0 20px rgba(0,212,255,0.1)`

### Buttons
Primary: `background: linear-gradient(135deg, #00D4FF, #7B5EA7)` + white text + border-radius 12px
Secondary: transparent + `border: 1px solid rgba(0,212,255,0.3)` + cyan text
Hover: scale(1.03) + glow shadow
Active: scale(0.97)

### Inputs
```
background: rgba(255,255,255,0.04)
border: 1px solid rgba(255,255,255,0.08)
border-radius: 8px
color: var(--text-primary)
font-family: DM Sans
```
Focus: `border-color: var(--accent-cyan)` + `box-shadow: 0 0 0 3px rgba(0,212,255,0.15)`

### Animations (Framer Motion patterns to use)

Page entry:
```tsx
initial={{ opacity: 0, y: 20 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.5 }}
```

Stagger children:
```tsx
// Parent
variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
// Child
variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
```

Processing chat message:
```tsx
initial={{ opacity: 0, x: -20 }}
animate={{ opacity: 1, x: 0 }}
transition={{ duration: 0.4, ease: 'easeOut' }}
```

Input shake on error:
```tsx
animate={{ x: [0, -8, 8, -8, 8, 0] }}
transition={{ duration: 0.4 }}
```

Modal spring:
```tsx
initial={{ scale: 0.9, opacity: 0 }}
animate={{ scale: 1, opacity: 1 }}
transition={{ type: 'spring', stiffness: 300, damping: 20 }}
```

---

## BACKEND RULES

### API Endpoint Rules
- Every protected endpoint must verify Firebase ID token first
- Verify using: `firebase_admin.auth.verify_id_token(token)` — always primary project
- Extract UID from verified token — never from request body
- Every endpoint uses Pydantic v2 for input validation
- Never return stack traces — catch all exceptions, return generic error JSON
- Error response shape: `{"success": false, "error": "Human-readable message"}` 
- Success response shape: `{"success": true, "data": {...}}`
- SSE errors during processing: `{"step": "error", "error_type": "acr_limit_exceeded"}` or `"openrouter_limit_exceeded"` or `"general"`

### Encryption
```python
from cryptography.fernet import Fernet
import os

fernet = Fernet(os.environ['ENCRYPTION_KEY'].encode())
def encrypt(text: str) -> str: return fernet.encrypt(text.encode()).decode()
def decrypt(text: str) -> str: return fernet.decrypt(text.encode()).decode()
```

### Error Detection
```python
# ACRCloud token limit
if response_json.get('status', {}).get('code') == 3003:
    raise ACRLimitExceeded()

# OpenRouter token limit  
if response.status_code == 402 or 'insufficient' in response.text.lower() or 'balance' in response.text.lower():
    raise OpenRouterLimitExceeded()
```

### File Upload Validation
```python
import magic
ALLOWED_MIMES = {'audio/mpeg','audio/wav','audio/ogg','audio/flac','audio/aac','audio/mp4','audio/x-m4a'}
MAX_SIZE = 500 * 1024 * 1024  # 500MB

async def validate_upload(file: UploadFile):
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(400, "File too large. Maximum 500MB.")
    mime = magic.from_buffer(content[:2048], mime=True)
    if mime not in ALLOWED_MIMES:
        raise HTTPException(400, "Invalid file type.")
    return content
```

### Dual Firebase Initialization
```python
import firebase_admin
from firebase_admin import credentials, firestore, auth as fb_auth
import json, os

cred_primary = credentials.Certificate(json.loads(os.environ['FIREBASE_SERVICE_ACCOUNT_JSON']))
app_primary = firebase_admin.initialize_app(cred_primary, name='primary')
db_primary = firestore.client(app=app_primary)

cred_backup = credentials.Certificate(json.loads(os.environ['FIREBASE_BACKUP_SERVICE_ACCOUNT_JSON']))
app_backup = firebase_admin.initialize_app(cred_backup, name='backup')
db_backup = firestore.client(app=app_backup)

def get_active_db():
    try:
        meta = db_primary.collection('_meta').document('quota').get()
        if meta.exists and meta.to_dict().get('useBackupFirestore', False):
            return db_backup
    except Exception:
        return db_backup
    return db_primary

def verify_token(token: str) -> str:
    # Always primary for auth
    decoded = fb_auth.verify_id_token(token, app=app_primary)
    return decoded['uid']
```

### Dual Cloudinary
```python
import cloudinary
import httpx, os

def configure_cloudinary(backup=False):
    if backup:
        cloudinary.config(
            cloud_name=os.environ['CLOUDINARY_BACKUP_CLOUD_NAME'],
            api_key=os.environ['CLOUDINARY_BACKUP_API_KEY'],
            api_secret=os.environ['CLOUDINARY_BACKUP_API_SECRET'],
        )
    else:
        cloudinary.config(
            cloud_name=os.environ['CLOUDINARY_CLOUD_NAME'],
            api_key=os.environ['CLOUDINARY_API_KEY'],
            api_secret=os.environ['CLOUDINARY_API_SECRET'],
        )

async def get_active_cloudinary():
    meta = db_primary.collection('_meta').document('quota').get()
    if meta.exists and meta.to_dict().get('useBackupCloudinary', False):
        return configure_cloudinary(backup=True)
    try:
        usage = cloudinary.api.usage()
        usage_gb = usage['storage']['usage'] / (1024**3)
        if usage_gb > 22.5:
            db_primary.collection('_meta').document('quota').set(
                {'useBackupCloudinary': True}, merge=True
            )
            return configure_cloudinary(backup=True)
    except Exception:
        pass
    return configure_cloudinary(backup=False)
```

---

## FRONTEND RULES

### API Calls
- All calls to the FastAPI backend go through `/lib/api.ts` — never inline fetch in a component
- Always attach Firebase ID token: `Authorization: Bearer ${await getIdToken()}`
- All calls wrapped in try/catch
- Loading, error, and success states handled for every call

### SSE (Server-Sent Events) for Processing
```ts
// In /lib/api.ts
export function streamProcess(file: File, onEvent: (event: ProcessingEvent) => void) {
  const formData = new FormData()
  formData.append('file', file)
  
  fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/process`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  }).then(response => {
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    // Read chunks and parse SSE data: lines
    // call onEvent for each parsed JSON event
  })
}
```

### Waveform (WaveSurfer.js)
```ts
import WaveSurfer from 'wavesurfer.js'

const ws = WaveSurfer.create({
  container: '#waveform',
  waveColor: '#1E3A4A',       // --waveform-empty
  progressColor: '#00D4FF',   // --waveform-filled
  cursorColor: '#FF6B35',     // --waveform-cursor
  height: 80,
  normalize: true,
  backend: 'WebAudio',
})
```

### User Input Sanitization (Rename Feature)
```ts
import DOMPurify from 'dompurify'
const safeName = DOMPurify.sanitize(rawInput, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim()
```

### No Secrets in Frontend
- `NEXT_PUBLIC_FIREBASE_*` variables are intentionally public (Firebase web config is safe to expose)
- No other secrets ever in frontend code
- No API keys, no Cloudinary secrets, no Firebase service account values in any frontend file

---

## EVERY PAGE MUST HAVE ALL FOUR STATES

No exceptions:

- **Loading** — spinner or skeleton while fetching
- **Error** — clear message if the request fails (from APP_FLOW.md error messages — use exact wording)
- **Empty** — friendly message when no data (from APP_FLOW.md empty states)
- **Success** — confirm the action worked

---

## BEGINNER-FRIENDLY ERROR MESSAGES

Use these exact messages from APP_FLOW.md — do not invent your own:

- Cut with no cursor: `"Move the cursor to a position on the timeline first, then click Cut."`
- Merge one block: `"Select two blocks to merge them."`
- Merge non-adjacent: `"You can only merge blocks that are next to each other."`
- File type wrong: `"This file type is not supported. Please upload an MP3, WAV, OGG, FLAC, AAC, or M4A file."`
- File too large: `"This file is too large. Maximum size is 500MB."`
- API key wrong format: `"This key doesn't look right. Please copy it again from [OpenRouter / ACRCloud] and try again."`
- Backend slow: `"The server is taking longer than expected. Please wait a moment and try again."`

---

## DATABASE RULES

- Firestore collections: `users`, `jobs`, `_meta` — exact names, no variations
- User document fields: exact names from BACKEND_SCHEMA.md (camelCase)
- Job document fields: exact names from BACKEND_SCHEMA.md
- All Firestore writes from backend only (Admin SDK) — client SDK reads only
- Before every Firestore write: call `get_active_db()` to check primary vs backup
- Auth token verification: always primary Firebase app — never backup

---

## WHAT YOU NEVER DO

- Never create a page that is not in the pages list above
- Never use a color, font, or style that is not in UI_UX.md / globals.css
- Never use a Firestore collection or field name that is not in BACKEND_SCHEMA.md
- Never use a library not listed in TRD.md without asking first
- Never hardcode any credentials, API keys, or secrets in any file
- Never put Firebase service account JSON in any source file — it goes only in Render env vars
- Never store sensitive data in localStorage (session only via Firebase's own persistence)
- Never delete working code without understanding why it exists
- Never write a function longer than 40 lines — break it up
- Never change more than what was asked in the current task
- Never call `dangerouslySetInnerHTML` without DOMPurify sanitization immediately before
- Never call `.map()` or `.filter()` on a value that might be undefined or null — check first
- Never return stack traces or raw error messages to the frontend

---

## CODE QUALITY CHECKLIST — RUN BEFORE FINISHING EVERY TASK

```
□ Did I read all 5 project files before writing anything?
□ Does every async call have await and try/catch?
□ Does every page have loading, error, empty, and success states?
□ Are all names clear and descriptive — no 'data', 'res', 'temp' variable names?
□ Are all colors and fonts from UI_UX.md only?
□ Are all Firestore collection/field names exactly from BACKEND_SCHEMA.md?
□ Is every protected API endpoint verifying the Firebase token?
□ Will the code crash if data is null or undefined?
□ Did I change only what was asked?
□ Are there zero hardcoded secrets or credentials in any file?
□ Does the UI work on mobile (Android Chrome) without horizontal overflow or broken layout?
□ Can a beginner read every error message and know what to do?
```

If any answer is no — fix it before finishing.

---

## OUTPUT FORMAT AFTER EVERY TASK

Always end your response with:

```
Files changed:
- [filename] — [what changed and why]

To verify:
1. [Exact step to test it works]
2. [Another step]

Warnings: [Anything to watch out for, or "None"]
```

---

## SETUP IMAGES REMINDER

When building the setup guide page (`/app/generator/setup/page.tsx`), use:
```tsx
<Image src="/setup-images/openrouter_step1.png" alt="OpenRouter Step 1" width={600} height={400} />
```

Images are in `/public/setup-images/`. All 13 images must be placed there by the developer before this page is tested. The image names are exactly:
- `openrouter_step1.png`, `openrouter_step3.png`, `openrouter_step4.png`, `openrouter_step5.png`
- `acr_step1.png` through `acr_step9.png`

Steps without images (OpenRouter step 2, 6, 7 and no others) show only the heading and text — no `<Image>` tag.

---

*Read this file completely before writing any code. Every rule applies to every task.*

# Implementation Plan — Build Order
# AudioWave

Read this file alongside PRD.md, TRD.md, APP_FLOW.md, BACKEND_SCHEMA.md, and UI_UX.md before writing any code.

---

## Phase 1: Project Setup & Infrastructure

### Frontend
- [ ] Create Next.js 14 project with TypeScript: `npx create-next-app@latest audiowave --typescript --tailwind --app`
- [ ] Install dependencies: `framer-motion wavesurfer.js firebase jszip file-saver dompurify @types/dompurify`
- [ ] Create folder structure:
  ```
  /app
    /login
    /welcome
    /editor
    /generator
      /setup
      /upload
      /processing
      /preview
      /editor
  /components
    /ui (Button, Card, Input, Modal, Tooltip)
    /auth (LoginForm, GoogleButton)
    /editor (Waveform, Toolbar, BlockList, Timeline)
    /generator (SetupGuide, UploadZone, ProcessingChat, PreviewList, PlayerCard)
  /lib
    /firebase.ts (Firebase client init)
    /auth.ts (auth helpers)
    /api.ts (backend API call functions)
    /encryption.ts (client-side key validation only)
  /hooks
    /useAuth.ts
    /useAudioEditor.ts
    /useProcessing.ts
  /public
    /setup-images (all 13 PNG files go here — see below)
  ```
- [ ] Create `.env.local` with all `NEXT_PUBLIC_FIREBASE_*` variables (empty at first)
- [ ] Create `.env.example` with all variable names, empty values, and comments
- [ ] Create `.gitignore` excluding `.env`, `.env.local`, `.env.*`, `node_modules`, `.next`
- [ ] Configure `next.config.js` — set `output: 'export'` if deploying as static, or keep default for Node.js on Render
- [ ] Configure Tailwind: add Syne, DM Sans, JetBrains Mono from Google Fonts in `app/layout.tsx`
- [ ] Set up CSS variables in `globals.css` for all colors from UI_UX.md

### Backend
- [ ] Create `/backend` folder in project root
- [ ] Create `requirements.txt`:
  ```
  fastapi
  uvicorn
  librosa
  pydub
  scipy
  numpy
  openai
  requests
  cloudinary
  cryptography
  firebase-admin
  python-multipart
  python-dotenv
  python-magic
  slowapi
  httpx
  ```
- [ ] Create `backend/main.py` (FastAPI app entry point)
- [ ] Create `backend/.env` (local dev only — in .gitignore)
- [ ] Create `backend/.env.example` with all variable names empty
- [ ] Add `backend/.env` to root `.gitignore`
- [ ] Create `Procfile` or `render.yaml` for Render deployment

✅ Done when: Frontend runs locally on localhost:3000, backend runs locally on localhost:8000 with `uvicorn main:app --reload`, both `.gitignore` files exclude all secrets

---

## Phase 2: Firebase Configuration

- [ ] Create `/lib/firebase.ts` — initialize Firebase with `NEXT_PUBLIC_FIREBASE_*` env vars
- [ ] Initialize both primary (audiowave-app) and backup (audiowave-app-backup) in backend `firebase_init.py`
- [ ] In backend: initialize primary Firebase Admin app + backup Firebase Admin app (see BACKEND_SCHEMA.md)
- [ ] Write `get_active_db()` function — returns primary or backup Firestore client based on quota
- [ ] Write `verify_firebase_token(token: str) -> str` function — returns UID or raises 401
- [ ] Set Firestore security rules (copy from BACKEND_SCHEMA.md) on BOTH Firebase projects
- [ ] Deploy Firestore security rules: Firebase Console → Firestore → Rules tab

✅ Done when: Backend can verify a Firebase ID token and write to Firestore. Backup Firestore connection confirmed working.

---

## Phase 3: Authentication

- [ ] Build `/app/login/page.tsx` — LoginPage component
  - Google OAuth button (Firebase signInWithPopup + GoogleAuthProvider)
  - Apple sign in button (Firebase signInWithPopup + OAuthProvider 'apple.com')
  - Email/Password form (Firebase signInWithEmailAndPassword + createUserWithEmailAndPassword)
  - Phone auth (Firebase signInWithPhoneNumber + confirmation)
  - Set `setPersistence(auth, browserLocalPersistence)` before every sign-in
  - After successful sign-in: redirect to /welcome
- [ ] Build `/hooks/useAuth.ts` — wraps `onAuthStateChanged`, exposes `{user, loading, logout}`
- [ ] Build `/lib/auth.ts` — `getIdToken()` helper for attaching to API calls
- [ ] Build auth redirect logic in `/app/layout.tsx` or a middleware: if user is logged in and visits `/`, redirect to `/welcome`
- [ ] Build logout: clears Firebase session + redirects to `/`
- [ ] Build protected route wrapper component: wraps any page, redirects to `/` if no user

✅ Done when: Google login works, session persists on refresh, logout clears session, protected pages redirect unauthenticated users to /

---

## Phase 4: Welcome Page

- [ ] Build `/app/welcome/page.tsx`
- [ ] Framer Motion animations: hero text words stagger in, cards slide up
- [ ] Two feature cards (Audio Editor, YouTube MP3 Generator) with hover glow and floating idle animation
- [ ] Card click: Audio Editor → /editor, Generator → check setupComplete → /generator or /generator/setup
- [ ] Top navbar with AudioWave logo, nav links, user avatar, logout
- [ ] Background particle animation (CSS keyframes — 20–30 floating dots)
- [ ] Apply all colors and fonts from UI_UX.md

✅ Done when: Welcome page matches UI_UX.md design, both cards navigate correctly, animations run smoothly on Android Chrome

---

## Phase 5: API Key Setup & Storage (Backend + Frontend)

- [ ] Build `POST /api/keys/save` endpoint in FastAPI:
  - Verify Firebase token → get UID
  - Validate all four keys with Pydantic (see BACKEND_SCHEMA.md validation rules)
  - Encrypt all four keys with Fernet using `ENCRYPTION_KEY` env var
  - Write encrypted values + `setupComplete: true` to Firestore `users/{uid}`
  - Return `{"success": true}`
- [ ] Build `GET /api/keys/status` endpoint:
  - Verify token → get UID
  - Read Firestore `users/{uid}.setupComplete`
  - Return `{"setupComplete": bool}`
- [ ] Build `/app/generator/setup/page.tsx` — SetupGuide component:
  - OpenRouter section (7 steps with images from /public/setup-images/)
  - ACRCloud section (9 steps with images)
  - Input boxes for API keys
  - Progress bar at top
  - Framer Motion step reveal animations
  - On "Complete Setup": POST to /api/keys/save → if success, navigate to /generator/upload
  - Input validation error: shake animation

✅ Done when: User can complete setup guide, keys are encrypted in Firestore, setupComplete is true, /api/keys/status returns true

---

## Phase 6: Audio File Upload Page

- [ ] Build `/app/generator/upload/page.tsx`
- [ ] Check `setupComplete` from /api/keys/status — if false, redirect to /generator/setup
- [ ] Two-option UI: YouTube link / Upload file
- [ ] YouTube link popup with yt1s.biz instructions
- [ ] Drag-and-drop zone + file input (native Android picker)
- [ ] Client-side file type validation (accept: .mp3, .wav, .ogg, .flac, .aac, .m4a)
- [ ] Client-side file size check (<500MB)
- [ ] File selected: show filename, size, format, "Start Processing" button
- [ ] Store selected file in React state / Context for the processing page

✅ Done when: File selection works on desktop drag-drop, click to browse, and Android native picker. Validation errors shown correctly.

---

## Phase 7: Backend Processing Pipeline

- [ ] Move existing `splitter_agent.py` logic into FastAPI structure:
  - `POST /api/process` receives audio file via multipart
  - Verify Firebase token
  - Validate file MIME type with python-magic
  - Save to temp UUID filename on disk
  - Run Step 1 (librosa analysis) — stream "analyzing" event
  - Run Step 2 (OpenRouter/DeepSeek) — stream "thinking" events with elapsed seconds
  - Run Step 3 (pydub split) — stream "saving" event
  - Run Step 4 (ACRCloud naming) — stream "naming" event
  - Upload all split files to Cloudinary (primary or backup based on quota)
  - Save job to Firestore
  - Stream "complete" event with jobId
  - Clean up temp files from disk
- [ ] Error handling:
  - ACRCloud 3003 → stream `{"step":"error","error_type":"acr_limit_exceeded"}`
  - OpenRouter 402/balance error → stream `{"step":"error","error_type":"openrouter_limit_exceeded"}`
  - All other errors → stream `{"step":"error","error_type":"general"}`
- [ ] Rate limiting: 5 requests/15min per IP on this endpoint (slowapi)
- [ ] `/api/wakeup` endpoint: returns `{"status":"ok"}` immediately — used by frontend to wake Render

✅ Done when: Full pipeline runs on a test audio file, all 4 steps complete, files appear in Cloudinary, job saved in Firestore, SSE events stream correctly

---

## Phase 8: Processing Page (Frontend)

- [ ] Build `/app/generator/processing/page.tsx`
- [ ] On mount: call `/api/wakeup` first — if response takes >3s, show "Waking up server..." message
- [ ] Open SSE connection to `/api/process` with the uploaded file
- [ ] Handle each SSE event type: analyzing, thinking (increment counter), saving, naming, complete, error
- [ ] Framer Motion: each message slides in from left with 400ms delay
- [ ] Typing indicator (3 bouncing dots) between messages
- [ ] Thinking counter: live seconds update with scale pulse animation
- [ ] On "complete": show "Done!" message + "Preview Songs" button
- [ ] On error_type "acr_limit_exceeded" or "openrouter_limit_exceeded": show token limit exceeded popup
- [ ] Token exceeded popup: identifies which service, instructions, Cancel / Continue buttons
- [ ] Continue: navigate to /generator/setup scrolled to the correct section (ACR or OpenRouter)

✅ Done when: Processing page shows all 4 steps appearing one by one, thinking counter increments live, done state works, error states work, token exceeded popup appears with correct service name

---

## Phase 9: Preview Page

- [ ] Build `/app/generator/preview/page.tsx`
- [ ] Fetch job data from `/api/jobs/{jobId}` using Firestore or direct API call
- [ ] Warning popup on mount (Framer Motion modal) — "Not it, show me" button to dismiss
- [ ] Left sidebar: file list with checkboxes (all checked by default), filenames, duration badges
- [ ] Center: one MP3 player card per file using WaveSurfer.js in small mode
  - Click play/pause on each card
  - Shows filename, duration, play button
- [ ] Double-click or right-click filename → inline rename input → Enter to save
  - On save: call `/api/files/rename` → backend renames in Cloudinary + updates Firestore
- [ ] "Unidentified Song XX" shown for unrecognized files
- [ ] "Continue" button: collect checked files (download list) + unchecked files (editor list)
- [ ] Checked files: show download panel with individual download links + "Download All ZIP"
- [ ] Unchecked files: navigate to /generator/editor with file URLs passed via state/URL params

✅ Done when: All split files play correctly, rename works, selecting/deselecting works, Continue routes correctly to download or editor

---

## Phase 10: Audio Editor (Full Implementation)

- [ ] Build `/app/editor/page.tsx` and `/app/generator/editor/page.tsx` (same component, different entry)
- [ ] WaveSurfer.js v7 initialization with dark theme colors from UI_UX.md
- [ ] Playback controls: play/pause, seek, current time / total time display
- [ ] Cut operation:
  - User clicks waveform → cursor placed at position (seconds)
  - Cut button click → split AudioBuffer at cursor → two new blocks
  - Error: no cursor placed → show tooltip "Move the cursor to a position first"
- [ ] Merge operation:
  - Select two adjacent blocks (click first, shift-click second)
  - Merge button → combine AudioBuffers → one block
  - Error: non-adjacent or only one → show tooltip message
- [ ] Block list in left sidebar: each block has label, duration, download button, selection checkbox
- [ ] Rename: double-click block label → inline edit → Enter saves (DOMPurify sanitize)
- [ ] Add File: file picker → new AudioBuffer appended to timeline
- [ ] Download Selected: encode selected AudioBuffer as MP3 → download
- [ ] Download All: JSZip all blocks → download ZIP
- [ ] Undo: revert last cut or merge (store history stack)
- [ ] First-time tooltip sequence (shown once per session)
- [ ] All beginner error messages from APP_FLOW.md
- [ ] Fully responsive — horizontal scroll on timeline for mobile

✅ Done when: Cut, merge, rename, download individual, download all ZIP work correctly on desktop Chrome and Android Chrome

---

## Phase 11: Dual Failover Logic

- [ ] Backend: implement `get_active_db()` (see BACKEND_SCHEMA.md) — checks _meta/quota document
- [ ] Backend: implement `get_active_cloudinary()` — checks Cloudinary usage API before upload batch
- [ ] Write unit test: simulate primary at >90% → confirm backup is used
- [ ] Write unit test: simulate primary Firestore quota near → confirm backup Firestore used
- [ ] Confirm auth always stays on primary (never uses backup for auth.verify_id_token)

✅ Done when: Manually setting `useBackupCloudinary: true` in Firestore _meta/quota causes uploads to go to backup Cloudinary. Same for Firestore.

---

## Phase 12: UI Polish & Animations

- [ ] Apply all Framer Motion animations from UI_UX.md to every page
- [ ] Add background particle animation on welcome and login pages
- [ ] Add waveform reveal animation on audio editor load
- [ ] Add hover glow effects on all cards and buttons
- [ ] Add tooltip system — consistent style across all interactive elements
- [ ] Check all four states (loading, error, empty, success) on every page
- [ ] Typography: confirm Syne is used for all headings, DM Sans for body, JetBrains Mono for timestamps
- [ ] Check all colors match UI_UX.md palette exactly

✅ Done when: Full UI matches UI_UX.md design brief. Animations run at 60fps on Android Chrome (no janky scroll or layout shift).

---

## Phase 13: End-to-End Testing

- [ ] Test full auth flow: Google login → session persists → logout clears
- [ ] Test first-time setup guide: complete all 13 steps, keys saved encrypted in Firestore
- [ ] Test file upload: drag-and-drop desktop, native picker Android, oversized file rejection
- [ ] Test full pipeline: upload real 10-minute mixtape → all 4 steps complete → files appear in preview
- [ ] Test token exceeded: simulate ACR 3003 error → popup appears → guide reopens at ACR section
- [ ] Test audio editor: cut, merge, rename, download all on desktop and Android
- [ ] Test preview rename: double-click → rename → confirmed in Cloudinary
- [ ] Test dual failover: force `useBackupCloudinary: true` → upload goes to backup account
- [ ] Test rate limiting: 6+ rapid requests to /api/process → 429 returned
- [ ] Test no credentials in source: `grep -r "AIzaSy\|sk-or\|-----BEGIN" src/` → zero results (only placeholder or empty)

✅ Done when: All test flows pass without errors on both desktop Chrome and Android Chrome

---

## Phase 14: Render Deployment

- [ ] Create two Render web services: one for frontend (Node.js), one for backend (Python)
- [ ] Add ALL backend environment variables in Render dashboard (never in files):
  - FIREBASE_SERVICE_ACCOUNT_JSON (full JSON, primary)
  - FIREBASE_BACKUP_SERVICE_ACCOUNT_JSON (full JSON, backup)
  - CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
  - CLOUDINARY_BACKUP_CLOUD_NAME, CLOUDINARY_BACKUP_API_KEY, CLOUDINARY_BACKUP_API_SECRET
  - ENCRYPTION_KEY
  - FRONTEND_URL
- [ ] Add ALL frontend environment variables in Render dashboard:
  - NEXT_PUBLIC_FIREBASE_* (all 5 Firebase public config values)
  - NEXT_PUBLIC_BACKEND_URL (the Render backend URL)
- [ ] Push code to GitHub → Render auto-deploys
- [ ] Test `/api/wakeup` from frontend confirms backend is live
- [ ] Run final smoke test: complete full generator flow on production URL

✅ Done when: App is live on Render, full pipeline works on production, no secrets in GitHub repo

---

## Setup Images Checklist

Place these files in `/public/setup-images/` before starting Phase 5:

```
openrouter_step1.png   — Step 1: Link to OpenRouter
openrouter_step3.png   — Step 3: New Key button
openrouter_step4.png   — Step 4: Name and Generate
openrouter_step5.png   — Step 5: Copy button
acr_step1.png          — Step 1: ACRCloud signup link
acr_step2.png          — Step 2: Login with preferred mode
acr_step3.png          — Step 3: Fill details and submit
acr_step4.png          — Step 4: Audio and Video Recognition menu
acr_step5.png          — Step 5: Projects in left nav
acr_step6.png          — Step 6: Audio and Video Recognition in Projects
acr_step7.png          — Step 7: Create Project button
acr_step8.png          — Step 8: Project config and Confirm
acr_step9.png          — Step 9: Copy credentials
```

All 13 images must be present before testing Phase 5. If any image is missing, the setup guide will still work but will show a placeholder.

# App Flow — All Pages & User Journeys
# AudioWave

## All Pages / Screens

| Route | Page Name | Description |
|---|---|---|
| `/` | Landing / Login | Firebase auth — Google, Email/Password, Apple, Phone. If session exists, redirect to /welcome |
| `/welcome` | Welcome | Animated intro, two feature cards: Audio Editor and YouTube MP3 Generator |
| `/editor` | Audio Editor | Standalone waveform editor — upload any audio, cut/merge/rename/download |
| `/generator` | YouTube MP3 Generator | First-time setup guide, file upload, processing, preview, correction editor, download |
| `/generator/setup` | Setup Guide | Step-by-step OpenRouter + ACRCloud API key guide with screenshots |
| `/generator/upload` | Upload Audio | After setup complete — YouTube link instructions + file upload |
| `/generator/processing` | Processing | Animated chat-style progress: Analyzing → Thinking → Saving → Naming |
| `/generator/preview` | Preview | Left sidebar file list + center MP3 players, select correct files |
| `/generator/editor` | Correction Editor | Same as /editor but pre-loaded with unselected files from preview |

---

## Navigation Structure

- **Top navbar** on all pages after login: AudioWave logo (left), nav links (Audio Editor, Generator), user avatar with logout (right)
- **No bottom tab nav** on mobile — top navbar collapses to hamburger menu on small screens
- **Back button** shown on all sub-pages of /generator

---

## Entry Point

A brand new visitor lands on `/`. They see the login page with the AudioWave logo, tagline, and three auth options: Continue with Google, Continue with Apple, Sign in with Email/Password. No redirect happens until login is complete.

---

## Auth Flow

```
New user:
/ (login page) → choose auth method → Firebase authenticates → setPersistence(browserLocalPersistence) → redirect to /welcome

Returning user with active session:
/ → Firebase detects existing session → auto-redirect to /welcome (no login screen shown)

Returning user whose session expired:
/ → Firebase detects no session → show login page
```

---

## Core User Journey 1: First-Time YouTube MP3 Generator

1. User lands on `/welcome`
2. User clicks "YouTube MP3 Generator" card
3. App checks Firestore: `users/{uid}.setupComplete === false` (or document doesn't exist)
4. **Setup popup appears:** "AudioWave is free and open source. To use the Generator, you need two free API keys. This takes about 10 minutes. We'll guide you through every step."
   - Cancel → redirect to /welcome
   - Continue → navigate to `/generator/setup`
5. **Setup Guide page** — two sections shown in sequence:
   - **OpenRouter section** (7 steps with images for steps 1, 3, 4, 5):
     - Each step: heading number, image (if available), description text below
     - Step 7: input box to paste API key
     - "Next: ACRCloud Setup" button appears after key is entered and validated (non-empty, min length check)
   - **ACRCloud section** (9 steps with images for all 9 steps):
     - Steps 1–8: heading, image, description
     - Step 9: three input boxes: ACR Host, ACR Access Key, ACR Secret Key
     - "Complete Setup" button appears after all three boxes filled
6. User clicks "Complete Setup"
7. Backend encrypts all four keys with Fernet and writes to Firestore `users/{uid}`
8. `setupComplete` set to `true` in Firestore
9. Navigate to `/generator/upload`

---

## Core User Journey 2: Returning User — YouTube MP3 Generator

1. User lands on `/welcome`
2. User clicks "YouTube MP3 Generator"
3. App checks Firestore: `setupComplete === true`
4. Navigate directly to `/generator/upload` (no setup guide shown)

---

## Core User Journey 3: YouTube MP3 Generator — Full Processing Flow

1. User is on `/generator/upload`
2. Two options shown:
   - **"I have a YouTube link"** → popup: "Visit https://v2.yt1s.biz/en19/ to download your audio as MP3. Higher quality = more accurate results. The site opens in a new tab. Come back here and upload the downloaded file." → Close button
   - **"Upload my file"** → drag-and-drop zone + "Choose file" button (triggers native Android/desktop file picker)
3. User selects/drops an audio file
4. File type validated client-side (accepted: .mp3, .wav, .ogg, .flac, .aac, .m4a)
5. "Start Processing" button appears
6. User clicks "Start Processing"
7. Navigate to `/generator/processing`
8. **Processing page — chat-like messages appear one by one:**
   - If Render backend is sleeping: "🔄 Waking up the server... (~30 seconds)" appears first, spins until backend responds
   - Message 1 appears: "📊 Analyzing your audio file..." (animated typing indicator below)
   - [Backend Step 1 completes — librosa analysis done]
   - Message 2 appears: "🧠 Thinking... 0s" → counter increments every second: 1s, 2s, 3s... (DeepSeek processing)
   - [Backend Step 2 completes — LLM returns segment timestamps]
   - Message 3 appears: "💾 Saving individual files..." (Step 3 — pydub splitting + Cloudinary upload)
   - [Backend Step 3 completes]
   - Message 4 appears: "🏷️ Naming your songs..." (Step 4 — ACRCloud recognition)
   - [Backend Step 4 completes — all files named]
   - Message 5 appears: "✅ Done! Your songs are ready."
   - "Preview Songs" button appears
9. User clicks "Preview Songs"
10. **Warning popup appears:**
    "Please review all songs before continuing. The AI may have made incorrect cuts. Listen to each one, check the file names, and select only the files that are correct. The unselected files will be sent to the Audio Editor so you can fix them manually."
    - "Got it, show me" button
11. Navigate to `/generator/preview`
12. **Preview page:**
    - Left sidebar: list of all song names with checkboxes (all checked by default)
    - Center: one MP3 player card per song — click to play, shows waveform, duration, filename
    - Files without a name: shown as "Unidentified Song 01", "Unidentified Song 02" etc.
    - Double-click or right-click filename → inline rename (edit in place, press Enter to save)
    - "Continue" button at bottom right
13. User unchecks incorrect files, clicks "Continue"
14. Checked files → "Download" section (bottom sheet or new panel): shows list with individual download buttons + "Download All as ZIP"
15. Unchecked files → navigate to `/generator/editor` with those files pre-loaded

---

## Core User Journey 4: Audio Editor (Standalone)

1. User clicks "Audio Editor" on welcome page
2. Navigate to `/editor`
3. Empty state: large drag-and-drop zone — "Drop your audio file here or click to choose"
4. User uploads file → waveform renders in the timeline
5. Timeline controls appear:
   - Playback bar: Play/Pause, current time, total duration
   - Toolbar: Cut, Merge, Add File, Download Selected, Download All, Undo
   - Waveform canvas with position cursor (vertical line)
   - Block labels above each segment (editable on double-click)
6. First-time tooltip sequence:
   - Tooltip 1 on waveform: "Click anywhere on the waveform to place your cursor"
   - Tooltip 2 on Cut: "Click Cut to split the audio at the cursor position"
   - Tooltip 3 on block: "Double-click the label above a block to rename it"
   - Each tooltip dismissed on hover or click
7. User cuts, merges, renames as needed
8. User clicks Download Selected (downloads chosen block as MP3) or Download All (ZIP of all blocks)

---

## Core User Journey 5: Token Limit Exceeded

1. User is on `/generator/processing`
2. Backend returns `{"error_type": "acr_limit_exceeded"}` OR `{"error_type": "openrouter_limit_exceeded"}`
3. Processing page stops animation
4. **Popup appears (ACR example):**
   "Your ACRCloud free trial has ended. No worries — you can create a new free ACRCloud account with a different Gmail address and continue using AudioWave for free. This app is always free and open source."
   - Cancel → stay on processing page, show "Processing stopped" message
   - Continue → navigate to `/generator/setup` scrolled directly to the ACRCloud section (not OpenRouter)
5. User completes new ACRCloud setup (steps 1–9 with images)
6. New encrypted credentials overwrite old ones in Firestore
7. Navigate back to `/generator/upload` to restart processing

---

## Empty States

- `/editor` before file upload: Full-width dashed border drop zone with upload icon and "Drop your audio file here or click to choose"
- `/generator/upload` before file selected: Upload zone with instructions
- `/generator/preview` if all files were unidentified: "No songs were automatically named. You can rename them by double-clicking."

---

## Error States

- File type not supported: "This file type is not supported. Please upload an MP3, WAV, OGG, FLAC, AAC, or M4A file."
- File too large (>500MB): "This file is too large. Maximum size is 500MB."
- Cut with no cursor placed: "Move the cursor to a position on the timeline first, then click Cut."
- Merge with only one block selected: "Select two blocks to merge them."
- Merge with non-adjacent blocks: "You can only merge blocks that are next to each other."
- Backend 500 error during processing: "Something went wrong on the server. Please try again." (no stack trace shown)
- Backend sleeping too long (>60s timeout): "The server is taking longer than expected. Please wait a moment and try again."
- API key validation fail on setup: "This key doesn't look right. Please copy it again from [OpenRouter / ACRCloud] and try again."

---

## Redirect Logic

- After login → /welcome
- After logout → / (login page)
- On / with active session → /welcome
- After setup complete → /generator/upload
- After processing complete → /generator/preview
- Cancel on setup popup → /welcome
- Token exceeded + Continue → /generator/setup (scrolled to correct section)
- After correction editor save → show download options

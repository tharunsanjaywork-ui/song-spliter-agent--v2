# Product Requirements Document
# AudioWave — AI-Powered Audio Editor & Song Splitter

## App Name
AudioWave

## Tagline
Edit audio. Split mixtapes. Powered by AI. Always free.

## Problem Being Solved
Tamil music collectors and DJs download hour-long mixtape MP3s from YouTube — files with 10–20 songs concatenated together with no track boundaries. Splitting them manually is tedious, error-prone, and requires expensive software. Naming each split file requires recognizing every song by ear. AudioWave solves both: it uses AI to automatically detect song boundaries, names each song via ACRCloud music recognition, and provides a full waveform editor for manual corrections — all free using the user's own API keys.

## Target User
Tamil music enthusiasts, DJs, and collectors primarily in India who use Android phones and occasional desktop browsers. They are not developers. They download hour-long Ilaiyaraaja or AR Rahman mixtapes from YouTube and want individual, properly named MP3 files.

## Core Features (Must Have)

### Authentication
- Firebase Google OAuth (one-click sign in)
- Firebase Email/Password sign in and sign up
- Apple sign in
- Phone authentication
- Cookie-based session persistence (auto-login on return visit)
- Redirect to welcome page after successful login
- Primary Firebase project: audiowave-app
- Backup Firebase project: audiowave-app-backup (used only if primary auth quota is hit)

### Welcome Page
- Animated letter-by-letter text intro about AudioWave
- Two glossy animated feature cards: Audio Editor and YouTube MP3 Generator
- Brief description under each card
- Futuristic glassmorphism dark UI with hundreds of micro-animations

### Audio Editor (Standalone Tool)
- Upload any audio file (MP3, WAV, OGG, FLAC, AAC, M4A) via drag-and-drop or native file picker
- WaveSurfer.js waveform timeline with second-level position markers
- Playback: play, pause, seek by clicking waveform
- Cut: place cursor on timeline → click Cut → splits into two named blocks
- Merge: select two adjacent blocks → click Merge → combines into one
- Rename: double-click any block label to rename inline
- Download individual block as MP3
- Download all blocks as ZIP
- Add file: upload a second audio and append it to the timeline
- Beginner-friendly tooltip popups explaining each button on first hover
- Context-sensitive error messages (e.g. "Move the cursor to a position first, then click Cut")
- All processing is 100% in-browser using Web Audio API — no server, no upload
- Loading, error, empty, and success states for every action
- Fully responsive for Android Chrome

### YouTube MP3 Generator
- First-time setup popup: explains that the app is free and open source, user needs to do one-time API key setup
- Cancel button on popup returns to welcome page
- Continue button opens the full setup guide
- Setup guide — OpenRouter section (7 steps with images for steps 1, 3, 4, 5):
  - Step 1: Click this link to open OpenRouter — https://openrouter.ai/settings/keys (image: openrouter_step1.png)
  - Step 2: Agree with the terms and conditions (no image)
  - Step 3: Click New Key at the top right corner (image: openrouter_step3.png)
  - Step 4: Name your key and click Generate (image: openrouter_step4.png)
  - Step 5: Click the Copy button (image: openrouter_step5.png)
  - Step 6: Close the dialog (no image)
  - Step 7: Paste your API key in the input box below (no image — input box shown)
- Setup guide — ACRCloud section (9 steps with images for steps 1, 2, 3, 4, 5, 6, 7, 8, 9):
  - Step 1: Click this link — https://console.acrcloud.com/signup#/register — Click Login/Sign Up (image: acr_step1.png)
  - Step 2: Login with your preferred mode (image: acr_step2.png)
  - Step 3: Fill in details and click Submit (image: acr_step3.png)
  - Step 4: Click Audio and Video Recognition (image: acr_step4.png)
  - Step 5: Click Projects on the left (image: acr_step5.png)
  - Step 6: Inside Projects, click Audio and Video Recognition (image: acr_step6.png)
  - Step 7: Click Create Project (image: acr_step7.png)
  - Step 8: Enter any name, use the same configuration shown, click Confirm (image: acr_step8.png)
  - Step 9: Copy Host, Access Key, and Secret Key separately, paste each into the three input boxes below (image: acr_step9.png)
- All 13 images placed in /public/setup-images/ folder
- API keys stored encrypted (AES-256 Fernet) in Firestore under user's UID — never in plain text
- After setup: "How would you like to add your audio?" — two options: (a) YouTube link (b) Upload file
- YouTube link option: popup explains to visit https://v2.yt1s.biz/en19/ to download audio, return and upload here. Note about quality accuracy.
- File upload: drag-and-drop or native Android file picker (works like WhatsApp file picker)
- After upload: Chat-like animated progress display (messages appear one by one):
  - "Analyzing your audio file..." (Step 1 — librosa analysis)
  - "Thinking... Xs" (Step 2 — DeepSeek V4 Flash via OpenRouter, live seconds counter)
  - "Saving individual files..." (Step 3 — pydub split)
  - "Naming your songs..." (Step 4 — ACRCloud recognition)
- Render backend wakeup: if backend is sleeping, show "Waking up the server... (~30 seconds)" before uploading
- After processing: Preview page
  - Warning popup before preview: "The AI is not perfect. Some cuts may be incorrect. Please listen to all files, select the ones that are correct, and click Continue. The rest will be sent to the Audio Editor for manual correction."
  - Continue button on popup
  - Left sidebar: list of all song filenames (selectable checkboxes)
  - Center: clickable MP3 player cards for each file
  - Files without a recognized name shown as "Unidentified - Song 01" etc.
  - Double-click or right-click any filename to rename inline
  - Select correct files → click Continue → correct files go to download page, unselected go to Audio Editor
- In Audio Editor (correction mode): left sidebar shows files to correct, drag-and-drop to timeline to edit
- Download: individual file or all as ZIP

### Token Limit Exceeded Flow
- ACRCloud error code 3003 ("Trial limit exceeded") detected in backend response
- OpenRouter error 402 or "insufficient credits" detected in backend response
- Popup appears identifying which service ran out
- Message: "Your [ACRCloud / OpenRouter] free trial has ended. You can create a new free account with a different Gmail address and use this app for free forever. This app is open source."
- Buttons: Cancel / Continue
- Continue → opens that specific setup guide from Step 1 (ACRCloud guide or OpenRouter guide, not both)
- New credentials overwrite old ones in Firestore (encrypted)

### Dual Firebase + Dual Cloudinary Failover
- Primary Firebase (audiowave-app): handles all authentication for all users
- Backup Firebase (audiowave-app-backup): activated automatically when primary Firestore quota is hit (NOT auth — auth stays on primary only)
- Primary Cloudinary (cloud: dmi2mjb0c): all MP3 file uploads go here first
- Backup Cloudinary (cloud: dn81t6uww): activated automatically when primary Cloudinary storage reaches 90% of free tier (25GB)
- Failover is silent to the user — no notification needed
- Logic lives in the backend: check primary capacity → if near limit → use backup

## Nice to Have (v2)
- Direct server-side YouTube download (bypass manual yt1s.biz step)
- PWA offline support for the audio editor
- Waveform zoom in/out
- Export at different bitrates
- Processing history page

## Out of Scope (v1)
- Native Android app
- Collaborative editing
- Paid subscription
- Video file support (MP4, MKV)

## User Stories
- As a Tamil music fan, I want to upload a 1-hour Ilaiyaraaja mixtape and get 15 individually named MP3 files
- As a first-time user, I want a step-by-step guide with screenshots to get my free API keys
- As a mobile user, I want the audio editor to work on my Android phone
- As a user whose ACRCloud trial expired, I want to be guided to create a new free account
- As a DJ, I want to cut, merge, and rename audio blocks on a waveform timeline

## Success Metrics
- Full YouTube MP3 Generator flow works end-to-end without errors
- Audio editor cut and merge works on Android Chrome without crashes
- First-time setup guide completable in under 10 minutes
- All 13 setup images display correctly
- Token limit exceeded flow identifies the correct API and opens the right guide
- Dual failover switches to backup services without user-visible errors

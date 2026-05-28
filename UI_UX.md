# UI/UX Design Brief
# AudioWave — Futuristic Glassmorphism Dark Theme

## Overall Aesthetic

Futuristic dark glassmorphism with electric accent glows. Inspired by audio software (Ableton, Serato) crossed with AI product interfaces (Claude, Perplexity). Dark navy/black backgrounds with frosted glass cards, neon cyan/violet accent glows, and smooth Framer Motion animations everywhere. The UI should feel like it lives inside a next-generation audio workstation — professional, precise, and alive. Every interaction has a response: hover glows, click ripples, staggered reveals, pulse animations on active states.

## Color Palette

| Role | Hex | Usage |
|---|---|---|
| Background Deep | #080C14 | Main page background — near-black dark navy |
| Background Surface | #0D1421 | Secondary background, page sections |
| Glass Surface | rgba(255,255,255,0.04) | Card/panel backgrounds with backdrop-blur |
| Glass Border | rgba(255,255,255,0.08) | Card borders |
| Primary Accent (Cyan) | #00D4FF | Primary buttons, active waveform cursor, links, key highlights |
| Secondary Accent (Violet) | #7B5EA7 | Secondary elements, hover states, gradients |
| Accent Gradient | linear-gradient(135deg, #00D4FF, #7B5EA7) | Hero text, feature card icons, badges |
| Text Primary | #F0F4FF | Headings, body text |
| Text Secondary | #7A8BA0 | Labels, captions, placeholder text |
| Text Muted | #3D4F63 | Timestamps, helper text |
| Success | #22C55E | Completed steps, success states |
| Warning | #F59E0B | Token limit warnings, review notices |
| Error | #EF4444 | Error states, validation failures |
| Waveform Filled | #00D4FF | Played portion of waveform |
| Waveform Unfilled | #1E3A4A | Unplayed portion of waveform |
| Waveform Cursor | #FF6B35 | Playback position line — orange for visibility |
| Timeline Block | rgba(0, 212, 255, 0.15) | Cut segment blocks on timeline |
| Timeline Block Border | #00D4FF | Cut segment block border |
| Timeline Block Selected | rgba(123, 94, 167, 0.25) | Selected block highlight |

## Typography

- **Display / Hero Font:** `Syne` (Google Fonts) — geometric, futuristic, wide letterforms. Used for main headings, feature card titles, page titles.
- **Body Font:** `DM Sans` (Google Fonts) — clean, modern, readable at small sizes. Used for all body text, labels, descriptions, tooltips.
- **Monospace (Timecodes):** `JetBrains Mono` (Google Fonts) — used for timeline timestamps, seconds counter, file sizes.
- **Base size:** 16px
- **Scale:** 12px (muted) → 14px (label) → 16px (body) → 20px (subheading) → 28px (heading) → 40px (hero) → 64px (display)
- **Letter spacing on display:** 0.05em (spread out, futuristic feel)

## Component Style

- **Border Radius:** 16px for cards, 12px for buttons, 8px for inputs, 24px for pills/badges
- **Shadows:** 
  - Card: `0 0 40px rgba(0,212,255,0.06)` — subtle cyan glow
  - Button hover: `0 0 20px rgba(0,212,255,0.3)` — stronger glow on hover
  - Active element: `0 0 30px rgba(0,212,255,0.5)` — bright glow
- **Primary Button:** `background: linear-gradient(135deg, #00D4FF, #7B5EA7)`, white text, border-radius 12px, hover: scale(1.03) + glow shadow, active: scale(0.97)
- **Secondary Button:** `background: transparent`, `border: 1px solid rgba(0,212,255,0.3)`, cyan text, hover: `background: rgba(0,212,255,0.08)`
- **Danger Button:** `background: rgba(239,68,68,0.15)`, red border, red text
- **Inputs:** `background: rgba(255,255,255,0.04)`, `border: 1px solid rgba(255,255,255,0.08)`, focus: `border-color: #00D4FF` + `box-shadow: 0 0 0 3px rgba(0,212,255,0.15)`, white text, DM Sans
- **Cards:** `background: rgba(255,255,255,0.04)`, `backdrop-filter: blur(20px)`, `border: 1px solid rgba(255,255,255,0.08)`, border-radius 16px, hover: border brightens to `rgba(0,212,255,0.2)` + subtle lift
- **Tooltips:** Dark glass surface, small, DM Sans 13px, fade in on hover with 300ms delay, max-width 220px

## Animations — Framer Motion

All animations use Framer Motion. Here is the full list by page:

### Login Page
- Logo fades in and slides up on mount (`initial: {opacity:0, y:30}` → `animate: {opacity:1, y:0}`, duration 0.8)
- Tagline types letter-by-letter after logo animation completes
- Auth buttons stagger in from bottom with 0.1s delay each
- Background: animated gradient mesh that slowly shifts colors (CSS animation, not Framer)

### Welcome Page
- Hero text: each word fades in and slides up with 0.06s stagger between words
- Subtitle fades in after hero text completes
- Feature cards slide up with spring physics (`type: "spring", stiffness: 100, damping: 15`)
- Cards have continuous idle animation: very subtle floating (translateY ±4px, 4s ease-in-out loop)
- Card hover: scale(1.04), border glow brightens, icon spins 5 degrees
- Background: floating particle dots (20–30 semi-transparent circles, drifting slowly — CSS keyframes)

### Setup Guide
- Each step section slides in from right as user scrolls to it (Framer Motion `whileInView`)
- Step images have a "screenshot reveal" animation: mask slides from left to right over 0.6s
- Progress indicator at top: filled bar advances smoothly between steps
- Input fields shake on validation error (Framer Motion `x: [0, -8, 8, -8, 0]` keyframes)

### Upload Page
- Drop zone pulses gently (border opacity oscillates 0.3→0.8 over 2s loop) when no file is selected
- When file is dragged over: drop zone scales to 1.02, border turns cyan, background tints cyan
- File accepted: checkmark icon scales in with spring, filename appears

### Processing Page (Chat-style)
- Each message appears from left (sliding in from x:-20, opacity 0 → opacity 1 with 0.4s ease-out)
- 400ms delay between each message appearing
- Typing indicator (three dots bouncing) appears after each message while waiting for next step
- Thinking step: seconds counter updates every second with a subtle scale pulse on each tick (scale 1 → 1.05 → 1)
- "Done" message: scale in from 0 with spring, cyan glow pulses twice

### Preview Page
- File list items stagger in from left (0.05s between each)
- MP3 player cards stagger in from bottom
- Checkbox check animation: scale in with spring
- Rename inline edit: input fades in replacing the label text

### Audio Editor
- Waveform renders with a left-to-right reveal animation after loading (CSS clip-path animation)
- Toolbar buttons animate in from top with stagger
- Cut action: a flash effect on the cut point (brief white line flash, 200ms)
- Block creation: new block scales in from center
- Tooltip: slide in from below the button, 150ms

## Dark / Light Mode

Default: **Dark only.** No light mode in v1. Background is always #080C14.

## Reference Apps for Design Inspiration

1. **Ableton Live** — waveform timeline, dark professional audio tool aesthetic
2. **Perplexity AI** — chat-style message reveals, glassmorphism, clean dark AI interface
3. **Linear** — micro-animations, polished interaction responses, keyboard-first but also touch-friendly

## Mobile Responsiveness

- Fully responsive — built mobile-first with Tailwind
- Timeline on mobile: horizontal scroll with touch drag support (WaveSurfer.js handles this)
- Toolbar on mobile: collapses to icon-only buttons with labels on long press
- File cards on preview page: full width on mobile (single column)
- Font sizes scale down one step on screens <640px
- Min touch target: 44px × 44px for all interactive elements
- Hamburger menu on top navbar below 768px
- File picker uses native Android file system picker (standard HTML `<input type="file">` with correct `accept` attribute)

## Accessibility

- Contrast ratio minimum 4.5:1 for all text
- All interactive elements have visible focus rings (cyan outline, 2px, 2px offset)
- All images have alt text
- ARIA labels on icon-only buttons
- Screen reader announcements for processing steps (aria-live="polite")
- Tooltip content readable by screen readers

## Stitch Design Prompts (for generating visual mockups in Stitch)

### Login Page
```
Design a futuristic dark login page for an AI audio editor called AudioWave. Background is near-black navy (#080C14) with a slowly shifting gradient mesh animation in deep blue and violet. Center card has frosted glass effect (backdrop-blur, semi-transparent white border). Card contains: AudioWave wordmark in Syne font with a cyan-to-violet gradient, tagline "Edit audio. Split mixtapes. Powered by AI." in DM Sans. Three auth buttons stacked: "Continue with Google" (outlined style, white border, white text), "Continue with Apple" (same style, Apple logo), "Sign in with Email" (gradient fill, cyan to violet). Floating abstract waveform lines in the background at low opacity. Add subtle glowing orbs in cyan and violet behind the card for depth. Mobile-first, centered layout.
```

### Welcome Page
```
Design a futuristic dark welcome page for AudioWave (AI audio app). Dark navy background (#080C14) with 20 floating semi-transparent particle dots drifting slowly. Hero section: large "Welcome to AudioWave" heading in Syne font, words rendered with cyan-to-violet gradient. Below: subtitle in DM Sans text secondary color. Below that: two large glassmorphism feature cards side by side (stack on mobile). Left card: "Audio Editor" with a waveform icon, cyan accent, brief description. Right card: "YouTube MP3 Generator" with an AI chip icon, violet accent, brief description. Each card: frosted glass background, glowing border on hover, floating idle animation. Cards have subtle glow shadow in their accent color. Top navbar: AudioWave logo left, nav links center, user avatar right. Everything animated in with staggered fade-up reveals.
```

### Processing Page
```
Design a futuristic dark AI processing page. Style: like a Claude or Perplexity AI chat interface but for audio processing. Background dark navy. Center column, max-width 640px. Chat messages appear one by one from the left side, each in a frosted glass bubble. Message 1: "Analyzing your audio file..." with a pulsing equalizer bar animation. Message 2: "Thinking... 12s" with a spinning DeepSeek-style brain icon and live seconds counter. Message 3: "Saving individual files..." with a download arrow animation. Message 4: "Naming your songs..." with a tag/label icon. Message 5: "Done! Your songs are ready." with a green checkmark. Between messages: three bouncing dots (typing indicator). Entire interface feels like watching an AI think in real time. Add a subtle cyan glow to the active message. Progress indicator line on the left side of the messages.
```

### Audio Editor
```
Design a futuristic dark audio waveform editor interface. Dark navy background. Top: file name, playback controls (play/pause, current time / total duration in JetBrains Mono font). Center: full-width waveform canvas — deep teal unfilled, bright cyan filled (played portion), orange vertical cursor line. Below waveform: timeline ruler with second markers in JetBrains Mono. Toolbar below: Cut (scissors icon), Merge (link icon), Add File (plus icon), Rename (pencil icon), Download Selected (download icon), Download All (archive icon), Undo (undo icon). Each tool button: frosted glass, cyan border on hover, tooltip label appearing below on hover. Left side: vertical list of cut blocks (each labeled with editable name, duration badge, individual download button). All in glassmorphism dark style with Syne headings and DM Sans labels. Mobile: toolbar scrolls horizontally.
```

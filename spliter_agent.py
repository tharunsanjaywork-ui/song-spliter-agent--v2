



"""
STEP 1 — Audio Feature Extractor
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Extracts ONLY the 4 parameters that research proves
matter for music boundary detection. No noise.

Parameters chosen (research-backed):
  1. RMS Energy    — where silence/loudness happens
  2. MFCC (13)     — instrument + voice texture changes
  3. Chroma CQT    — melody/key/raga changes (your "X")
  4. Mel Spec diff — overall spectral texture change

Each is saved at 1-second resolution.
Also saves deep energy valleys (exact silence points).

Output: song_analysis.json
"""

import os, json, time
import numpy as np
import librosa
from scipy.signal import savgol_filter

INPUT_FILE  = "input.mp3"
OUTPUT_JSON = "song_analysis.json"
AVG_SONG_MIN = 4.5   # expected average song length in minutes (used to estimate count)

print("=" * 60)
print("  STEP 1  —  Feature Extractor (4 clean parameters)")
print("=" * 60)
t0 = time.time()

# ── LOAD ──────────────────────────────────────
print(f"\n📂 Loading: {INPUT_FILE}")
y, sr = librosa.load(INPUT_FILE, sr=None, mono=True)
duration = librosa.get_duration(y=y, sr=sr)
total_sec = int(duration)

# Estimate target songs from duration — no hardcoded count
TARGET = max(2, round(duration / (AVG_SONG_MIN * 60)))

print(f"   Duration    : {int(duration//60)}:{int(duration%60):02d}  ({total_sec}s)")
print(f"   Sample rate : {sr} Hz")
print(f"   Target songs: ~{TARGET}  (estimated from duration ÷ {AVG_SONG_MIN} min avg)")

# ── PARAM 1: ENERGY at 10ms resolution ────────
print("\n── Param 1/4: Energy (10ms resolution)...")
hop_fine  = int(sr * 0.01)
rms_fine  = librosa.feature.rms(
                y=y,
                frame_length=int(sr * 0.05),
                hop_length=hop_fine)[0]
rms_db    = librosa.amplitude_to_db(rms_fine, ref=np.max)
t_fine    = librosa.frames_to_time(
                np.arange(len(rms_db)), sr=sr, hop_length=hop_fine)

# Energy at 1-second resolution (average per second)
energy_per_sec = []
for s in range(total_sec):
    lo = int(np.searchsorted(t_fine, s))
    hi = int(np.searchsorted(t_fine, s + 1))
    hi = max(hi, lo + 1)
    chunk = rms_db[lo:min(hi, len(rms_db))]
    energy_per_sec.append(round(float(np.mean(chunk)), 1))

print(f"   Done. Range: {min(energy_per_sec):.1f} to {max(energy_per_sec):.1f} dB")

# ── PARAM 2: MFCC at 1s resolution ────────────
print("── Param 2/4: MFCC timbre (1s resolution)...")
hop_1s = sr  # exactly 1 second per frame
mfcc   = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=hop_1s)
# Per second: [mean of 13 coefficients, std of 13 coefficients]
mfcc_means = [round(float(np.mean(mfcc[:, i])), 2)
              for i in range(mfcc.shape[1])]
mfcc_stds  = [round(float(np.std(mfcc[:, i])), 2)
              for i in range(mfcc.shape[1])]
print(f"   Done. {mfcc.shape[1]} frames.")

# ── PARAM 3: CHROMA at 1s resolution ──────────
print("── Param 3/4: Chroma/key (1s resolution)...")
chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop_1s)
# Dominant note per second (0=C, 1=C#, ... 11=B)
chroma_peak = [int(np.argmax(chroma[:, i]))
               for i in range(chroma.shape[1])]
# Chroma energy distribution (which notes are active)
chroma_energy = [[round(float(chroma[n, i]), 3)
                  for n in range(12)]
                 for i in range(chroma.shape[1])]
print(f"   Done. {chroma.shape[1]} frames.")

# ── PARAM 4: MEL SPECTROGRAM DIFFERENCE ───────
print("── Param 4/4: Mel spectrogram texture change...")
mel    = librosa.feature.melspectrogram(
             y=y, sr=sr, n_mels=64, hop_length=hop_1s, n_fft=2048)
mel_db = librosa.power_to_db(mel, ref=np.max)
# Frame-to-frame difference (novelty)
mel_diff = np.sqrt(np.sum(np.diff(mel_db, axis=1)**2, axis=0))
mel_diff = np.append(mel_diff, 0)
# Normalize
if mel_diff.max() > 0: mel_diff = mel_diff / mel_diff.max()
mel_novelty = [round(float(mel_diff[i]), 3)
               for i in range(len(mel_diff))]
print(f"   Done. {len(mel_novelty)} novelty scores.")

# ── DEEP ENERGY VALLEYS (silence fingerprint) ─
print("\n── Finding deep energy valleys...")
VALLEY_DB      = -40.0
MIN_VALLEY_SEC = 0.08
valleys = []
in_v, vs = False, 0

for i, db in enumerate(rms_db):
    if db < VALLEY_DB and not in_v:
        in_v = True; vs = i
    elif db >= VALLEY_DB and in_v:
        in_v = False
        dur = t_fine[i] - t_fine[vs]
        if dur >= MIN_VALLEY_SEC:
            seg     = rms_db[vs:i]
            deepest = vs + int(np.argmin(seg))
            t_val   = float(t_fine[deepest])
            db_val  = float(rms_db[deepest])

            # Check recovery: does energy jump back above -15dB within 0.5s?
            recovery_i  = int(np.searchsorted(t_fine, t_val + 0.5))
            recovery_i  = min(recovery_i, len(rms_db)-1)
            after_chunk = rms_db[i:recovery_i]
            recovers    = bool(np.any(after_chunk > -15.0)) if len(after_chunk) > 0 else False

            # Check fade-before: energy falling in 1.5s before valley?
            fade_lo  = max(0, int(np.searchsorted(t_fine, t_val - 1.5)))
            fade_seg = rms_db[fade_lo:vs]
            if len(fade_seg) > 4:
                mid      = len(fade_seg) // 2
                fade_ok  = bool(np.mean(fade_seg[:mid]) > np.mean(fade_seg[mid:]))
            else:
                fade_ok  = True  # too short to measure, assume ok

            valleys.append({
                "time_sec"   : round(t_val, 1),
                "time_min"   : f"{int(t_val//60)}:{int(t_val%60):02d}",
                "depth_db"   : round(db_val, 1),
                "duration_s" : round(dur, 3),
                "recovers"   : recovers,
                "fade_before": fade_ok,
                "is_candidate": recovers and db_val < -42.0,
            })

# Mark top candidates clearly
candidates = [v for v in valleys
              if v["is_candidate"] and v["depth_db"] < -42.0]
print(f"   Total valleys: {len(valleys)}")
print(f"   Strong candidates (deep + recovery): {len(candidates)}")
for v in sorted(candidates, key=lambda x: x["depth_db"])[:20]:
    print(f"   {v['time_min']:>8}  {v['depth_db']:>6.1f} dB  "
          f"dur={v['duration_s']:.2f}s  "
          f"recover={'✅' if v['recovers'] else '❌'}")

# ── BUILD PER-SECOND TABLE ─────────────────────
print("\n── Building per-second analysis table...")

# Align all features to per-second
n_mfcc_frames = mfcc.shape[1]
n_chr_frames  = chroma.shape[1]
n_mel_frames  = len(mel_novelty)

per_second = []
for s in range(total_sec):
    mfcc_i  = min(s, n_mfcc_frames - 1)
    chr_i   = min(s, n_chr_frames  - 1)
    mel_i   = min(s, n_mel_frames  - 1)

    # MFCC change from previous second
    if s > 0:
        prev_i    = min(s-1, n_mfcc_frames-1)
        mfcc_chg  = round(float(np.linalg.norm(
                        mfcc[:, mfcc_i] - mfcc[:, prev_i])), 2)
    else:
        mfcc_chg  = 0.0

    # Chroma change from previous second
    if s > 0:
        prev_ci   = min(s-1, n_chr_frames-1)
        chroma_chg= round(float(np.linalg.norm(
                        chroma[:, chr_i] - chroma[:, prev_ci])), 3)
    else:
        chroma_chg= 0.0

    per_second.append({
        "s"           : s,
        "t"           : f"{s//60}:{s%60:02d}",
        "energy_db"   : energy_per_sec[s] if s < len(energy_per_sec) else 0.0,
        "mfcc_mean"   : mfcc_means[mfcc_i],
        "mfcc_std"    : mfcc_stds[mfcc_i],
        "mfcc_change" : mfcc_chg,   # how much timbre changed from prev second
        "chroma_key"  : chroma_peak[chr_i],   # 0=C, 1=C#...11=B
        "chroma_change": chroma_chg, # how much key/melody changed
        "mel_novelty" : mel_novelty[mel_i],   # overall texture change
    })

print(f"   Built {len(per_second)} rows.")

# ── COMPUTE COMBINED NOVELTY SCORE ────────────
# One clean 0-1 novelty score per second
# Weighted: timbre change + key change + texture
print("── Computing combined novelty score...")
for row in per_second:
    m = min(row["mfcc_change"] / 50.0, 1.0)    # normalize
    c = min(row["chroma_change"] / 3.0, 1.0)
    n = row["mel_novelty"]
    row["novelty"] = round((m * 0.4) + (c * 0.35) + (n * 0.25), 3)

# Smooth novelty (7s window to remove beat-level noise)
novelty_raw = np.array([r["novelty"] for r in per_second])
if len(novelty_raw) > 15:
    w = 13
    novelty_smooth = savgol_filter(novelty_raw, window_length=w, polyorder=2)
    novelty_smooth = np.clip(novelty_smooth, 0, None)
    if novelty_smooth.max() > 0:
        novelty_smooth /= novelty_smooth.max()
    for i, row in enumerate(per_second):
        row["novelty_smooth"] = round(float(novelty_smooth[i]), 3)
else:
    for row in per_second:
        row["novelty_smooth"] = row["novelty"]

# ── SUMMARY STATS FOR CONTEXT ──────────────────
energies = [r["energy_db"] for r in per_second]
novelties= [r["novelty_smooth"] for r in per_second]

# Find top novelty spikes (likely boundaries)
from scipy.signal import find_peaks
peaks, _ = find_peaks(novelty_smooth,
                      distance=120,  # at least 2 min apart
                      prominence=0.1,
                      height=0.2)
top_novelty_times = [
    {"s": int(p), "t": f"{p//60}:{p%60:02d}",
     "novelty": round(float(novelty_smooth[p]), 3)}
    for p in peaks
]

# ── BUILD FINAL JSON ───────────────────────────
print("\n── Building JSON...")

data = {
    # ── METADATA ────────────────────────────
    "metadata": {
        "file"          : INPUT_FILE,
        "duration_sec"  : round(duration, 1),
        "duration_fmt"  : f"{int(duration//60)}:{int(duration%60):02d}",
        "sample_rate"   : sr,
        "target_songs"  : TARGET,
        "avg_song_min"  : round(duration / TARGET / 60, 2),
        "min_song_sec"  : 180,
        "max_song_sec"  : 420,
    },

    # ── WHAT THE LLM MUST DO ─────────────────
    "task": (
        f"This audio file contains Tamil film songs by "
        f"Ilaiyaraaja, all concatenated into one {int(duration//60)}-minute file. "
        f"Your job is to find ALL cut points (in seconds) "
        f"where one song ends and the next song begins. "
        f"The file is approximately {int(duration//60)} minutes long, suggesting roughly {TARGET} songs, "
        f"but output AS MANY CUTS AS NEEDED so that every segment is between 180 and 420 seconds. "
        f"Segment length compliance (180–420s) is MORE IMPORTANT than matching any specific song count. "
        f"Songs are between 3 and 7 minutes (180-420 seconds) long. "
        f"IMPORTANT: Ilaiyaraaja songs sometimes have dramatic internal "
        f"pauses that look like boundaries but are NOT. "
        f"A real boundary has BOTH deep silence AND musical change "
        f"(different melody/key/timbre in the next song). "
        f"An internal pause has silence but musical continuity resumes."
    ),

    # ── HOW TO READ THE DATA ──────────────────
    "data_guide": {
        "energy_db"     : "Loudness in decibels. 0=loudest, -60=near silence. Below -40 = potential gap.",
        "mfcc_change"   : "How much instrument/voice texture changed from previous second. High value = texture shift.",
        "chroma_key"    : "Dominant musical note (0=C, 1=C#, 2=D... 11=B). Changes at key/raga shifts.",
        "chroma_change" : "How much the melody/key changed from previous second. High = key/raga shift.",
        "mel_novelty"   : "Overall spectral texture change (0-1). High = major sound shift.",
        "novelty_smooth": "Combined 0-1 boundary score (smoothed). Values above 0.5 = likely boundary.",
    },

    # ── RULES FOR BOUNDARY DETECTION ─────────
    "rules": {
        "real_boundary": [
            "energy_db drops below -40 dB",
            "After the silence, energy recovers above -15 dB within 0.5 seconds",
            "novelty_smooth is HIGH (>0.4) in the seconds around the gap",
            "mfcc_change and/or chroma_change are HIGH immediately after the gap",
            "The gap is at least 180 seconds (3 min) from the previous cut",
            "The gap leaves at least 180 seconds (3 min) to the next cut or end of file",
        ],
        "internal_pause_NOT_boundary": [
            "energy dips but only to -25 to -38 dB (not deep enough)",
            "novelty_smooth stays LOW (<0.3) — same musical material continues",
            "mfcc_change and chroma_change are LOW — same song continues",
            "The dip is less than 180 seconds from the last confirmed cut",
        ],
        "false_positive_beat_pattern": [
            "Energy alternates rapidly between loud (-5 dB) and soft (-25 dB)",
            "This is a rhythmic beat intro — NOT a boundary",
            "Real boundaries have a sustained quiet period, not alternating",
        ],
    },

    # ── ENERGY VALLEYS (SILENCE FINGERPRINT) ──
    "energy_valleys": valleys,
    "strong_candidates": candidates,

    # ── TOP NOVELTY PEAKS ─────────────────────
    "top_novelty_peaks": top_novelty_times,

    # ── FULL PER-SECOND TABLE ─────────────────
    "per_second": per_second,

    # ── EXACT OUTPUT FORMAT REQUIRED ──────────
    "required_output_format": {
        "description": "Return ONLY valid JSON. No markdown, no explanation outside JSON.",
        "format": {
            "cuts_seconds": "Array of integers sorted ascending — as many as needed so every segment is 180–420s",
            "cuts_formatted": "Same cut times formatted as strings like '5:08'",
            "reasoning": "Your step-by-step analysis in one paragraph",
            "confidence_per_cut": "One string per cut: 'high', 'medium', or 'low'",
            "warnings": "Array of any uncertain cuts or issues found",
        },
        "example": {
            "cuts_seconds"      : [308, 576, 847, 1122, 1377, 1680, 1920, 2185, 2686, 3010],
            "cuts_formatted"    : ["5:08","9:36","14:07","18:42","22:57","28:00","32:00","36:25","44:46","50:10"],
            "reasoning"         : "Valley at 5:04 is -53dB with recovery and high novelty...",
            "confidence_per_cut": ["high","high","medium","high","high","low","high","medium","high","high"],
            "warnings"          : ["Cut at 28:00 is uncertain - novelty is only 0.31"],
        }
    }
}

with open(OUTPUT_JSON, "w") as f:
    json.dump(data, f, indent=2)

size_kb = os.path.getsize(OUTPUT_JSON) / 1024
elapsed = time.time() - t0
print(f"\n✅  Saved: {OUTPUT_JSON}")
print(f"    Size       : {size_kb:.1f} KB")
print(f"    Rows       : {len(per_second)} seconds")
print(f"    Valleys    : {len(valleys)} total, {len(candidates)} strong")
print(f"    Time taken : {elapsed:.1f}s")
print(f"\n▶  Now run: python step2_llm.py")






#-------------------------------------step2_llm_agent----------------------------------------------------------------------------------------------------------





"""
STEP 2 — DeepSeek V4 Flash via OpenRouter API
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Changes from previous version:
  ✅ Uses OpenRouter API  (base_url = https://openrouter.ai/api/v1)
  ✅ Model locked to deepseek/deepseek-v4-flash  (via OpenRouter)
  ✅ Thinking mode ENABLED at highest level
       → reasoning = {"effort": "high"}  (OpenRouter standard param)
  ✅ max_tokens = 16000  (enough for deep CoT + full JSON answer)
  ✅ reasoning_content streamed live so you can watch it think
  ✅ HTTP-Referer header added  (OpenRouter requirement)
  ✅ Separate API key area clearly marked
  ✅ Zero logic changes — only API connection changed

Setup:
  1. Go to https://openrouter.ai/settings/keys
  2. Create an API key and copy it
  3. Paste it below where it says YOUR_OPENROUTER_API_KEY_HERE
"""

import os, sys, json, re, time
from openai import OpenAI

# ══════════════════════════════════════════════════════════════
# ▼▼▼  PASTE YOUR OPENROUTER API KEY HERE  ▼▼▼
# Get it from: https://openrouter.ai/settings/keys
# ══════════════════════════════════════════════════════════════
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "YOUR_OPENROUTER_API_KEY_HERE")
# ══════════════════════════════════════════════════════════════

ANALYSIS_FILE = "song_analysis.json"
CUTS_FILE     = "llm_cuts.json"
BASE_URL      = "https://openrouter.ai/api/v1"
MODEL         = "deepseek/deepseek-v4-flash"   # locked — do not change

print("=" * 60)
print("  STEP 2  —  DeepSeek V4 Flash  (via OpenRouter)")
print("  Thinking Mode: ENABLED  |  Reasoning: HIGH")
print("=" * 60)

# ── Key check ────────────────────────────────────────────────
if not OPENROUTER_API_KEY or OPENROUTER_API_KEY == "YOUR_OPENROUTER_API_KEY_HERE":
    print()
    print("  ❌  API key not set!")
    print()
    print("  How to get your OpenRouter API key:")
    print("  1. Go to  https://openrouter.ai/settings/keys")
    print("  2. Click 'Create Key'")
    print("  3. Copy the key immediately (shown only once!)")
    print("  4. Open step2_llm.py and paste it where it says")
    print("     YOUR_OPENROUTER_API_KEY_HERE")
    print()
    sys.exit(1)

# ── Load JSON ─────────────────────────────────────────────────
if not os.path.exists(ANALYSIS_FILE):
    print(f"\n  ❌  {ANALYSIS_FILE} not found!")
    print("      Run step1_analyze.py first.")
    sys.exit(1)

print(f"\n  📂  Loading {ANALYSIS_FILE}...")
with open(ANALYSIS_FILE) as f:
    data = json.load(f)

meta       = data["metadata"]
per_second = data["per_second"]
valleys    = data["energy_valleys"]
candidates = data["strong_candidates"]
peaks      = data.get("top_novelty_peaks", [])
TARGET     = meta["target_songs"]
duration   = meta["duration_sec"]

print(f"  ✅  Loaded  —  {meta['duration_fmt']}  |  {len(candidates)} strong candidates")

def fmt_sec(s):
    s = max(0, int(s))
    return f"{s//60}:{s%60:02d}"

# ══════════════════════════════════════════════════════════════
# BUILD COMPRESSED PROMPT  (~10K tokens)
# ══════════════════════════════════════════════════════════════

print("\n  📝  Building compressed prompt...")

# 1. Valley table (all valleys, sorted deepest first)
valley_lines = []
for v in sorted(valleys, key=lambda x: x["depth_db"]):
    flag = "  ★ STRONG" if v.get("is_candidate") else ""
    valley_lines.append(
        f"  {v['time_min']:>7} ({int(v['time_sec']):>5}s)"
        f"  depth={v['depth_db']:>6.1f}dB"
        f"  dur={v['duration_s']:.2f}s"
        f"  recover={'YES' if v['recovers'] else 'NO '}"
        f"  fade={'YES' if v['fade_before'] else 'NO '}"
        f"{flag}"
    )

# 2. Overview every 30 seconds (coarse map of the whole file)
overview_lines = []
for row in per_second:
    if row["s"] % 30 == 0:
        e   = row["energy_db"]
        nov = row["novelty_smooth"]
        flag = ""
        if e < -45:   flag = "  ◄◄ DEEP SILENCE"
        elif e < -30: flag = "  ◄ quiet"
        if nov > 0.5: flag += "  [NOVELTY SPIKE]"
        overview_lines.append(
            f"  {row['t']:>7}  e={e:>6.1f}dB  nov={nov:.2f}{flag}"
        )

# 3. Dense context ±30s around each strong candidate only
context_blocks = []
strong = sorted(candidates, key=lambda x: x["depth_db"])[:15]
for v in strong:
    t  = int(v["time_sec"])
    lo = max(0, t - 30)
    hi = min(len(per_second)-1, t + 30)
    lines = []
    for row in per_second[lo:hi:2]:   # every 2 seconds
        e   = row["energy_db"]
        nov = row["novelty_smooth"]
        mc  = row["mfcc_change"]
        cc  = row["chroma_change"]
        flag = ""
        if e < -40:   flag = "  ◄◄ SILENCE"
        elif e < -28: flag = "  ◄ quiet"
        if nov > 0.5: flag += " [NOVELTY]"
        if mc > 30:   flag += " [TIMBRE↑]"
        if cc > 1.5:  flag += " [KEY↑]"
        lines.append(
            f"    {row['t']}  e={e:>6.1f}"
            f"  nov={nov:.2f}"
            f"  mΔ={mc:>5.1f}"
            f"  kΔ={cc:.2f}"
            f"{flag}"
        )
    context_blocks.append(
        f"\n  ── Valley at {v['time_min']} "
        f"({v['depth_db']:.0f}dB, recover={'YES' if v['recovers'] else 'NO'}) ──\n"
        + "\n".join(lines)
    )

SYSTEM = (
    "You are an expert music data analyst. "
    "You analyze audio feature data to find exact song boundaries. "
    "You reason step by step, cite specific data values, "
    "and return only valid JSON with no extra text."
)

PROMPT = f"""## TASK
This {meta['duration_fmt']} audio file has approximately {TARGET} Tamil film songs by Ilaiyaraaja
concatenated. Find all cut points where one song ends and the next begins.

## SEGMENT LENGTH CONSTRAINTS  (HARD LIMITS — these override the song count target)
- Each song segment: {meta['min_song_sec']}s minimum  to  390s maximum
- 390s = 6 minutes 30 seconds
- NO segment may exceed 390 seconds — this is a HARD LIMIT, no exceptions
- NO segment may be shorter than {meta['min_song_sec']} seconds — this is a HARD LIMIT
- Cuts must be sorted ascending
- The file likely has {TARGET} songs, but output AS MANY CUTS AS NEEDED so that
  every single segment is within [{meta['min_song_sec']}s, 390s].
  If satisfying the length limits requires {TARGET} cuts instead of {TARGET-1}, output {TARGET} cuts.
  Segment length compliance is MORE IMPORTANT than matching the song count exactly.

## RE-ANALYSIS RULE (CRITICAL — DO THIS BEFORE OUTPUTTING)
After choosing your cuts, simulate every segment boundary-to-boundary:
  segment_1  : 0s         → cuts[0]
  segment_2  : cuts[0]    → cuts[1]
  ...
  segment_N  : cuts[-1]   → {int(duration)}s  (end of file)

Check EVERY segment length:
  • If ANY segment > 390s  → find the deepest valley inside it and insert a cut there.
    Even a recover=NO valley is acceptable if it is the deepest available.
  • If ANY segment < {meta['min_song_sec']}s → remove that cut (merge with neighbour).
  • After every insertion or removal, re-check ALL segments again from scratch.
  • Do NOT output your answer until every single segment is within [{meta['min_song_sec']}s, 390s].
  • Do NOT omit a required cut just to match the {TARGET-1} cut target — length compliance wins.

## HOW TO READ THE DATA
- energy_db : loudness (0=max, below -40 = potential silence gap)
- mΔ (mfcc_change) : timbre/instrument texture change from previous second
- kΔ (chroma_change): melody/key change from previous second
- nov : combined novelty score 0–1 (above 0.4 = likely boundary)

## REAL BOUNDARY — ALL must be true
1. energy drops below -40 dB  AND  recover=YES (next song starts fast)
2. nov is HIGH (>0.35) in seconds right after the valley
3. mΔ or kΔ is HIGH after the valley (different song = different sound)
4. At least {meta['min_song_sec']}s from previous cut

## FALSE POSITIVE — reject if ANY is true
1. Valley depth only -25 to -38 dB (Ilaiyaraaja internal pause, not boundary)
2. nov stays LOW (<0.25) after gap (same song continues)
3. Energy alternates rapidly after gap (it's a beat intro, not a new song)
4. Less than {meta['min_song_sec']}s from last confirmed cut

## ALL ENERGY VALLEYS (sorted deepest first)
{chr(10).join(valley_lines)}

## TOP NOVELTY PEAKS
{chr(10).join([f"  {p['t']:>7} ({p['s']:>4}s)  nov={p['novelty']:.3f}" for p in peaks[:12]])}

## OVERVIEW every 30s
{chr(10).join(overview_lines)}

## DENSE CONTEXT ±30s around each strong candidate
{''.join(context_blocks)}

## OUTPUT — return ONLY this JSON, nothing else, no markdown fences:
{{
  "reasoning": "your step-by-step analysis citing actual dB and novelty values, including your segment-length verification pass",
  "cuts_seconds": [list of integers sorted ascending — as many as needed so every segment is {meta['min_song_sec']}–390s],
  "cuts_formatted": [same cut times formatted as "M:SS"],
  "confidence_per_cut": [one value per cut — "high", "medium", or "low"],
  "warnings": ["list any uncertain cuts or segments"]
}}"""

token_estimate = len(PROMPT) // 4
print(f"  ✅  Prompt ready  —  ~{len(PROMPT):,} chars  (~{token_estimate:,} tokens)")

# ══════════════════════════════════════════════════════════════
# SEND TO DEEPSEEK V4 PRO WITH THINKING MODE ON
# ══════════════════════════════════════════════════════════════

client = OpenAI(
    api_key=OPENROUTER_API_KEY,
    base_url=BASE_URL,
    default_headers={
        "HTTP-Referer": "https://github.com/song-splitter",   # required by OpenRouter
        "X-Title": "Song Splitter",                           # optional — shows in OR dashboard
    },
)

def call_model(prompt, system):
    """
    Call DeepSeek official API with:
      - stream=True      → see output token by token
      - thinking enabled → model reasons deeply before answering
      - reasoning_effort = high → maximum thinking depth
    """
    print(f"\n  🚀  Model     : {MODEL}")
    print(f"  🧠  Thinking  : ENABLED  (reasoning_effort=high)")
    print(f"  ⏳  Waiting for response (may take 60–180s with deep thinking)...")
    print(f"  💡  You will first see the thinking process, then the final answer\n")
    print("  " + "─" * 56)
    print("  💭  THINKING PROCESS:")
    print("  " + "─" * 56)

    stream = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": prompt},
        ],
        max_tokens=16000,        # large enough for deep CoT + full JSON answer
        stream=True,
        extra_body={
            "reasoning": {
                "effort": "high"   # OpenRouter standard reasoning param (high = ~80% tokens for thinking)
            },
        },
    )

    reasoning_text = ""
    answer_text    = ""
    in_thinking    = True
    char_count     = 0
    t_start        = time.time()

    for chunk in stream:
        if not getattr(chunk, "choices", None):
            continue
        delta = chunk.choices[0].delta

        # Stream reasoning_content (thinking process)
        if hasattr(delta, "reasoning_content") and delta.reasoning_content:
            token = delta.reasoning_content
            reasoning_text += token
            print(token, end="", flush=True)

        # Stream content (final answer)
        elif delta and delta.content:
            if in_thinking:
                # Switch from thinking → answer section
                in_thinking = False
                elapsed_think = time.time() - t_start
                print(f"\n  " + "─" * 56)
                print(f"  ✅  Thinking complete  —  {elapsed_think:.1f}s")
                print(f"  " + "─" * 56)
                print(f"  📋  FINAL ANSWER (JSON):")
                print(f"  " + "─" * 56)
            token = delta.content
            answer_text += token
            char_count  += len(token)
            print(token, end="", flush=True)

    elapsed = time.time() - t_start
    print(f"\n  " + "─" * 56)
    print(f"  ✅  Complete  —  thinking={len(reasoning_text)}chars  answer={char_count}chars  total={elapsed:.1f}s")
    return answer_text.strip(), reasoning_text.strip()

# ── Run the model ────────────────────────────────────────────
try:
    raw_text, reasoning_text = call_model(PROMPT, SYSTEM)
except KeyboardInterrupt:
    print("\n\n  ⛔  Cancelled by user.")
    sys.exit(0)
except Exception as e:
    err = str(e)
    print(f"\n  ❌  API call failed: {err[:200]}")
    if "401" in err or "auth" in err.lower():
        print("  ❌  Authentication error — check your API key!")
        print("      Get it from: https://openrouter.ai/settings/keys")
    elif "402" in err or "balance" in err.lower() or "credit" in err.lower() or "insufficient" in err.lower():
        print("  ❌  Insufficient credits — top up at:")
        print("      https://openrouter.ai/credits")
    elif "429" in err or "rate" in err.lower():
        print("  ⚠   Rate limited — wait a minute and try again.")
        print("      Free tier: 50 req/day (new users) or 1000 req/day (with credits)")
    elif "timeout" in err.lower():
        print("  ⚠   Request timed out — try again (thinking mode can be slow).")
    sys.exit(1)

if not raw_text:
    print("\n  ❌  Empty response from API.")
    print("      Please try again.")
    sys.exit(1)

print(f"\n  🤖  Model used: {MODEL}  (via OpenRouter, thinking mode: ON, effort: high)")

# ══════════════════════════════════════════════════════════════
# PARSE RESPONSE
# ══════════════════════════════════════════════════════════════

print("\n\n  🔍  Parsing response...")

def parse_response(raw):
    # 1. Direct JSON parse
    try:
        return json.loads(raw)
    except: pass

    # 2. Strip markdown fences
    clean = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`").strip()
    try:
        return json.loads(clean)
    except: pass

    # 3. Find JSON block
    match = re.search(r'\{[\s\S]*\}', clean)
    if match:
        try:
            return json.loads(match.group())
        except: pass

    # 4. Extract just cuts_seconds as last resort
    match = re.search(r'"cuts_seconds"\s*:\s*\[([^\]]+)\]', raw)
    if match:
        try:
            nums = [int(x.strip()) for x in match.group(1).split(",") if x.strip().lstrip('-').isdigit()]
            print("  ⚠   Partial parse — extracted cuts_seconds only")
            return {
                "reasoning"         : "Partial parse — see llm_raw.txt for full response",
                "cuts_seconds"      : nums,
                "cuts_formatted"    : [fmt_sec(n) for n in nums],
                "confidence_per_cut": ["medium"] * len(nums),
                "warnings"          : ["JSON parse failed; cuts extracted by fallback regex"],
            }
        except: pass

    return None

result = parse_response(raw_text)

# Save raw response + thinking process for debugging
with open("llm_raw.txt", "w", encoding="utf-8") as f:
    f.write("=== THINKING PROCESS ===\n\n")
    f.write(reasoning_text)
    f.write("\n\n=== FINAL ANSWER ===\n\n")
    f.write(raw_text)

if result is None:
    print("\n  ❌  Could not parse response as JSON.")
    print("      Raw response + thinking saved to llm_raw.txt")
    print("      Please open it and manually extract cut times.")
    print("      Then create llm_cuts.json with this format:")
    print('      {"cuts_seconds": [308, 576, 847, ...], "cuts_formatted": ["5:08", ...]}')
    sys.exit(1)

# ══════════════════════════════════════════════════════════════
# VALIDATE CUTS
# ══════════════════════════════════════════════════════════════

print("  🔎  Validating cuts...")

cuts   = result.get("cuts_seconds", [])
confs  = result.get("confidence_per_cut", [])
issues = []

# Ensure integers
try:
    cuts = [int(c) for c in cuts]
except Exception as e:
    issues.append(f"Non-integer in cuts_seconds: {e}")
    cuts = [int(c) for c in cuts if str(c).lstrip('-').isdigit()]

cuts = sorted(set(cuts))   # deduplicate and sort

# Enforce musical constraints
valid  = []
prev   = 0
for c in cuts:
    if c <= 0:
        issues.append(f"Cut at {fmt_sec(c)} is at/before start — removed")
    elif c >= int(duration):
        issues.append(f"Cut at {fmt_sec(c)} is at/after end — removed")
    elif c - prev < meta["min_song_sec"]:
        issues.append(
            f"Cut at {fmt_sec(c)} is only {c-prev}s from previous "
            f"(min={meta['min_song_sec']}s) — removed"
        )
    elif duration - c < meta["min_song_sec"]:
        issues.append(
            f"Cut at {fmt_sec(c)} leaves only {int(duration-c)}s to end — removed"
        )
    else:
        valid.append(c)
        prev = c

if issues:
    print("  ⚠   Validation issues:")
    for iss in issues:
        print(f"      • {iss}")

MAX_SONG_SEC = 390  # hard limit — same as what was told to the LLM

# ── Post-validation: auto-fix segments that exceed MAX_SONG_SEC ──────────────
# The LLM sometimes omits a needed cut to obey the song-count instruction.
# We fix it here using the valley data from song_analysis.json.
auto_fix_issues = []
changed = True
while changed:
    changed = False
    boundaries_check = [0] + sorted(valid) + [int(duration)]
    for i in range(len(boundaries_check) - 1):
        seg_s = boundaries_check[i]
        seg_e = boundaries_check[i + 1]
        if seg_e - seg_s > MAX_SONG_SEC:
            # Find the deepest valley inside this segment from song_analysis.json
            best_t    = None
            best_depth = 999.0
            for v in valleys:
                t = int(v["time_sec"])
                if seg_s + meta["min_song_sec"] < t < seg_e - meta["min_song_sec"]:
                    if v["depth_db"] < best_depth:
                        best_depth = v["depth_db"]
                        best_t     = t
            if best_t is not None and best_t not in valid:
                valid.append(best_t)
                valid = sorted(valid)
                msg = (
                    f"Segment {fmt_sec(seg_s)}–{fmt_sec(seg_e)} "
                    f"({seg_e-seg_s}s > {MAX_SONG_SEC}s limit): "
                    f"auto-inserted cut at {fmt_sec(best_t)} "
                    f"(deepest valley {best_depth:.1f}dB inside segment)"
                )
                auto_fix_issues.append(msg)
                print(f"  🔧  Auto-fix: {msg}")
                changed = True
                break   # restart loop with updated valid list
            else:
                msg = (
                    f"Segment {fmt_sec(seg_s)}–{fmt_sec(seg_e)} exceeds {MAX_SONG_SEC}s "
                    f"but no suitable valley found inside it — manual cut needed in step3"
                )
                auto_fix_issues.append(msg)
                print(f"  ⚠   {msg}")

if auto_fix_issues:
    issues.extend(auto_fix_issues)

result["cuts_seconds"]      = valid
result["cuts_formatted"]    = [fmt_sec(c) for c in valid]
result["validation_issues"] = issues
result["model_used"]        = MODEL
result["thinking_mode"]     = "enabled"
result["reasoning_effort"]  = "high"

with open(CUTS_FILE, "w") as f:
    json.dump(result, f, indent=2)

# ══════════════════════════════════════════════════════════════
# FINAL REPORT
# ══════════════════════════════════════════════════════════════

print(f"\n{'=' * 60}")
print(f"  DEEPSEEK V4 FLASH (OpenRouter) — FINAL DECISION")
print(f"{'=' * 60}")
print(f"\n  Model used     : {MODEL}  (via OpenRouter)")
print(f"  Thinking mode  : ENABLED  (effort=high)")
print(f"  Cuts found     : {len(valid)}  (need {TARGET-1})")
print()
print(f"  {'#':<4} {'Time':>7}  {'Confidence':<10}  Segment length")
print("  " + "─" * 45)

boundaries = [0] + valid + [int(duration)]
for i, c in enumerate(valid):
    conf = confs[i] if i < len(confs) else "?"
    icon = "🟢" if conf == "high" else ("🟡" if conf == "medium" else "🔴")
    seg_len = boundaries[i+1] - boundaries[i]
    print(f"  {i+1:<4} {fmt_sec(c):>7}  {icon} {conf:<8}  "
          f"(prev song was {seg_len//60}:{seg_len%60:02d})")

last_seg = int(duration) - (valid[-1] if valid else 0)
print(f"  {'':4} {'end':>7}  {'':10}  "
      f"(last song ~{last_seg//60}:{last_seg%60:02d})")

if result.get("warnings"):
    print(f"\n  ⚠   LLM warnings:")
    for w in result["warnings"]:
        print(f"      • {w}")

reasoning = result.get("reasoning", "")
if reasoning:
    print(f"\n  💭  Reasoning summary (from final answer):")
    for line in reasoning.replace(". ", ".\n").split("\n"):
        if line.strip():
            print(f"      {line.strip()}")

song_count = len(valid) + 1
print()
if song_count == TARGET:
    print(f"  🎯  Perfect — exactly {TARGET} songs found!")
elif song_count < TARGET:
    diff = TARGET - song_count
    print(f"  ⚠   Got {song_count} songs, need {TARGET}.")
    print(f"      Use  cut <#> <mm:ss>  in step3 to add {diff} more split(s).")
else:
    diff = song_count - TARGET
    print(f"  ⚠   Got {song_count} songs, need {TARGET}.")
    print(f"      Use  add <#1> <#2>  in step3 to merge {diff} extra split(s).")

print(f"\n  ✅  Saved to {CUTS_FILE}")
print(f"  📄  Full thinking + answer saved to llm_raw.txt")
print(f"  ▶   Now run: python step3_split.py")







#-----------------------------------------------------------------------step3_split_agent----------------------------------------------------------------------




"""
STEP 3 — Split + Interactive Correction
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reads llm_cuts.json, snaps each cut to the nearest
energy minimum, exports MP3 files, then gives you
the interactive cut/add/done loop.
"""

import os, sys, json, shutil
import numpy as np
import librosa
from pydub import AudioSegment

if not shutil.which("ffmpeg"):
    print("❌  ffmpeg not found!")
    print("    Windows: winget install ffmpeg  then restart terminal")
    sys.exit(1)

INPUT_FILE = "input.mp3"
CUTS_FILE  = "llm_cuts.json"
OUTPUT_DIR = "output_songs"

print("=" * 60)
print("  STEP 3  —  Split + Interactive Correction")
print("=" * 60)

if not os.path.exists(CUTS_FILE):
    print(f"\n❌  {CUTS_FILE} not found. Run step2_llm.py first.")
    sys.exit(1)

with open(CUTS_FILE) as f:
    result = json.load(f)

cuts = sorted(result.get("cuts_seconds", []))
confs= result.get("confidence_per_cut", [])

# Read TARGET and thresholds from llm_cuts.json metadata (set by step2)
meta          = result.get("meta", {})
TARGET        = meta.get("target_songs", len(cuts) + 1)
MIN_SONG_SEC  = meta.get("min_song_sec", 180)   # default 3:00
MAX_SONG_SEC  = meta.get("max_song_sec", 390)   # default 6:30

print(f"\n📋  LLM cuts loaded: {len(cuts)}")
print(f"    Target songs : {TARGET}")
print(f"    Min length   : {MIN_SONG_SEC//60}:{MIN_SONG_SEC%60:02d}")
print(f"    Max length   : {MAX_SONG_SEC//60}:{MAX_SONG_SEC%60:02d}")

# Load audio
print(f"📂  Loading: {INPUT_FILE}...")
y, sr    = librosa.load(INPUT_FILE, sr=None, mono=True)
duration = librosa.get_duration(y=y, sr=sr)

# Fine energy for snapping
hop_fine = int(sr * 0.01)
rms      = librosa.feature.rms(
               y=y, frame_length=int(sr*0.05), hop_length=hop_fine)[0]
rms_db   = librosa.amplitude_to_db(rms, ref=np.max)
t_fine   = librosa.frames_to_time(
               np.arange(len(rms_db)), sr=sr, hop_length=hop_fine)

def snap(t, window=3.0):
    """Snap time to nearest energy minimum within ±window seconds."""
    lo = max(0, int(np.searchsorted(t_fine, t - window)))
    hi = min(len(rms_db)-1, int(np.searchsorted(t_fine, t + window)))
    if lo >= hi: return t
    return float(t_fine[lo + int(np.argmin(rms_db[lo:hi]))])

def fmt(sec):
    sec = max(0.0, float(sec))
    return f"{int(sec//60)}:{int(sec%60):02d}"

# Snap all LLM cuts
print("\n── Snapping cuts to energy minima...")
snapped = []
for i, c in enumerate(cuts):
    s    = snap(c)
    diff = s - c
    conf = confs[i] if i < len(confs) else "?"
    icon = "🟢" if conf=="high" else ("🟡" if conf=="medium" else "🔴")
    moved = f"moved {diff:+.1f}s" if abs(diff) > 0.3 else "no change"
    print(f"  {icon} {fmt(c)} → {fmt(s)}  ({moved})  [{conf}]")
    snapped.append(s)

# Build segments
boundaries = [0.0] + sorted(snapped) + [duration]
segs = [[boundaries[i], boundaries[i+1]] for i in range(len(boundaries)-1)]
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── Helpers ───────────────────────────────────
def show(segs):
    print()
    print(f"  {'#':<4} {'Start':>7} {'End':>7} {'Length':>9}  Status")
    print("  " + "─" * 50)
    for i, (s, e) in enumerate(segs):
        L = e - s
        flag = ""
        if L < MIN_SONG_SEC:   flag = f"  ⚠ SHORT (<{MIN_SONG_SEC//60}:{MIN_SONG_SEC%60:02d})"
        elif L > MAX_SONG_SEC: flag = f"  ⚠ LONG  (>{MAX_SONG_SEC//60}:{MAX_SONG_SEC%60:02d})"
        print(f"  {i+1:<4} {fmt(s):>7} {fmt(e):>7} {L/60:>8.2f}m{flag}")
    print(f"\n  Total: {len(segs)} songs  (target: {TARGET})\n")

def save_all(segs):
    print("  Exporting MP3 files...")
    for f in os.listdir(OUTPUT_DIR):
        if f.endswith((".wav", ".mp3")):
            os.remove(os.path.join(OUTPUT_DIR, f))

    # Load audio with ffmpeg error tolerance — handles corrupt/non-standard MP3 headers
    # (common with YouTube-downloaded files encoded at 320kbps or with VBR tags)
    try:
        audio = AudioSegment.from_file(
            INPUT_FILE,
            format="mp3",
            parameters=["-err_detect", "ignore_err"]
        )
    except Exception:
        # Fallback: let pydub/ffmpeg auto-detect format without strict error checking
        audio = AudioSegment.from_file(INPUT_FILE)

    for i, (s, e) in enumerate(segs):
        clip  = audio[int(s * 1000) : int(e * 1000)]
        fname = f"{OUTPUT_DIR}/song_{i+1:02d}.mp3"
        clip.export(fname, format="mp3", bitrate="192k")
        print(f"  💾  song_{i+1:02d}.mp3  ({fmt(e-s)})")

# ── Show initial state ────────────────────────
print("\n" + "=" * 60)
print("  DETECTION RESULT")
print("=" * 60)
show(segs)

# ── Auto export ───────────────────────────────
print()
save_all(segs)
show(segs)
if len(segs) == TARGET:
    print(f"  🎯  Perfect — exactly {TARGET} songs saved to ./{OUTPUT_DIR}/")
else:
    print(f"  ✅  {len(segs)} songs saved to ./{OUTPUT_DIR}/")
    print(f"  ⚠   Expected {TARGET} songs.")





#-----------------------------------------------------step4_song_namer--------------------------------------------------------------------------------------------------







"""
SONG AUTO-NAMER — Uses ACRCloud (Free Trial, No Credit Card)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Setup (5 minutes, FREE):
  1. Go to  https://console.acrcloud.com/signup
  2. Sign up with email (no credit card)
  3. Create a project:
     Console → Projects → Create Project → Audio & Video Recognition
     → Attach bucket: "ACRCloud Music"
  4. Click your project → copy these 3 values:
       Host        (looks like: identify-eu-west-1.acrcloud.com)
       Access Key  (long string)
       Access Secret (long string)
  5. Paste all three below
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import os
import re
import sys
import time
import hmac
import base64
import hashlib
import shutil
import requests
from pydub import AudioSegment

# ══════════════════════════════════════════════
# ▼▼▼  PASTE YOUR ACRCLOUD CREDENTIALS HERE  ▼▼▼
# ══════════════════════════════════════════════
ACR_HOST   = "identify-ap-southeast-1.acrcloud.com"
ACR_KEY    = "a1687b57064b18ee7450701767eaf06b"
ACR_SECRET = "bEELH8KtRWAiAetfaZLolpEBp5aJERdXyHCA1LIn"
# ══════════════════════════════════════════════

SONGS_FOLDER  = "output_songs"
CLIP_SECONDS  = 12
SKIP_OFFSETS  = [5, 20, 40, 60]

# ══════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════

def check_setup():
    if not shutil.which("ffmpeg"):
        print("  ❌  ffmpeg not found. Run: winget install ffmpeg")
        sys.exit(1)
    if "YOUR_" in ACR_HOST or "YOUR_" in ACR_KEY or "YOUR_" in ACR_SECRET:
        print()
        print("  ❌  ACRCloud credentials not set!")
        print("  Paste your Host, Access Key, Access Secret in song_namer.py")
        sys.exit(1)

def safe_filename(name):
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', name)
    name = re.sub(r'\s+', '_', name.strip()).strip('._')
    return name[:80] if name else "Unknown"

def get_song_number(filename):
    m = re.match(r'^song_(\d+)', filename)
    return m.group(1) if m else None

def extract_clip(filepath, skip_sec, clip_sec):
    """Extract audio clip as WAV bytes for ACRCloud. Must be under 1MB."""
    tmp = "_acr_tmp.wav"
    try:
        audio   = AudioSegment.from_file(filepath)
        skip_ms = skip_sec * 1000
        clip_ms = clip_sec * 1000
        clip    = audio[skip_ms : skip_ms + clip_ms]
        if len(clip) < 2000:
            clip = audio[:clip_ms]
        if len(clip) < 1000:
            return None
        # Export as mono 16kHz to keep size well under 1MB
        clip = clip.set_channels(1).set_frame_rate(16000)
        clip.export(tmp, format="wav")
        with open(tmp, "rb") as f:
            data = f.read()
        return data
    except Exception as e:
        print(f"clip error: {e}")
        return None
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)

def call_acrcloud(audio_bytes):
    """
    Send audio to ACRCloud REST API.
    Signature per official docs:
      string_to_sign = METHOD + "\n" + URI + "\n" + access_key + "\n"
                     + data_type + "\n" + signature_version + "\n" + timestamp
    Signed with HMAC-SHA1 using access_secret as key.
    """
    http_method       = "POST"
    http_uri          = "/v1/identify"
    data_type         = "audio"
    signature_version = "1"
    timestamp         = str(time.time())   # float string, e.g. "1716812345.123"

    string_to_sign = (
        http_method + "\n" +
        http_uri + "\n" +
        ACR_KEY + "\n" +          # ← access_key MUST be included
        data_type + "\n" +
        signature_version + "\n" +
        timestamp
    )

    signature = base64.b64encode(
        hmac.new(
            ACR_SECRET.encode("ascii"),
            string_to_sign.encode("ascii"),
            digestmod=hashlib.sha1
        ).digest()
    ).decode("ascii")

    url = f"https://{ACR_HOST}/v1/identify"

    try:
        resp = requests.post(
            url,
            files={"sample": ("clip.wav", audio_bytes, "audio/wav")},
            data={
                "access_key"        : ACR_KEY,
                "data_type"         : data_type,
                "signature_version" : signature_version,
                "signature"         : signature,
                "sample_bytes"      : len(audio_bytes),
                "timestamp"         : timestamp,
            },
            timeout=20,
        )
        return resp.json()
    except requests.exceptions.Timeout:
        return {"status": {"code": -1, "msg": "Timeout"}}
    except Exception as e:
        return {"status": {"code": -1, "msg": str(e)}}

def parse_acrcloud(response):
    if not response:
        return None, None
    code = response.get("status", {}).get("code", -1)
    if code != 0:
        return None, None
    try:
        music  = response["metadata"]["music"][0]
        title  = (music.get("title", "") or "").strip()
        artists = music.get("artists", [{}])
        artist  = (artists[0].get("name", "") if artists else "").strip()
        return (title, artist) if title else (None, None)
    except (KeyError, IndexError):
        return None, None

def get_acr_error(response):
    if not response:
        return "No response"
    status = response.get("status", {})
    code   = status.get("code", "?")
    msg    = status.get("msg", "")
    codes  = {
        0    : "Success",
        1001 : "No result — song not in database",
        2000 : "Bad request",
        2001 : "Invalid access key",
        2002 : "Invalid signature",
        2004 : "No audio sample sent",
        2005 : "Audio sample too short",
        3000 : "Internal error",
        3003 : "Limit exceeded — trial ended",
        3014 : "Invalid permission — bucket not attached to project",
    }
    known = codes.get(code, "")
    return f"code={code} {known or msg}".strip()

# ══════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════

check_setup()

print("=" * 62)
print("  SONG AUTO-NAMER")
print("  Powered by ACRCloud Music Recognition")
print("=" * 62)

if not os.path.exists(SONGS_FOLDER):
    print(f"\n  ❌  Folder '{SONGS_FOLDER}' not found.")
    print("      Run step3_split.py first.")
    sys.exit(1)

song_files = sorted([
    f for f in os.listdir(SONGS_FOLDER)
    if f.lower().endswith((".mp3", ".wav"))
    and get_song_number(f) is not None
])

if not song_files:
    print(f"\n  ❌  No song_XX.mp3 files found in '{SONGS_FOLDER}'")
    sys.exit(1)

print(f"\n  📂  Found {len(song_files)} songs in ./{SONGS_FOLDER}/")
print(f"  🌐  Host  : {ACR_HOST}")
print(f"  🔑  Key   : ...{ACR_KEY[-8:]}")
print(f"  🎵  Clip  : {CLIP_SECONDS}s, offsets {SKIP_OFFSETS}s")
print()

renamed   = []
failed    = []
api_calls = 0

for filename in song_files:
    filepath = os.path.join(SONGS_FOLDER, filename)
    ext      = os.path.splitext(filename)[1].lower()
    num      = get_song_number(filename)
    found    = False

    print(f"  ▶  {filename}")

    for skip in SKIP_OFFSETS:
        audio_bytes = extract_clip(filepath, skip, CLIP_SECONDS)
        if audio_bytes is None:
            print(f"     offset {skip:>3}s — clip extraction failed")
            continue

        size_kb = len(audio_bytes) / 1024
        print(f"     offset {skip:>3}s  ({size_kb:.0f}KB)  →  ", end="", flush=True)

        response  = call_acrcloud(audio_bytes)
        api_calls += 1
        title, artist = parse_acrcloud(response)

        if title and artist:
            new_name = f"{num}_{safe_filename(title)}{ext}"
            new_path = os.path.join(SONGS_FOLDER, new_name)
            if os.path.abspath(filepath) != os.path.abspath(new_path):
                os.rename(filepath, new_path)
                filepath = new_path
            print(f"✅  {title}")
            print(f"     {'':>10}  Artist : {artist}")
            print(f"     {'':>10}  Saved  : {new_name}")
            renamed.append((filename, new_name, title, artist))
            found = True
            break
        else:
            err = get_acr_error(response)
            print(f"not recognized  ({err})")
            if "2001" in err or "2002" in err or "3014" in err:
                print("\n  ❌  Authentication error — check your credentials.")
                print("      Make sure ACRCloud Music bucket is attached to your project.")
                sys.exit(1)
            if "3003" in err:
                print("\n  ❌  Trial limit exceeded.")
                sys.exit(1)
            time.sleep(0.5)

    if not found:
        print(f"     ⚠  Not recognized at any offset — keeping original name")
        failed.append(filename)

    time.sleep(1.0)

print()
print("=" * 62)
print(f"  ✅  Renamed    : {len(renamed)} / {len(song_files)} songs")
print(f"  ⚠   Not found : {len(failed)} songs")
print(f"  📡  API calls  : {api_calls}")
print("=" * 62)

if renamed:
    print("\n  Renamed files:")
    for _, new, title, artist in renamed:
        print(f"    {new}  ({artist})")

if failed:
    print(f"\n  Not recognized:")
    for f in failed:
        print(f"    {f}")
    print()
    print("  Tips:")
    print("  • Old/rare Tamil songs may not be in ACRCloud's database")
    print("  • Try more offsets: SKIP_OFFSETS = [5, 20, 40, 60, 90, 120]")
    print("  • Check quota at console.acrcloud.com")
print()
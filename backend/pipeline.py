"""
pipeline.py
AudioWave backend — 4-step audio processing pipeline.

Extracts the logic from spliter_agent.py into async functions:
  step1_analyze  — librosa feature extraction
  step2_llm      — DeepSeek V4 Flash via OpenRouter
  step3_split    — pydub splitting with energy snap
  step4_name     — ACRCloud music recognition
  run_pipeline   — orchestrator yielding SSE events
"""

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
import re
import shutil
import time
import uuid
from typing import AsyncGenerator

import librosa
import numpy as np
import requests
from openai import OpenAI
from pydub import AudioSegment
from scipy.signal import find_peaks, savgol_filter

logger = logging.getLogger(__name__)

# ── Custom Exceptions ──────────────────────────────────────────────────────────

class ACRLimitExceeded(Exception):
    """ACRCloud error code 3003 — trial limit exceeded."""
    pass


class ACRInvalidCredentials(Exception):
    """ACRCloud signature or credential verification failed."""
    pass


class OpenRouterLimitExceeded(Exception):
    """OpenRouter 402 or insufficient balance error."""
    pass


# ── Constants ──────────────────────────────────────────────────────────────────

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_MODEL = "deepseek/deepseek-v4-flash"
AVG_SONG_MIN = 4.5
MIN_SONG_SEC = 180
MAX_SONG_SEC = 390
ALLOWED_AUDIO_EXTS = {".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a"}
ACR_CLIP_SECONDS = 12
ACR_SKIP_OFFSETS = [5, 20, 40, 60]


# ══════════════════════════════════════════════════════════════════════════════
# STEP 1 — Audio Feature Extraction (from spliter_agent.py lines 1-354)
# ══════════════════════════════════════════════════════════════════════════════

def _extract_features(audio_path: str) -> dict:
    """
    Run librosa feature extraction on the audio file.
    Returns the full analysis dict with metadata, valleys,
    novelty peaks, and per-second table.
    """
    logger.info("Step 1: Loading audio file %s", audio_path)
    y, sr = librosa.load(audio_path, sr=16000, mono=True)
    duration = librosa.get_duration(y=y, sr=sr)
    total_sec = int(duration)
    target_songs = max(2, round(duration / (AVG_SONG_MIN * 60)))

    # Energy at 10ms resolution
    hop_fine = int(sr * 0.01)
    rms_fine = librosa.feature.rms(
        y=y, frame_length=int(sr * 0.05), hop_length=hop_fine
    )[0]
    rms_db = librosa.amplitude_to_db(rms_fine, ref=np.max)
    t_fine = librosa.frames_to_time(
        np.arange(len(rms_db)), sr=sr, hop_length=hop_fine
    )

    # Energy at 1-second resolution
    energy_per_sec = []
    for s in range(total_sec):
        lo = int(np.searchsorted(t_fine, s))
        hi = int(np.searchsorted(t_fine, s + 1))
        hi = max(hi, lo + 1)
        chunk = rms_db[lo : min(hi, len(rms_db))]
        energy_per_sec.append(round(float(np.mean(chunk)), 1))

    # MFCC at 1s resolution
    hop_1s = sr
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=hop_1s)
    mfcc_means = [
        round(float(np.mean(mfcc[:, i])), 2) for i in range(mfcc.shape[1])
    ]
    mfcc_stds = [
        round(float(np.std(mfcc[:, i])), 2) for i in range(mfcc.shape[1])
    ]

    # Chroma at 1s resolution
    chroma = librosa.feature.chroma_stft(y=y, sr=sr, hop_length=hop_1s)
    chroma_peak = [
        int(np.argmax(chroma[:, i])) for i in range(chroma.shape[1])
    ]

    # Mel spectrogram difference
    mel = librosa.feature.melspectrogram(
        y=y, sr=sr, n_mels=64, hop_length=hop_1s, n_fft=2048
    )
    mel_db = librosa.power_to_db(mel, ref=np.max)
    mel_diff = np.sqrt(np.sum(np.diff(mel_db, axis=1) ** 2, axis=0))
    mel_diff = np.append(mel_diff, 0)
    if mel_diff.max() > 0:
        mel_diff = mel_diff / mel_diff.max()
    mel_novelty = [round(float(mel_diff[i]), 3) for i in range(len(mel_diff))]

    # Deep energy valleys
    valleys = _find_valleys(rms_db, t_fine)
    candidates = [
        v for v in valleys if v["is_candidate"] and v["depth_db"] < -42.0
    ]

    # Per-second table
    per_second = _build_per_second(
        total_sec, energy_per_sec, mfcc, mfcc_means, mfcc_stds,
        chroma, chroma_peak, mel_novelty
    )

    # Combined novelty score
    _compute_novelty(per_second)
    novelty_smooth = np.array([r["novelty_smooth"] for r in per_second])

    # Top novelty peaks
    top_peaks = []
    if len(novelty_smooth) > 15:
        peaks, _ = find_peaks(
            novelty_smooth, distance=120, prominence=0.1, height=0.2
        )
        top_peaks = [
            {"s": int(p), "t": f"{p // 60}:{p % 60:02d}",
             "novelty": round(float(novelty_smooth[p]), 3)}
            for p in peaks
        ]

    return {
        "metadata": {
            "duration_sec": round(duration, 1),
            "duration_fmt": f"{int(duration // 60)}:{int(duration % 60):02d}",
            "sample_rate": sr,
            "target_songs": target_songs,
            "min_song_sec": MIN_SONG_SEC,
            "max_song_sec": MAX_SONG_SEC,
        },
        "energy_valleys": valleys,
        "strong_candidates": candidates,
        "top_novelty_peaks": top_peaks,
        "per_second": per_second,
    }


def _find_valleys(rms_db, t_fine) -> list:
    """Find deep energy valleys in the audio signal."""
    valley_db = -40.0
    min_valley_sec = 0.08
    valleys = []
    in_v, vs = False, 0

    for i, db_val in enumerate(rms_db):
        if db_val < valley_db and not in_v:
            in_v = True
            vs = i
        elif db_val >= valley_db and in_v:
            in_v = False
            dur = t_fine[i] - t_fine[vs]
            if dur >= min_valley_sec:
                seg = rms_db[vs:i]
                deepest = vs + int(np.argmin(seg))
                t_val = float(t_fine[deepest])
                depth = float(rms_db[deepest])

                recovery_i = int(np.searchsorted(t_fine, t_val + 0.5))
                recovery_i = min(recovery_i, len(rms_db) - 1)
                after_chunk = rms_db[i:recovery_i]
                recovers = (
                    bool(np.any(after_chunk > -15.0))
                    if len(after_chunk) > 0 else False
                )

                fade_lo = max(0, int(np.searchsorted(t_fine, t_val - 1.5)))
                fade_seg = rms_db[fade_lo:vs]
                if len(fade_seg) > 4:
                    mid = len(fade_seg) // 2
                    fade_ok = bool(
                        np.mean(fade_seg[:mid]) > np.mean(fade_seg[mid:])
                    )
                else:
                    fade_ok = True

                valleys.append({
                    "time_sec": round(t_val, 1),
                    "time_min": f"{int(t_val // 60)}:{int(t_val % 60):02d}",
                    "depth_db": round(depth, 1),
                    "duration_s": round(dur, 3),
                    "recovers": recovers,
                    "fade_before": fade_ok,
                    "is_candidate": recovers and depth < -42.0,
                })
    return valleys


def _build_per_second(
    total_sec, energy_per_sec, mfcc, mfcc_means, mfcc_stds,
    chroma, chroma_peak, mel_novelty
) -> list:
    """Build the per-second analysis table."""
    n_mfcc_frames = mfcc.shape[1]
    n_chr_frames = chroma.shape[1]
    n_mel_frames = len(mel_novelty)
    per_second = []

    for s in range(total_sec):
        mfcc_i = min(s, n_mfcc_frames - 1)
        chr_i = min(s, n_chr_frames - 1)
        mel_i = min(s, n_mel_frames - 1)

        if s > 0:
            prev_i = min(s - 1, n_mfcc_frames - 1)
            mfcc_chg = round(float(
                np.linalg.norm(mfcc[:, mfcc_i] - mfcc[:, prev_i])
            ), 2)
        else:
            mfcc_chg = 0.0

        if s > 0:
            prev_ci = min(s - 1, n_chr_frames - 1)
            chroma_chg = round(float(
                np.linalg.norm(chroma[:, chr_i] - chroma[:, prev_ci])
            ), 3)
        else:
            chroma_chg = 0.0

        per_second.append({
            "s": s,
            "t": f"{s // 60}:{s % 60:02d}",
            "energy_db": energy_per_sec[s] if s < len(energy_per_sec) else 0.0,
            "mfcc_mean": mfcc_means[mfcc_i],
            "mfcc_std": mfcc_stds[mfcc_i],
            "mfcc_change": mfcc_chg,
            "chroma_key": chroma_peak[chr_i],
            "chroma_change": chroma_chg,
            "mel_novelty": mel_novelty[mel_i],
        })
    return per_second


def _compute_novelty(per_second: list):
    """Add combined + smoothed novelty scores to per_second rows."""
    for row in per_second:
        m = min(row["mfcc_change"] / 50.0, 1.0)
        c = min(row["chroma_change"] / 3.0, 1.0)
        n = row["mel_novelty"]
        row["novelty"] = round((m * 0.4) + (c * 0.35) + (n * 0.25), 3)

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


async def step1_analyze(audio_path: str) -> dict:
    """Step 1: Extract audio features using librosa. Runs in thread pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _extract_features, audio_path)


# ══════════════════════════════════════════════════════════════════════════════
# STEP 2 — LLM Boundary Detection (from spliter_agent.py lines 360-912)
# ══════════════════════════════════════════════════════════════════════════════

def _fmt_sec(s: int) -> str:
    s = max(0, int(s))
    return f"{s // 60}:{s % 60:02d}"


def _build_llm_prompt(analysis: dict) -> tuple[str, str]:
    """Build system message and user prompt from analysis data."""
    meta = analysis["metadata"]
    valleys = analysis["energy_valleys"]
    candidates = analysis["strong_candidates"]
    peaks = analysis.get("top_novelty_peaks", [])
    per_second = analysis["per_second"]
    target = meta["target_songs"]
    duration = meta["duration_sec"]

    # Valley table
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

    # Overview every 30s
    overview_lines = []
    for row in per_second:
        if row["s"] % 30 == 0:
            e = row["energy_db"]
            nov = row["novelty_smooth"]
            flag = ""
            if e < -45:
                flag = "  ◄◄ DEEP SILENCE"
            elif e < -30:
                flag = "  ◄ quiet"
            if nov > 0.5:
                flag += "  [NOVELTY SPIKE]"
            overview_lines.append(
                f"  {row['t']:>7}  e={e:>6.1f}dB  nov={nov:.2f}{flag}"
            )

    # Dense context around strong candidates
    context_blocks = []
    strong = sorted(candidates, key=lambda x: x["depth_db"])[:15]
    for v in strong:
        t = int(v["time_sec"])
        lo = max(0, t - 30)
        hi = min(len(per_second) - 1, t + 30)
        lines = []
        for row in per_second[lo:hi:2]:
            e = row["energy_db"]
            nov = row["novelty_smooth"]
            mc = row["mfcc_change"]
            cc = row["chroma_change"]
            flag = ""
            if e < -40:
                flag = "  ◄◄ SILENCE"
            elif e < -28:
                flag = "  ◄ quiet"
            if nov > 0.5:
                flag += " [NOVELTY]"
            if mc > 30:
                flag += " [TIMBRE↑]"
            if cc > 1.5:
                flag += " [KEY↑]"
            lines.append(
                f"    {row['t']}  e={e:>6.1f}"
                f"  nov={nov:.2f}"
                f"  mΔ={mc:>5.1f}"
                f"  kΔ={cc:.2f}"
                f"{flag}"
            )
        context_blocks.append(
            f"\n  ── Valley at {v['time_min']} "
            f"({v['depth_db']:.0f}dB, "
            f"recover={'YES' if v['recovers'] else 'NO'}) ──\n"
            + "\n".join(lines)
        )

    system_msg = (
        "You are an expert music data analyst. "
        "You analyze audio feature data to find exact song boundaries. "
        "You reason step by step, cite specific data values, "
        "and return only valid JSON with no extra text."
    )

    user_prompt = f"""## TASK
This {meta['duration_fmt']} audio file has approximately {target} Tamil film songs by Ilaiyaraaja
concatenated. Find all cut points where one song ends and the next begins.

## SEGMENT LENGTH CONSTRAINTS  (HARD LIMITS)
- Each song segment: {meta['min_song_sec']}s minimum  to  390s maximum
- NO segment may exceed 390 seconds — HARD LIMIT
- NO segment may be shorter than {meta['min_song_sec']} seconds — HARD LIMIT
- Cuts must be sorted ascending
- Output AS MANY CUTS AS NEEDED so that every segment is within [{meta['min_song_sec']}s, 390s].

## RE-ANALYSIS RULE (CRITICAL)
After choosing your cuts, simulate every segment boundary-to-boundary:
  segment_1: 0s → cuts[0]
  segment_2: cuts[0] → cuts[1]
  ...
  segment_N: cuts[-1] → {int(duration)}s (end of file)

Check EVERY segment length:
  • If ANY segment > 390s → find the deepest valley inside it and insert a cut there.
  • If ANY segment < {meta['min_song_sec']}s → remove that cut (merge with neighbour).
  • Do NOT output until every single segment is within [{meta['min_song_sec']}s, 390s].

## HOW TO READ THE DATA
- energy_db: loudness (0=max, below -40 = potential silence gap)
- mΔ (mfcc_change): timbre/instrument texture change from previous second
- kΔ (chroma_change): melody/key change from previous second
- nov: combined novelty score 0–1 (above 0.4 = likely boundary)

## REAL BOUNDARY — ALL must be true
1. energy drops below -40 dB AND recover=YES
2. nov is HIGH (>0.35) in seconds right after the valley
3. mΔ or kΔ is HIGH after the valley
4. At least {meta['min_song_sec']}s from previous cut

## FALSE POSITIVE — reject if ANY is true
1. Valley depth only -25 to -38 dB
2. nov stays LOW (<0.25) after gap
3. Energy alternates rapidly after gap (beat intro)
4. Less than {meta['min_song_sec']}s from last confirmed cut

## ALL ENERGY VALLEYS (sorted deepest first)
{chr(10).join(valley_lines)}

## TOP NOVELTY PEAKS
{chr(10).join([f"  {p['t']:>7} ({p['s']:>4}s)  nov={p['novelty']:.3f}" for p in peaks[:12]])}

## OVERVIEW every 30s
{chr(10).join(overview_lines)}

## DENSE CONTEXT ±30s around each strong candidate
{''.join(context_blocks)}

## OUTPUT — return ONLY this JSON, nothing else:
{{
  "reasoning": "your step-by-step analysis",
  "cuts_seconds": [list of integers sorted ascending],
  "cuts_formatted": [same cuts formatted as "M:SS"],
  "confidence_per_cut": [one value per cut — "high", "medium", or "low"],
  "warnings": ["list any uncertain cuts"]
}}"""

    return system_msg, user_prompt


def _parse_llm_response(raw: str) -> dict | None:
    """Try to parse the LLM JSON response with multiple fallbacks."""
    # Direct parse
    try:
        return json.loads(raw)
    except Exception:
        pass

    # Strip markdown fences
    clean = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`").strip()
    try:
        return json.loads(clean)
    except Exception:
        pass

    # Find JSON block
    match = re.search(r"\{[\s\S]*\}", clean)
    if match:
        try:
            return json.loads(match.group())
        except Exception:
            pass

    # Extract cuts_seconds as last resort
    match = re.search(r'"cuts_seconds"\s*:\s*\[([^\]]+)\]', raw)
    if match:
        try:
            nums = [
                int(x.strip()) for x in match.group(1).split(",")
                if x.strip().lstrip("-").isdigit()
            ]
            return {
                "reasoning": "Partial parse — cuts extracted by fallback",
                "cuts_seconds": nums,
                "cuts_formatted": [_fmt_sec(n) for n in nums],
                "confidence_per_cut": ["medium"] * len(nums),
                "warnings": ["JSON parse failed; fallback regex used"],
            }
        except Exception:
            pass
    return None


def _validate_cuts(
    cuts: list[int], duration: float, min_sec: int, valleys: list
) -> list[int]:
    """Validate and auto-fix cuts to respect segment length constraints."""
    cuts = sorted(set(int(c) for c in cuts))

    # Remove invalid cuts
    valid = []
    prev = 0
    for c in cuts:
        if c <= 0 or c >= int(duration):
            continue
        if c - prev < min_sec:
            continue
        if duration - c < min_sec:
            continue
        valid.append(c)
        prev = c

    # Auto-fix segments exceeding MAX_SONG_SEC
    changed = True
    while changed:
        changed = False
        boundaries = [0] + sorted(valid) + [int(duration)]
        for i in range(len(boundaries) - 1):
            seg_s = boundaries[i]
            seg_e = boundaries[i + 1]
            if seg_e - seg_s > MAX_SONG_SEC:
                best_t = None
                best_depth = 999.0
                for v in valleys:
                    t = int(v["time_sec"])
                    if seg_s + min_sec < t < seg_e - min_sec:
                        if v["depth_db"] < best_depth:
                            best_depth = v["depth_db"]
                            best_t = t
                if best_t is not None and best_t not in valid:
                    valid.append(best_t)
                    valid = sorted(valid)
                    changed = True
                    break

    return valid


def _call_openrouter(
    system_msg: str, user_prompt: str, api_key: str
) -> tuple[str, str]:
    """Call DeepSeek V4 Flash via OpenRouter. Returns (answer, reasoning)."""
    client = OpenAI(
        api_key=api_key,
        base_url=OPENROUTER_BASE_URL,
        default_headers={
            "HTTP-Referer": "https://audiowave.app",
            "X-Title": "AudioWave Song Splitter",
        },
    )

    try:
        stream = client.chat.completions.create(
            model=OPENROUTER_MODEL,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=16000,
            stream=True,
            extra_body={"reasoning": {"effort": "high"}},
        )
    except Exception as exc:
        err_str = str(exc)
        if "402" in err_str or "balance" in err_str.lower() \
                or "insufficient" in err_str.lower():
            raise OpenRouterLimitExceeded(err_str)
        raise

    reasoning_text = ""
    answer_text = ""

    for chunk in stream:
        if not getattr(chunk, "choices", None):
            continue
        delta = chunk.choices[0].delta

        if hasattr(delta, "reasoning_content") and delta.reasoning_content:
            reasoning_text += delta.reasoning_content

        elif delta and delta.content:
            answer_text += delta.content

    if not answer_text:
        raise RuntimeError("Empty response from OpenRouter API")

    return answer_text.strip(), reasoning_text.strip()


async def step2_llm(
    analysis: dict, openrouter_key: str
) -> dict:
    """Step 2: Call LLM for boundary detection. Runs in thread pool."""
    system_msg, user_prompt = _build_llm_prompt(analysis)

    loop = asyncio.get_event_loop()
    raw_text, reasoning = await loop.run_in_executor(
        None, _call_openrouter, system_msg, user_prompt, openrouter_key
    )

    result = _parse_llm_response(raw_text)
    if result is None:
        raise RuntimeError("Could not parse LLM response as JSON")

    cuts = result.get("cuts_seconds", [])
    meta = analysis["metadata"]
    valleys = analysis["energy_valleys"]

    valid_cuts = _validate_cuts(
        cuts, meta["duration_sec"], meta["min_song_sec"], valleys
    )

    result["cuts_seconds"] = valid_cuts
    result["cuts_formatted"] = [_fmt_sec(c) for c in valid_cuts]
    return result


# ══════════════════════════════════════════════════════════════════════════════
# STEP 3 — Split Audio (from spliter_agent.py lines 920-1065)
# ══════════════════════════════════════════════════════════════════════════════

def _snap_to_energy_min(
    cut_time: float, y, sr: int, window: float = 3.0
) -> float:
    """Snap a cut time to the nearest energy minimum within ±window."""
    hop_fine = int(sr * 0.01)
    rms = librosa.feature.rms(
        y=y, frame_length=int(sr * 0.05), hop_length=hop_fine
    )[0]
    rms_db = librosa.amplitude_to_db(rms, ref=np.max)
    t_fine = librosa.frames_to_time(
        np.arange(len(rms_db)), sr=sr, hop_length=hop_fine
    )

    lo = max(0, int(np.searchsorted(t_fine, cut_time - window)))
    hi = min(len(rms_db) - 1, int(np.searchsorted(t_fine, cut_time + window)))
    if lo >= hi:
        return cut_time
    return float(t_fine[lo + int(np.argmin(rms_db[lo:hi]))])


def _split_audio(
    audio_path: str, cuts: list[int], output_dir: str
) -> list[str]:
    """Split audio file at cut points, export as MP3s."""
    y, sr = librosa.load(audio_path, sr=None, mono=True)
    duration = librosa.get_duration(y=y, sr=sr)

    # Snap cuts to energy minima
    snapped = [_snap_to_energy_min(c, y, sr) for c in cuts]
    boundaries = [0.0] + sorted(snapped) + [duration]

    os.makedirs(output_dir, exist_ok=True)

    # Load with pydub for export
    try:
        audio = AudioSegment.from_file(
            audio_path, format="mp3",
            parameters=["-err_detect", "ignore_err"]
        )
    except Exception:
        audio = AudioSegment.from_file(audio_path)

    output_files = []
    for i in range(len(boundaries) - 1):
        start_ms = int(boundaries[i] * 1000)
        end_ms = int(boundaries[i + 1] * 1000)
        clip = audio[start_ms:end_ms]
        fname = f"song_{i + 1:02d}.mp3"
        fpath = os.path.join(output_dir, fname)
        clip.export(fpath, format="mp3", bitrate="192k")
        output_files.append(fpath)
        logger.info("Exported %s (%.1fs)", fname, (end_ms - start_ms) / 1000)

    return output_files


async def step3_split(
    audio_path: str, cuts: list[int], work_dir: str
) -> list[str]:
    """Step 3: Split audio at cut points. Runs in thread pool."""
    output_dir = os.path.join(work_dir, "output_songs")
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _split_audio, audio_path, cuts, output_dir
    )


# ══════════════════════════════════════════════════════════════════════════════
# STEP 4 — ACRCloud Song Naming (from spliter_agent.py lines 1070-1363)
# ══════════════════════════════════════════════════════════════════════════════

def _extract_clip_bytes(
    filepath: str, skip_sec: int, clip_sec: int
) -> bytes | None:
    """Extract a short audio clip as WAV bytes for ACRCloud."""
    try:
        audio = AudioSegment.from_file(filepath)
        skip_ms = skip_sec * 1000
        clip_ms = clip_sec * 1000
        clip = audio[skip_ms : skip_ms + clip_ms]
        if len(clip) < 2000:
            clip = audio[:clip_ms]
        if len(clip) < 1000:
            return None
        clip = clip.set_channels(1).set_frame_rate(16000)
        # Export to bytes buffer
        import io
        buf = io.BytesIO()
        clip.export(buf, format="wav")
        return buf.getvalue()
    except Exception as exc:
        logger.warning("Clip extraction failed: %s", exc)
        return None


def _call_acrcloud(
    audio_bytes: bytes, acr_host: str, acr_key: str, acr_secret: str
) -> dict:
    """Send audio to ACRCloud REST API for recognition."""
    http_method = "POST"
    http_uri = "/v1/identify"
    data_type = "audio"
    signature_version = "1"
    timestamp = str(time.time())

    string_to_sign = (
        http_method + "\n" + http_uri + "\n" + acr_key + "\n"
        + data_type + "\n" + signature_version + "\n" + timestamp
    )

    signature = base64.b64encode(
        hmac.new(
            acr_secret.encode("ascii"),
            string_to_sign.encode("ascii"),
            digestmod=hashlib.sha1,
        ).digest()
    ).decode("ascii")

    url = f"https://{acr_host}/v1/identify"
    try:
        resp = requests.post(
            url,
            files={"sample": ("clip.wav", audio_bytes, "audio/wav")},
            data={
                "access_key": acr_key,
                "data_type": data_type,
                "signature_version": signature_version,
                "signature": signature,
                "sample_bytes": len(audio_bytes),
                "timestamp": timestamp,
            },
            timeout=20,
        )
        return resp.json()
    except requests.exceptions.Timeout:
        return {"status": {"code": -1, "msg": "Timeout"}}
    except Exception as exc:
        return {"status": {"code": -1, "msg": str(exc)}}


def _parse_acr_response(response: dict) -> tuple[str | None, str | None]:
    """Parse ACRCloud response to extract title and artist."""
    if not response:
        return None, None
    code = response.get("status", {}).get("code", -1)
    if code != 0:
        return None, None
    try:
        music = response["metadata"]["music"][0]
        title = (music.get("title", "") or "").strip()
        artists = music.get("artists", [{}])
        artist = (artists[0].get("name", "") if artists else "").strip()
        return (title, artist) if title else (None, None)
    except (KeyError, IndexError):
        return None, None


def _safe_filename(name: str) -> str:
    """Sanitize a string for use as a filename."""
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", name)
    name = re.sub(r"\s+", "_", name.strip()).strip("._")
    return name[:80] if name else "Unknown"


def _name_songs(
    song_files: list[str],
    acr_host: str,
    acr_key: str,
    acr_secret: str,
) -> list[dict]:
    """Run ACRCloud recognition on each song file."""
    results = []

    for idx, filepath in enumerate(song_files):
        audio = AudioSegment.from_file(filepath)
        duration_sec = round(len(audio) / 1000.0, 1)
        display_name = f"Unidentified Song {idx + 1:02d}"
        recognized = False

        for skip in ACR_SKIP_OFFSETS:
            audio_bytes = _extract_clip_bytes(filepath, skip, ACR_CLIP_SECONDS)
            if audio_bytes is None:
                continue

            response = _call_acrcloud(audio_bytes, acr_host, acr_key, acr_secret)

            # Check for trial limit exceeded
            status_code = response.get("status", {}).get("code", -1)
            if status_code == 3003:
                raise ACRLimitExceeded("ACRCloud trial limit exceeded")
            elif status_code in (2004, 3000, 3015):
                raise ACRInvalidCredentials(f"ACRCloud credentials are invalid or misconfigured (error {status_code}).")

            title, artist = _parse_acr_response(response)
            if title:
                display_name = _safe_filename(title)
                recognized = True
                logger.info("Recognized: %s — %s", title, artist or "Unknown")
                break

            time.sleep(0.5)

        results.append({
            "index": idx,
            "displayName": display_name,
            "duration": duration_sec,
            "recognized": recognized,
            "localPath": filepath,
        })

        time.sleep(1.0)

    return results


async def step4_name(
    song_files: list[str],
    acr_host: str,
    acr_key: str,
    acr_secret: str,
) -> list[dict]:
    """Step 4: Name songs via ACRCloud. Runs in thread pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _name_songs, song_files, acr_host, acr_key, acr_secret
    )


# ══════════════════════════════════════════════════════════════════════════════
# PIPELINE ORCHESTRATOR
# ══════════════════════════════════════════════════════════════════════════════

async def run_pipeline(
    audio_path: str,
    uid: str,
    openrouter_key: str,
    acr_host: str,
    acr_key: str,
    acr_secret: str,
    work_dir: str,
    job_id: str = None,
) -> AsyncGenerator[dict, None]:
    """
    Run the full 4-step pipeline, yielding SSE event dicts at each stage.

    Events yielded:
      {"step": "analyzing", "message": "Analyzing your audio file..."}
      {"step": "thinking", "elapsed": N}
      {"step": "saving", "message": "Saving individual files..."}
      {"step": "naming", "message": "Naming your songs..."}
      {"step": "complete", "jobId": "...", "files": [...]}
      {"step": "error", "error_type": "...", "message": "..."}
    """
    if job_id is None:
        job_id = f"{uid}_job_{int(time.time())}"

    try:
        # ── Step 1: Analyze ──
        yield {"step": "analyzing", "message": "Analyzing your audio file..."}
        analysis = await step1_analyze(audio_path)
        logger.info("Step 1 complete: %d seconds analyzed",
                     len(analysis["per_second"]))

        # ── Step 2: LLM ──
        # Start yielding "thinking" events with elapsed time
        think_start = time.time()
        yield {"step": "thinking", "elapsed": 0}

        # Run LLM in background, yield elapsed ticks
        llm_task = asyncio.create_task(
            step2_llm(analysis, openrouter_key)
        )

        while not llm_task.done():
            await asyncio.sleep(1.0)
            elapsed = int(time.time() - think_start)
            yield {"step": "thinking", "elapsed": elapsed}

        llm_result = llm_task.result()
        cuts = llm_result.get("cuts_seconds", [])
        logger.info("Step 2 complete: %d cuts found", len(cuts))

        # ── Step 3: Split ──
        yield {"step": "saving", "message": "Saving individual files..."}
        song_files = await step3_split(audio_path, cuts, work_dir)
        logger.info("Step 3 complete: %d files created", len(song_files))

        # ── Step 4: Name ──
        yield {"step": "naming", "message": "Naming your songs..."}
        named_files = await step4_name(song_files, acr_host, acr_key, acr_secret)
        logger.info("Step 4 complete: %d files named", len(named_files))

        # ── Done ──
        yield {
            "step": "complete",
            "jobId": job_id,
            "files": named_files,
        }

    except ACRLimitExceeded:
        logger.warning("ACRCloud limit exceeded for user %s", uid)
        yield {"step": "error", "error_type": "acr_limit_exceeded"}

    except ACRInvalidCredentials as exc:
        logger.warning("ACRCloud credentials invalid for user %s: %s", uid, exc)
        yield {
            "step": "error",
            "error_type": "general",
            "message": "ACRCloud credentials verification failed. Please check your ACR Host, Access Key, and Secret Key in the Setup Guide."
        }

    except OpenRouterLimitExceeded:
        logger.warning("OpenRouter limit exceeded for user %s", uid)
        yield {"step": "error", "error_type": "openrouter_limit_exceeded"}

    except Exception as exc:
        logger.exception("Pipeline error for user %s: %s", uid, exc)
        err_msg = str(exc)
        if "401" in err_msg or "unauthorized" in err_msg.lower() or "invalid api key" in err_msg.lower():
            msg = "OpenRouter authentication failed. Please verify your OpenRouter API key in the Setup Guide."
        elif "authentication" in err_msg.lower() or "credentials" in err_msg.lower():
            msg = "Authentication failed. Please check your API keys."
        else:
            msg = f"Something went wrong on the server: {err_msg}"
        yield {
            "step": "error",
            "error_type": "general",
            "message": msg,
        }

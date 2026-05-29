"""
pipeline.py
AudioWave backend — 4-step audio processing pipeline (Route A / Hybrid client-side).
No longer imports librosa or scipy. Bypasses feature extraction using client analysis JSON.
Splits audio using FFmpeg stream copy and names songs in parallel via ACRCloud.
"""

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
import re
import subprocess
import time
from typing import AsyncGenerator

import requests
from openai import OpenAI

logger = logging.getLogger(__name__)

# -- Custom Exceptions --
class ACRLimitExceeded(Exception):
    pass

class ACRInvalidCredentials(Exception):
    pass

class OpenRouterLimitExceeded(Exception):
    pass

# -- Constants --
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_MODEL = "deepseek/deepseek-v4-flash"
AVG_SONG_MIN = 4.5
MIN_SONG_SEC = 180
MAX_SONG_SEC = 390
ACR_CLIP_SECONDS = 12
ACR_SKIP_OFFSETS = [5, 20, 40, 60]

def _snap_to_valley(cut_time: float, valleys: list, window: float = 5.0) -> float:
    """Snap a cut time to the nearest silence valley from the client analysis."""
    best_time = cut_time
    min_dist = window
    for v in valleys:
        v_time = float(v.get("time_sec", 0))
        dist = abs(v_time - cut_time)
        if dist < min_dist:
            min_dist = dist
            best_time = v_time
    return best_time

# STEP 2 — LLM Prompt Building & API Call (Adapted to use client analysis JSON)
def _fmt_sec(s: int) -> str:
    s = max(0, int(s))
    return f"{s // 60}:{s % 60:02d}"

def _build_llm_prompt(analysis: dict) -> tuple[str, str]:
    meta = analysis["metadata"]
    valleys = analysis["energy_valleys"]
    candidates = analysis["strong_candidates"]
    peaks = analysis.get("top_novelty_peaks", [])
    per_second = analysis["per_second"]
    target = meta["target_songs"]
    duration = meta["duration_sec"]

    # Valley table
    valley_lines = []
    for v in sorted(valleys, key=lambda x: x.get("depth_db", 0)):
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
    strong = sorted(candidates, key=lambda x: x.get("depth_db", 0))[:15]
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
    try:
        return json.loads(raw)
    except Exception:
        pass
    clean = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`").strip()
    try:
        return json.loads(clean)
    except Exception:
        pass
    match = re.search(r"\{[\s\S]*\}", clean)
    if match:
        try:
            return json.loads(match.group())
        except Exception:
            pass
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
    cuts = sorted(set(int(c) for c in cuts))
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
                    t = int(v.get("time_sec", 0))
                    if seg_s + min_sec < t < seg_e - min_sec:
                        v_depth = float(v.get("depth_db", 0))
                        if v_depth < best_depth:
                            best_depth = v_depth
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

# STEP 3 — Split Audio via FFmpeg (0 RAM, instant stream copy)
def _split_audio_ffmpeg(
    audio_path: str, cuts: list[int], valleys: list, duration: float, output_dir: str
) -> list[dict]:
    # Snap cuts to valleys
    snapped = [_snap_to_valley(c, valleys) for c in cuts]
    boundaries = [0.0] + sorted(snapped) + [duration]
    os.makedirs(output_dir, exist_ok=True)
    output_files = []

    for i in range(len(boundaries) - 1):
        start = boundaries[i]
        end = boundaries[i + 1]
        seg_dur = end - start
        fname = f"song_{i + 1:02d}.mp3"
        fpath = os.path.join(output_dir, fname)

        # Transcode segment with fast input seeking (ss before i) and high quality MP3 encoding
        cmd_transcode = [
            "ffmpeg", "-y",
            "-ss", f"{start:.3f}",
            "-i", audio_path,
            "-t", f"{seg_dur:.3f}",
            "-c:a", "libmp3lame",
            "-b:a", "192k",
            fpath
        ]
        try:
            logger.info("Running FFmpeg split transcode segment %d: %s", i + 1, " ".join(cmd_transcode))
            subprocess.run(cmd_transcode, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except subprocess.CalledProcessError as exc:
            logger.error("FFmpeg transcode failed for segment %d with code %d", i + 1, exc.returncode)
            raise RuntimeError(f"FFmpeg split failed (exit {exc.returncode})")

        output_files.append({
            "index": i,
            "localPath": fpath,
            "duration": round(seg_dur, 1)
        })

    return output_files

async def step3_split(
    audio_path: str, cuts: list[int], valleys: list, duration: float, work_dir: str
) -> list[dict]:
    output_dir = os.path.join(work_dir, "output_songs")
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _split_audio_ffmpeg, audio_path, cuts, valleys, duration, output_dir
    )

# STEP 4 — ACRCloud Song Naming (Concurrently run using asyncio)
def _extract_clip_bytes_ffmpeg(filepath: str, skip_sec: int, clip_sec: int) -> bytes | None:
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_name = tmp.name

    cmd = [
        "ffmpeg", "-y",
        "-i", filepath,
        "-ss", str(skip_sec),
        "-t", str(clip_sec),
        "-ar", "16000",
        "-ac", "1",
        "-f", "wav",
        tmp_name
    ]
    try:
        res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if res.returncode == 0:
            with open(tmp_name, "rb") as f:
                return f.read()
    except Exception as exc:
        logger.warning("ffmpeg clip extraction failed: %s", exc)
    finally:
        try:
            os.remove(tmp_name)
        except OSError:
            pass
    return None

def _call_acrcloud(
    audio_bytes: bytes, acr_host: str, acr_key: str, acr_secret: str
) -> dict:
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
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", name)
    name = re.sub(r"\s+", "_", name.strip()).strip("._")
    return name[:80] if name else "Unknown"

def get_fpcalc_executable() -> str:
    """Ensure fpcalc is downloaded and return its local absolute path."""
    import platform
    import tarfile
    import zipfile
    import urllib.request
    import shutil
    import tempfile
    
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    is_windows = platform.system() == "Windows"
    ext = ".exe" if is_windows else ""
    local_path = os.path.join(backend_dir, f"fpcalc{ext}")
    
    if os.path.exists(local_path):
        return local_path
        
    logger.info("fpcalc executable not found. Downloading...")
    
    if is_windows:
        url = "https://github.com/acoustid/chromaprint/releases/download/v1.6.0/chromaprint-fpcalc-1.6.0-windows-x86_64.zip"
    else:
        url = "https://github.com/acoustid/chromaprint/releases/download/v1.6.0/chromaprint-fpcalc-1.6.0-linux-x86_64.tar.gz"
        
    with tempfile.TemporaryDirectory() as tmpdir:
        archive_path = os.path.join(tmpdir, "fpcalc_archive")
        try:
            urllib.request.urlretrieve(url, archive_path)
            if is_windows:
                with zipfile.ZipFile(archive_path, "r") as zip_ref:
                    zip_ref.extractall(tmpdir)
            else:
                with tarfile.open(archive_path, "r:gz") as tar_ref:
                    tar_ref.extractall(tmpdir)
                    
            for root, dirs, files in os.walk(tmpdir):
                target_name = f"fpcalc{ext}"
                if target_name in files:
                    src = os.path.join(root, target_name)
                    shutil.copy2(src, local_path)
                    if not is_windows:
                        os.chmod(local_path, 0o755)
                    logger.info("fpcalc successfully downloaded and stored at: %s", local_path)
                    return local_path
        except Exception as exc:
            logger.exception("Failed to download/extract fpcalc")
            system_fpcalc = shutil.which("fpcalc")
            if system_fpcalc:
                return system_fpcalc
            raise RuntimeError("fpcalc fingerprinting binary is missing and download failed.")

def _lookup_acoustid(fpcalc_path: str, filepath: str, acoustid_key: str) -> tuple[str | None, str | None]:
    """Fingerprint a file and query the AcoustID API for recording metadata."""
    cmd = [fpcalc_path, "-json", filepath]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        data = json.loads(res.stdout)
        duration = data.get("duration")
        fingerprint = data.get("fingerprint")
        if not duration or not fingerprint:
            return None, None
    except Exception as exc:
        logger.warning("fpcalc execution failed: %s", exc)
        return None, None

    url = "https://api.acoustid.org/v2/lookup"
    post_data = {
        "client": acoustid_key,
        "meta": "recordings",
        "duration": int(duration),
        "fingerprint": fingerprint
    }
    
    import urllib.request
    import urllib.parse
    req = urllib.request.Request(
        url,
        data=urllib.parse.urlencode(post_data).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            if res_data.get("status") == "error":
                error_info = res_data.get("error", {})
                err_msg = error_info.get("message", "")
                logger.error("AcoustID API error: %s", err_msg)
                if "invalid client" in err_msg.lower() or "unknown client" in err_msg.lower():
                    raise ACRInvalidCredentials("AcoustID Client API Key is invalid.")
                elif "limit" in err_msg.lower() or "exceeded" in err_msg.lower():
                    raise ACRLimitExceeded("AcoustID rate limit exceeded.")
                else:
                    raise RuntimeError(f"AcoustID error: {err_msg}")
            
            if res_data.get("status") == "ok" and res_data.get("results"):
                best_recording = None
                highest_score = 0.0
                for match in res_data["results"]:
                    score = match.get("score", 0.0)
                    recordings = match.get("recordings", [])
                    if score > highest_score and recordings:
                        highest_score = score
                        best_recording = recordings[0]
                if best_recording:
                    title = best_recording.get("title")
                    artists = best_recording.get("artists", [])
                    artist_name = artists[0].get("name", "Unknown") if artists else "Unknown"
                    return title, artist_name
    except (ACRInvalidCredentials, ACRLimitExceeded):
        raise
    except Exception as exc:
        logger.warning("AcoustID API request failed: %s", exc)
    return None, None

async def _recognize_single_song(
    idx: int,
    filepath: str,
    duration_sec: float,
    keys: dict,
    fpcalc_path: str = None,
) -> dict:
    loop = asyncio.get_event_loop()
    display_name = f"Unidentified Song {idx + 1:02d}"
    recognized = False

    if "acoustid_key" in keys and fpcalc_path:
        title, artist = await loop.run_in_executor(
            None, _lookup_acoustid, fpcalc_path, filepath, keys["acoustid_key"]
        )
        if title:
            display_name = _safe_filename(f"{artist} - {title}" if artist else title)
            recognized = True
            logger.info("Recognized via AcoustID: %s — %s", title, artist or "Unknown")
            
    elif "acr_access_key" in keys:
        for skip in ACR_SKIP_OFFSETS:
            if duration_sec < skip + 3:
                continue
            audio_bytes = await loop.run_in_executor(
                None, _extract_clip_bytes_ffmpeg, filepath, skip, ACR_CLIP_SECONDS
            )
            if audio_bytes is None:
                continue

            response = await loop.run_in_executor(
                None, _call_acrcloud, audio_bytes, keys["acr_host"], keys["acr_access_key"], keys["acr_secret_key"]
            )
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

            await asyncio.sleep(0.2)

    return {
        "index": idx,
        "displayName": display_name,
        "duration": duration_sec,
        "recognized": recognized,
        "localPath": filepath,
    }

async def step4_name(
    song_info_list: list[dict],
    keys: dict,
) -> list[dict]:
    """Step 4: Name songs via AcoustID or ACRCloud in parallel."""
    fpcalc_path = None
    if "acoustid_key" in keys:
        try:
            fpcalc_path = get_fpcalc_executable()
        except Exception as exc:
            logger.warning("Failed to obtain fpcalc executable: %s", exc)

    tasks = []
    for info in song_info_list:
        tasks.append(
            _recognize_single_song(
                idx=info["index"],
                filepath=info["localPath"],
                duration_sec=info["duration"],
                keys=keys,
                fpcalc_path=fpcalc_path,
            )
        )
    return await asyncio.gather(*tasks)

# PIPELINE ORCHESTRATOR
async def run_pipeline(
    audio_path: str,
    uid: str,
    openrouter_key: str,
    keys: dict,
    work_dir: str,
    job_id: str = None,
    analysis: dict = None,
) -> AsyncGenerator[dict, None]:
    if job_id is None:
        job_id = f"{uid}_job_{int(time.time())}"

    if analysis is None:
        yield {
            "step": "error",
            "error_type": "general",
            "message": "Missing audio analysis data from client.",
        }
        return

    try:
        # ── Step 1: Analyze (Bypassed since client did it) ──
        yield {"step": "analyzing", "message": "Analyzing your audio file..."}
        # Yield a tiny sleep to simulate phase change
        await asyncio.sleep(0.5)

        # ── Step 2: LLM ──
        think_start = time.time()
        yield {"step": "thinking", "elapsed": 0}

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
        valleys = analysis.get("energy_valleys", [])
        duration = float(analysis["metadata"]["duration_sec"])
        song_files = await step3_split(audio_path, cuts, valleys, duration, work_dir)
        logger.info("Step 3 complete: %d files created", len(song_files))

        # ── Step 4: Name ──
        yield {"step": "naming", "message": "Naming your songs..."}
        named_files = await step4_name(song_files, keys)
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

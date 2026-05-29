import os
import requests
import tempfile
import subprocess
import json

API_TOKEN = "test"
FILEPATH = r"C:\Users\kathir\Desktop\tharun important files\song_splitter\sample song\song3.mp3"
OFFSETS = [10, 30, 60, 90, 120]

def _extract_clip_bytes_ffmpeg(filepath: str, skip_sec: int, clip_sec: int) -> bytes | None:
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
        print(f"ffmpeg clip extraction failed at {skip_sec}s: {exc}")
    finally:
        try:
            os.remove(tmp_name)
        except OSError:
            pass
    return None

def lookup_audd(audio_bytes):
    url = "https://api.audd.io/"
    data = {"api_token": API_TOKEN}
    files = {"file": ("clip.wav", audio_bytes, "audio/wav")}
    try:
        resp = requests.post(url, data=data, files=files, timeout=20)
        return resp.json()
    except Exception as exc:
        print(f"AudD API request failed: {exc}")
    return None

def main():
    if not os.path.exists(FILEPATH):
        print(f"File not found: {FILEPATH}")
        return
        
    for offset in OFFSETS:
        print(f"Testing offset {offset}s...")
        audio_bytes = _extract_clip_bytes_ffmpeg(FILEPATH, offset, 12)
        if not audio_bytes:
            print("Failed to extract clip.")
            continue
        res = lookup_audd(audio_bytes)
        print("Response:", json.dumps(res, indent=2))
        if res and res.get("status") == "success" and res.get("result"):
            print(f"MATCH FOUND AT {offset}s: {res['result'].get('title')} by {res['result'].get('artist')}")
            break
        print("-" * 40)

if __name__ == "__main__":
    main()

import os
import sys
import json
import subprocess
import tempfile
import requests

# AudD test token
API_TOKEN = "521efa9ebac910b5851dc96a520904cd"
SAMPLE_DIR = r"C:\Users\kathir\Desktop\tharun important files\song_splitter\sample song"

def _extract_clip_bytes_ffmpeg(filepath: str, skip_sec: int, clip_sec: int) -> bytes | None:
    """Extract a small clip from the audio file using FFmpeg."""
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
        print(f"ffmpeg clip extraction failed for {os.path.basename(filepath)}: {exc}")
    finally:
        try:
            os.remove(tmp_name)
        except OSError:
            pass
    return None

def lookup_audd(audio_bytes):
    """Query AudD API with raw audio bytes."""
    url = "https://api.audd.io/"
    data = {
        "api_token": API_TOKEN
    }
    files = {
        "file": ("clip.wav", audio_bytes, "audio/wav")
    }
    
    try:
        resp = requests.post(url, data=data, files=files, timeout=20)
        return resp.json()
    except Exception as exc:
        print(f"AudD API request failed: {exc}")
    return None

def process_sample_files():
    print(f"Scanning directory: {SAMPLE_DIR}")
    if not os.path.exists(SAMPLE_DIR):
        print(f"Error: Directory does not exist: {SAMPLE_DIR}")
        return
        
    # List files to process
    files = [f for f in os.listdir(SAMPLE_DIR) if f.lower().endswith(".mp3")]
    if not files:
        print("No MP3 files found in the directory.")
        return
        
    print(f"Found {len(files)} MP3 files. Commencing AudD lookup...\n")
    
    for filename in files:
        file_path = os.path.join(SAMPLE_DIR, filename)
        print(f"Processing: {filename}")
        
        # Extract 12 seconds starting at 30 seconds offset
        audio_bytes = _extract_clip_bytes_ffmpeg(file_path, 30, 12)
        if not audio_bytes:
            print(f"Skipping {filename} due to clip extraction failure.\n")
            continue
            
        print(" -> Clip extracted. Querying AudD API...")
        result = lookup_audd(audio_bytes)
        
        if not result:
            print(" -> API query failed.\n")
            continue
            
        if result.get("status") == "success" and result.get("result"):
            match = result["result"]
            title = match.get("title")
            artist = match.get("artist")
            album = match.get("album", "N/A")
            print(f" -> MATCH FOUND! '{title}' by {artist} (Album: {album})")
            
            # Format and sanitize new filename
            import re
            def sanitize_filename(name):
                return re.sub(r'[<>:"/\\|?*]', "", name).strip()
            
            new_name_base = sanitize_filename(f"{artist} - {title}")
            new_filename = f"{new_name_base}.mp3"
            new_file_path = os.path.join(SAMPLE_DIR, new_filename)
            
            try:
                os.rename(file_path, new_file_path)
                print(f" -> Successfully renamed to: {new_filename}\n")
            except Exception as rename_exc:
                print(f" -> Rename failed: {rename_exc}\n")
        else:
            print(f" -> No match or error returned from AudD.")
            print(f"    Response: {json.dumps(result, indent=2)}\n")

if __name__ == "__main__":
    process_sample_files()

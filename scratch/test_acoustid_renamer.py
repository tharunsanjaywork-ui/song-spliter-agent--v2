import os
import sys
import json
import subprocess
import urllib.request
import zipfile
import tempfile
import shutil

# AcoustID configuration provided by the user
CLIENT_API_KEY = "FNXfrDqZeY"
SAMPLE_DIR = r"C:\Users\kathir\Desktop\tharun important files\song_splitter\sample song"
FPCALC_ZIP_URL = "https://github.com/acoustid/chromaprint/releases/download/v1.5.1/chromaprint-fpcalc-1.5.1-windows-x86_64.zip"

def get_fpcalc_path():
    """Ensure fpcalc.exe is available locally, downloading it if necessary."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    local_fpcalc = os.path.join(script_dir, "fpcalc.exe")
    
    if os.path.exists(local_fpcalc):
        return local_fpcalc
        
    print("fpcalc.exe not found locally. Downloading from GitHub...")
    with tempfile.TemporaryDirectory() as tmpdir:
        zip_path = os.path.join(tmpdir, "fpcalc.zip")
        try:
            urllib.request.urlretrieve(FPCALC_ZIP_URL, zip_path)
            print("Download complete. Extracting zip archive...")
            with zipfile.ZipFile(zip_path, "r") as zip_ref:
                zip_ref.extractall(tmpdir)
                
            # Locate fpcalc.exe inside the extracted folder structure
            for root, dirs, files in os.walk(tmpdir):
                if "fpcalc.exe" in files:
                    src_path = os.path.join(root, "fpcalc.exe")
                    shutil.copy2(src_path, local_fpcalc)
                    print(f"fpcalc.exe successfully saved to: {local_fpcalc}")
                    return local_fpcalc
        except Exception as exc:
            print(f"Error downloading or extracting fpcalc.exe: {exc}")
            # Fallback to checking if fpcalc is already on system path
            if shutil.which("fpcalc"):
                return "fpcalc"
            raise RuntimeError("Could not find or download fpcalc.exe.")

def fingerprint_file(fpcalc_path, file_path):
    """Run fpcalc to get duration and fingerprint for the file."""
    cmd = [fpcalc_path, "-json", file_path]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        data = json.loads(res.stdout)
        return data.get("duration"), data.get("fingerprint")
    except Exception as exc:
        print(f"Error fingerprinting {os.path.basename(file_path)}: {exc}")
        return None, None

def lookup_song(duration, fingerprint):
    """Query the AcoustID web API to find the song information."""
    url = "https://api.acoustid.org/v2/lookup"
    # Use POST to prevent long fingerprint strings from causing URL length issues
    data = {
        "client": CLIENT_API_KEY,
        "meta": "recordings",
        "duration": int(duration),
        "fingerprint": fingerprint
    }
    
    # Send request
    req = urllib.request.Request(
        url,
        data=urllib.parse.urlencode(data).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            if res_data.get("status") == "ok":
                return res_data
    except Exception as exc:
        print(f"AcoustID API request failed: {exc}")
    return None

def sanitize_filename(name):
    """Remove characters that are invalid in Windows filenames."""
    import re
    return re.sub(r'[<>:"/\\|?*]', "", name).strip()

def process_sample_files():
    print(f"Scanning directory: {SAMPLE_DIR}")
    if not os.path.exists(SAMPLE_DIR):
        print(f"Error: Directory does not exist: {SAMPLE_DIR}")
        return
        
    fpcalc_path = get_fpcalc_path()
    
    # List files to process
    files = [f for f in os.listdir(SAMPLE_DIR) if f.lower().endswith(".mp3")]
    if not files:
        print("No MP3 files found in the directory.")
        return
        
    print(f"Found {len(files)} MP3 files. Commencing identification...\n")
    
    for filename in files:
        file_path = os.path.join(SAMPLE_DIR, filename)
        print(f"Processing: {filename}")
        
        duration, fingerprint = fingerprint_file(fpcalc_path, file_path)
        if not duration or not fingerprint:
            print(f"Skipping {filename} due to fingerprinting failure.\n")
            continue
            
        print(f" -> Fingerprint computed (duration: {duration:.1f}s). Looking up AcoustID API...")
        result = lookup_song(duration, fingerprint)
        
        if not result or not result.get("results"):
            print(" -> No matches found in AcoustID database.\n")
            continue
            
        # Parse matches
        best_match = None
        highest_score = 0.0
        for match in result["results"]:
            score = match.get("score", 0.0)
            recordings = match.get("recordings", [])
            if score > highest_score and recordings:
                highest_score = score
                best_match = recordings[0]
                
        if best_match:
            title = best_match.get("title")
            artists = best_match.get("artists", [])
            artist_name = artists[0].get("name", "Unknown Artist") if artists else "Unknown Artist"
            
            print(f" -> MATCH FOUND! '{title}' by {artist_name} (Confidence Score: {highest_score*100:.1f}%)")
            
            # Format new filename: Artist - Title.mp3
            new_name_base = sanitize_filename(f"{artist_name} - {title}")
            new_filename = f"{new_name_base}.mp3"
            new_file_path = os.path.join(SAMPLE_DIR, new_filename)
            
            # Perform renaming
            try:
                os.rename(file_path, new_file_path)
                print(f" -> Successfully renamed to: {new_filename}\n")
            except Exception as rename_exc:
                print(f" -> Rename failed: {rename_exc}\n")
        else:
            print(" -> No matches found with metadata.")
            print(f"    Raw AcoustID response: {json.dumps(result, indent=2)}\n")

if __name__ == "__main__":
    process_sample_files()

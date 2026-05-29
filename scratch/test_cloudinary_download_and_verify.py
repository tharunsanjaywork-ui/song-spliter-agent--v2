import urllib.request
import os
import hashlib
import subprocess
import json

CLOUDINARY_URL = "https://res.cloudinary.com/dmi2mjb0c/video/upload/v1780070997/audiowave_test/test_song_no_ext.mp3"
DOWNLOADED_FILE = r"C:\Users\kathir\Desktop\tharun important files\song_splitter\scratch\downloaded_test.mp3"
LOCAL_SOURCE_FILE = r"C:\Users\kathir\Desktop\tharun important files\song_splitter\sample song\song3.mp3"

if os.path.exists(DOWNLOADED_FILE):
    os.remove(DOWNLOADED_FILE)

def get_md5(filepath):
    hasher = hashlib.md5()
    with open(filepath, 'rb') as f:
        buf = f.read()
        hasher.update(buf)
    return hasher.hexdigest(), len(buf)

def analyze_file(filepath):
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format", "-show_streams",
        filepath
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        data = json.loads(res.stdout)
        duration = data.get("format", {}).get("duration")
        format_name = data.get("format", {}).get("format_name")
        return f"Format: {format_name}, Duration: {duration}s, Status: OK"
    except Exception as e:
        return f"Error: {res.stderr or str(e)}"

def main():
    print(f"Downloading file from: {CLOUDINARY_URL}")
    try:
        urllib.request.urlretrieve(CLOUDINARY_URL, DOWNLOADED_FILE)
        print("Download successful!")
    except Exception as e:
        print("Download failed:", e)
        return
        
    local_md5, local_size = get_md5(LOCAL_SOURCE_FILE)
    down_md5, down_size = get_md5(DOWNLOADED_FILE)
    
    print("\nFile Statistics Comparison:")
    print(f"Local Source File: Size={local_size} bytes, MD5={local_md5}")
    print(f"Downloaded File  : Size={down_size} bytes, MD5={down_md5}")
    
    print("\nAnalyzing Local File via ffprobe:")
    print(analyze_file(LOCAL_SOURCE_FILE))
    
    print("\nAnalyzing Downloaded File via ffprobe:")
    print(analyze_file(DOWNLOADED_FILE))

if __name__ == "__main__":
    main()

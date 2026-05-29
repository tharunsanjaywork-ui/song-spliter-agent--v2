import subprocess
import os
import json

INPUT_FILE = r"C:\Users\kathir\Desktop\tharun important files\song_splitter\sample song\song3.mp3"
OUTPUT_DIR = r"C:\Users\kathir\Desktop\tharun important files\song_splitter\scratch\split_test"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 3 variants
# 1. Current copy (seek after input)
# 2. Fast-seek copy (seek before input)
# 3. Transcode (seek before input, re-encode to 192k mp3)

variants = {
    "current_copy": [
        "ffmpeg", "-y",
        "-i", INPUT_FILE,
        "-ss", "30.000",
        "-t", "10.000",
        "-c", "copy",
        os.path.join(OUTPUT_DIR, "current_copy.mp3")
    ],
    "fast_seek_copy": [
        "ffmpeg", "-y",
        "-ss", "30.000",
        "-i", INPUT_FILE,
        "-t", "10.000",
        "-c", "copy",
        os.path.join(OUTPUT_DIR, "fast_seek_copy.mp3")
    ],
    "transcode": [
        "ffmpeg", "-y",
        "-ss", "30.000",
        "-i", INPUT_FILE,
        "-t", "10.000",
        "-b:a", "192k",
        os.path.join(OUTPUT_DIR, "transcode.mp3")
    ]
}

def analyze_file(filepath):
    # Run ffprobe to get duration and check format errors
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
        size = data.get("format", {}).get("size")
        return f"Duration: {duration}s, Size: {size} bytes, Status: OK"
    except Exception as e:
        return f"Error parsing: {res.stderr or str(e)}"

def main():
    if not os.path.exists(INPUT_FILE):
        print(f"Input file not found: {INPUT_FILE}")
        return
        
    for name, cmd in variants.items():
        out_file = cmd[-1]
        print(f"Running variant: {name}")
        print("Command:", " ".join(cmd))
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if res.returncode == 0:
            info = analyze_file(out_file)
            print(f"Result -> {info}\n")
        else:
            print(f"Failed with code {res.returncode}. Error: {res.stderr.decode()}\n")

if __name__ == "__main__":
    main()

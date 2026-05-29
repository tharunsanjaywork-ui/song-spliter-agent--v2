import subprocess
import os
import json
import time

INPUT_FILE = r"C:\Users\kathir\Desktop\tharun important files\song_splitter\sample song\song3.mp3"
OUTPUT_DIR = r"C:\Users\kathir\Desktop\tharun important files\song_splitter\scratch\split_pipeline_test"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Simulating cuts at 60s, 150s, 240s
cuts = [60, 150, 240]
valleys = []  # Empty, so no snapping happens
duration = 335.4

def _snap_to_valley(cut_time, valleys, window=5.0):
    return cut_time

def test_split():
    snapped = [_snap_to_valley(c, valleys) for c in cuts]
    boundaries = [0.0] + sorted(snapped) + [duration]
    
    print(f"Boundaries: {boundaries}")
    start_time = time.time()
    
    for i in range(len(boundaries) - 1):
        start = boundaries[i]
        end = boundaries[i + 1]
        seg_dur = end - start
        fname = f"song_{i + 1:02d}.mp3"
        fpath = os.path.join(OUTPUT_DIR, fname)
        
        cmd = [
            "ffmpeg", "-y",
            "-ss", f"{start:.3f}",
            "-i", INPUT_FILE,
            "-t", f"{seg_dur:.3f}",
            "-c:a", "libmp3lame",
            "-b:a", "192k",
            fpath
        ]
        
        print(f"Splitting segment {i+1} ({start}s -> {end}s, dur: {seg_dur:.1f}s)...")
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if res.returncode != 0:
            print(f"Failed to split segment {i+1}")
            return
            
    end_time = time.time()
    print(f"\nAll segments split successfully in {end_time - start_time:.2f} seconds!\n")
    
    # Analyze the files
    for i in range(len(boundaries) - 1):
        fname = f"song_{i + 1:02d}.mp3"
        fpath = os.path.join(OUTPUT_DIR, fname)
        
        probe_cmd = [
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            fpath
        ]
        probe_res = subprocess.run(probe_cmd, stdout=subprocess.PIPE, text=True)
        data = json.loads(probe_res.stdout)
        file_dur = data.get("format", {}).get("duration")
        file_size = data.get("format", {}).get("size")
        print(f"{fname} -> Duration: {file_dur}s, Size: {file_size} bytes")

if __name__ == "__main__":
    test_split()

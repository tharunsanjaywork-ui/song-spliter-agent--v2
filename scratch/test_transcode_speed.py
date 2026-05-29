import time
import subprocess
import os

INPUT_FILE = r"C:\Users\kathir\Desktop\tharun important files\song_splitter\sample song\song3.mp3"
OUTPUT_FILE = r"C:\Users\kathir\Desktop\tharun important files\song_splitter\scratch\transcode_test.mp3"

if os.path.exists(OUTPUT_FILE):
    os.remove(OUTPUT_FILE)

cmd = [
    "ffmpeg", "-y",
    "-ss", "0.000",
    "-i", INPUT_FILE,
    "-t", "335.400",  # Full duration of song3
    "-c:a", "libmp3lame",
    "-b:a", "192k",
    OUTPUT_FILE
]

print("Running transcode command...")
start_time = time.time()
res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
end_time = time.time()

if res.returncode == 0:
    print(f"Success! Time taken: {end_time - start_time:.2f} seconds")
    print(f"Output file size: {os.path.getsize(OUTPUT_FILE)} bytes")
else:
    print(f"Failed with code {res.returncode}")
    print("Error output:", res.stderr.decode()[:500])

import subprocess

# Let's run a simple ffmpeg command to see if it works and print version/error
cmd = ["ffmpeg", "-version"]
try:
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    print("FFmpeg version command status:", res.returncode)
    print("FFmpeg stdout (first 2 lines):")
    print("\n".join(res.stdout.split("\n")[:2]))
except Exception as e:
    print("Error running ffmpeg -version:", e)

# Test a dummy copy operation if we can find any file, or just print typical reasons
# Let's also check if we can run a cut with an empty or small file
print("\nTesting ffmpeg cut syntax on a non-existent file to see the stderr structure:")
cmd_cut = ["ffmpeg", "-y", "-ss", "0.000", "-i", "nonexistent.mp3", "-t", "10.0", "-c", "copy", "out.mp3"]
res_cut = subprocess.run(cmd_cut, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
print("Return code:", res_cut.returncode)
print("Stderr output:")
print(res_cut.stderr)

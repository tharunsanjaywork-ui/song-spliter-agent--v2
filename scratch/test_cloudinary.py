import os
import sys
import requests
import dotenv
import cloudinary
import cloudinary.uploader
import subprocess

# Load environment variables
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
dotenv.load_dotenv(os.path.join(backend_dir, ".env"))

# Configure Cloudinary
cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
    api_key=os.environ.get("CLOUDINARY_API_KEY"),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
)

sample_song_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "sample song", "song1.mp3"))
print(f"Sample song path: {sample_song_path}")
print(f"File exists: {os.path.exists(sample_song_path)}")

# Let's perform a test upload without extension in public_id
public_id_no_ext = "test_upload_no_ext"
print("\n--- Uploading without extension in public_id ---")
try:
    result_no_ext = cloudinary.uploader.upload(
        sample_song_path,
        resource_type="video",
        public_id=public_id_no_ext,
        overwrite=True,
    )
    url_no_ext = result_no_ext.get("secure_url", "")
    print(f"Result URL: {url_no_ext}")
    print(f"Result details: {result_no_ext}")
except Exception as e:
    print(f"Upload failed: {e}")
    sys.exit(1)

# Let's perform a test upload with extension in public_id
public_id_with_ext = "test_upload_with_ext.mp3"
print("\n--- Uploading with extension in public_id ---")
try:
    result_with_ext = cloudinary.uploader.upload(
        sample_song_path,
        resource_type="video",
        public_id=public_id_with_ext,
        overwrite=True,
    )
    url_with_ext = result_with_ext.get("secure_url", "")
    print(f"Result URL: {url_with_ext}")
    print(f"Result details: {result_with_ext}")
except Exception as e:
    print(f"Upload failed: {e}")
    sys.exit(1)

# Now, let's download both URLs and check their content
print("\n--- Downloading and inspecting URLs ---")
for label, url in [("No Ext", url_no_ext), ("With Ext", url_with_ext)]:
    print(f"\nFetching {label}: {url}")
    resp = requests.get(url, stream=True)
    print(f"Status Code: {resp.status_code}")
    print(f"Content-Type: {resp.headers.get('Content-Type')}")
    print(f"Content-Length: {resp.headers.get('Content-Length')}")
    
    # Save the first 100 bytes or print them
    content = resp.raw.read(100)
    print(f"First 100 bytes (hex): {content.hex()}")
    print(f"First 100 bytes (text): {content[:100]}")
    
    # Save file to test playability
    out_file = f"downloaded_{label.lower().replace(' ', '_')}.mp3"
    with open(out_file, "wb") as f:
        f.write(content)
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)
    print(f"Saved to {out_file}")
    
    # Check with ffprobe
    print(f"Running ffprobe on {out_file}:")
    cmd = ["ffprobe", "-v", "error", "-show_format", "-show_streams", out_file]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode == 0:
        print("ffprobe check: SUCCESS")
        print(res.stdout[:200])
    else:
        print("ffprobe check: FAILED")
        print(res.stderr)

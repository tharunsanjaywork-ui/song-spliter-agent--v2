import os
import sys
import asyncio
import dotenv
import json
import requests
import subprocess

# Force UTF-8 stdout
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

# Load env
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
dotenv.load_dotenv(os.path.join(backend_dir, ".env"))

sys.path.append(backend_dir)
from firebase_init import get_active_db
from crypto import decrypt
from pipeline import run_pipeline
from main import upload_to_cloudinary_async

# User ID to fetch keys for (from a recent job in database)
USER_ID = "yL2HovfxS3eXcvwdDPuv28Ipnor1"

def get_user_keys(uid: str) -> dict:
    db = get_active_db()
    user_doc = db.collection("users").document(uid).get()
    if not user_doc.exists:
        raise RuntimeError(f"User {uid} not found in Firestore.")
    
    data = user_doc.to_dict()
    keys = {
        "openrouter_key": decrypt(data["openrouterKeyEncrypted"]),
    }
    if "acoustidKeyEncrypted" in data:
        keys["acoustid_key"] = decrypt(data["acoustidKeyEncrypted"])
    if "acrAccessKeyEncrypted" in data:
        keys["acr_host"] = decrypt(data["acrHostEncrypted"])
        keys["acr_access_key"] = decrypt(data["acrAccessKeyEncrypted"])
        keys["acr_secret_key"] = decrypt(data["acrSecretKeyEncrypted"])
    return keys

def generate_mock_analysis(duration_sec=265.0) -> dict:
    # We want a cut at 130.0 seconds
    valleys = [
        {
            "time_sec": 130.0,
            "time_min": "2:10",
            "depth_db": -48.5,
            "duration_s": 1.5,
            "recovers": True,
            "fade_before": False,
            "is_candidate": True
        }
    ]
    
    strong_candidates = [valleys[0]]
    
    peaks = [
        {
            "s": 130.0,
            "t": "2:10",
            "novelty": 0.85
        }
    ]
    
    per_second = []
    for s in range(int(duration_sec) + 1):
        # Default energy is -15dB, novelty is 0.05
        energy = -15.0
        nov = 0.05
        mc = 5.0
        kc = 0.2
        
        # Near 130s, drop energy and spike novelty/timbre/key
        if 128 <= s <= 131:
            energy = -45.0
            nov = 0.1
        elif s == 132:
            energy = -20.0
            nov = 0.85
            mc = 45.0
            kc = 2.5
            
        per_second.append({
            "s": s,
            "t": f"{s // 60}:{s % 60:02d}",
            "energy_db": energy,
            "novelty_smooth": nov,
            "mfcc_change": mc,
            "chroma_change": kc
        })
        
    return {
        "metadata": {
            "duration_sec": duration_sec,
            "duration_fmt": "4:25",
            "target_songs": 2,
            "min_song_sec": 45  # Shorten min song sec to make our mock cut valid
        },
        "energy_valleys": valleys,
        "strong_candidates": strong_candidates,
        "top_novelty_peaks": peaks,
        "per_second": per_second
    }

async def run_e2e_test():
    # 1. Fetch user keys
    print("Fetching and decrypting user keys...")
    try:
        user_keys = get_user_keys(USER_ID)
        print("User keys successfully loaded.")
    except Exception as e:
        print(f"Failed to load keys: {e}")
        return
    
    # 2. Prepare sample audio and temp directory
    sample_song = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "sample song", "song1.mp3"))
    if not os.path.exists(sample_song):
        print(f"Error: Sample song not found at {sample_song}")
        return
        
    import tempfile
    import shutil
    work_dir = tempfile.mkdtemp(prefix="audiowave_e2e_test_")
    print(f"Created temporary working directory: {work_dir}")
    
    # Copy sample song to work dir as input
    test_input = os.path.join(work_dir, "input.mp3")
    shutil.copy(sample_song, test_input)
    
    # 3. Generate mock analysis
    analysis_data = generate_mock_analysis()
    
    print("\n--- Running pipeline.run_pipeline ---")
    job_id = f"e2e_test_job_{int(asyncio.get_event_loop().time())}"
    pipeline_files = []
    
    try:
        async for event in run_pipeline(
            audio_path=test_input,
            uid=USER_ID,
            openrouter_key=user_keys["openrouter_key"],
            keys=user_keys,
            work_dir=work_dir,
            job_id=job_id,
            analysis=analysis_data
        ):
            step = event.get("step")
            print(f"Pipeline Yielded Step: {step}")
            if step == "complete":
                pipeline_files = event.get("files", [])
                print(f"Pipeline completed. Generated {len(pipeline_files)} song files.")
            elif step == "error":
                print(f"Pipeline Error: {event}")
                return
    except Exception as e:
        import traceback
        print("Pipeline execution failed with exception:")
        traceback.print_exc()
        return
        
    if not pipeline_files:
        print("Error: No files generated by pipeline.")
        return
        
    print("\n--- Uploading generated files to Cloudinary ---")
    uploaded_files = []
    try:
        uploaded_files = await upload_to_cloudinary_async(
            pipeline_files, USER_ID, job_id
        )
        print("Batch upload to Cloudinary completed.")
    except Exception as e:
        import traceback
        print("Upload to Cloudinary failed:")
        traceback.print_exc()
        return
        
    print("\n--- Verifying uploaded files ---")
    for idx, f in enumerate(uploaded_files):
        print(f"\nChecking File {idx + 1}:")
        print(f"  Display Name: {f.get('displayName')}")
        print(f"  Cloudinary URL: {f.get('cloudinaryUrl')}")
        print(f"  Cloudinary Public ID: {f.get('cloudinaryPublicId')}")
        print(f"  Duration: {f.get('duration')}")
        
        url = f.get('cloudinaryUrl')
        if not url:
            print("  FAIL: Cloudinary URL is empty/None!")
            continue
            
        # Download and verify with ffprobe
        print(f"  Downloading URL to verify playback...")
        resp = requests.get(url, timeout=15)
        if resp.status_code != 200:
            print(f"  FAIL: Failed to fetch URL (Status {resp.status_code})")
            continue
            
        verify_path = os.path.join(work_dir, f"verify_{idx}.mp3")
        with open(verify_path, "wb") as vf:
            vf.write(resp.content)
            
        print(f"  Saved file size: {os.path.getsize(verify_path)} bytes")
        
        # Run ffprobe
        cmd = ["ffprobe", "-v", "error", "-show_format", "-show_streams", verify_path]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode == 0:
            print("  SUCCESS: File is a fully valid playable MP3!")
            print("  Stream Info:")
            for line in res.stdout.splitlines():
                if "codec_name" in line or "duration=" in line or "bit_rate=" in line:
                    print(f"    {line}")
        else:
            print(f"  FAIL: ffprobe check failed: {res.stderr}")
            
    # Clean up
    print(f"\nCleaning up temp directory: {work_dir}")
    shutil.rmtree(work_dir)
    print("Cleanup completed. Test finished.")

if __name__ == "__main__":
    asyncio.run(run_e2e_test())

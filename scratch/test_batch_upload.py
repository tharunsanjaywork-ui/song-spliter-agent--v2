import os
import sys
import asyncio
import dotenv
import json

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
from main import upload_to_cloudinary_async

async def main():
    # Make a dummy file to upload
    dummy_path = os.path.abspath("dummy_song.mp3")
    with open(dummy_path, "wb") as f:
        f.write(b"ID3dummydata" * 100)
    
    file_results = [
        {
            "index": 0,
            "localPath": dummy_path,
            "duration": 120.0,
            "recognized": False,
            "displayName": "Test_Batch_Song_1"
        }
    ]
    
    print("Running upload_to_cloudinary_async...")
    try:
        uploaded = await upload_to_cloudinary_async(file_results, "test_user_uid", "test_job_id")
        print("Upload completed successfully!")
        print(json.dumps(uploaded, indent=2))
    except Exception as e:
        import traceback
        print("Upload failed with exception:")
        traceback.print_exc()
        
    # Clean up dummy file
    if os.path.exists(dummy_path):
        os.remove(dummy_path)

if __name__ == "__main__":
    asyncio.run(main())

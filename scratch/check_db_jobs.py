import os
import sys
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

# Import firebase helper
try:
    sys.path.append(backend_dir)
    from firebase_init import get_active_db
except Exception as e:
    print(f"Failed to import firebase_init: {e}")
    sys.exit(1)

try:
    db = get_active_db()
    # Query recent completed or failed jobs
    jobs_ref = db.collection("jobs").order_by("createdAt", direction="DESCENDING").limit(5)
    jobs = jobs_ref.get()
    
    print(f"Found {len(jobs)} recent jobs:")
    for job in jobs:
        jdata = job.to_dict()
        print(f"\nJob ID: {jdata.get('jobId')}")
        print(f"Status: {jdata.get('status')}")
        print(f"UID: {jdata.get('uid')}")
        print(f"Original File Name: {jdata.get('originalFileName')}")
        print(f"File Count: {jdata.get('fileCount')}")
        files = jdata.get("files", [])
        print(f"Number of files in list: {len(files)}")
        for idx, f in enumerate(files):
            print(f"  File {idx + 1}:")
            print(f"    Display Name: {f.get('displayName')}")
            print(f"    Cloudinary URL: {f.get('cloudinaryUrl')}")
            print(f"    Cloudinary Public ID: {f.get('cloudinaryPublicId')}")
            print(f"    Duration: {f.get('duration')}")
            print(f"    Recognized: {f.get('recognized')}")
            
except Exception as e:
    import traceback
    traceback.print_exc()

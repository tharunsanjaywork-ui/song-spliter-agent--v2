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

sys.path.append(backend_dir)
from firebase_init import get_active_db

db = get_active_db()
job_ref = db.collection("jobs").document("yL2HovfxS3eXcvwdDPuv28Ipnor1_job_1780071327")
job_doc = job_ref.get()
if job_doc.exists:
    print(json.dumps(job_doc.to_dict(), indent=2, default=str))
else:
    print("Job not found")

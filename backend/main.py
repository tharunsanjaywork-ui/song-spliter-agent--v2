"""
main.py
AudioWave FastAPI backend — all API routes.
"""

import asyncio
import json
import logging
import os
import shutil
import tempfile
import time
import uuid

try:
    import magic
except ImportError:
    magic = None

from dotenv import load_dotenv
from fastapi import FastAPI, Depends, Header, HTTPException, UploadFile, File, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field, field_validator
from firebase_admin import firestore
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import cloudinary
import cloudinary.uploader

# Load .env file before anything else so env vars are available
backend_dir = os.path.dirname(os.path.abspath(__file__))
dotenv_path = os.path.join(backend_dir, ".env")
load_dotenv(dotenv_path)


# Safe imports supporting both root-level execution and backend-level execution
try:
    from backend.firebase_init import get_active_db, verify_token, verify_token_full, increment_write_count
    from backend.crypto import encrypt, decrypt
    from backend.pipeline import run_pipeline
except ImportError:
    from firebase_init import get_active_db, verify_token, verify_token_full, increment_write_count
    from crypto import encrypt, decrypt
    from pipeline import run_pipeline

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Rate limiter setup
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="AudioWave Backend", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS setup
origins = []
frontend_url = os.environ.get("FRONTEND_URL", "")
if frontend_url:
    origins.append(frontend_url)

# Add local environments for development
origins.extend([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
])

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Custom Exception Handlers to match Backend Schema specification ---
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    errors = exc.errors()
    error_msg = "Validation failed"
    if errors:
        msg = errors[0]["msg"]
        # Strip out Pydantic's Value error prefix if present
        if msg.startswith("Value error, "):
            error_msg = msg[len("Value error, "):]
        else:
            field_name = errors[0]["loc"][-1]
            error_msg = f"Invalid format for {field_name}: {msg}"
    return JSONResponse(
        status_code=400,
        content={"success": False, "error": error_msg}
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": exc.detail}
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.exception("Unhandled error occurred.")
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": "Something went wrong"}
    )


# --- Dependency Injection for Authentication ---
async def get_current_user(authorization: str = Header(...)) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header format. Must be Bearer <token>")
    token = authorization.split("Bearer ")[1]
    return verify_token_full(token)


async def get_current_uid(user: dict = Depends(get_current_user)) -> str:
    return user.get("uid")


# --- Pydantic Validation Schemas ---
class KeysSaveRequest(BaseModel):
    openrouter_key: str = Field(..., min_length=20)
    acoustid_key: str = Field(..., min_length=10)

    @field_validator("openrouter_key")
    @classmethod
    def validate_openrouter_key(cls, value: str) -> str:
        if not value.startswith("sk-or"):
            raise ValueError("This key doesn't look right. Please copy it again from OpenRouter and try again.")
        return value


class RenameRequest(BaseModel):
    jobId: str = Field(..., min_length=1)
    fileIndex: int = Field(..., ge=0)
    newName: str = Field(..., min_length=1, max_length=100)


def configure_cloudinary(backup: bool = False):
    suffix = "_BACKUP" if backup else ""
    cloudinary.config(
        cloud_name=os.environ.get(f"CLOUDINARY{suffix}_CLOUD_NAME"),
        api_key=os.environ.get(f"CLOUDINARY{suffix}_API_KEY"),
        api_secret=os.environ.get(f"CLOUDINARY{suffix}_API_SECRET"),
    )


_last_cloudinary_check_time = 0.0
_use_backup_cloudinary = False

def get_active_cloudinary():
    global _last_cloudinary_check_time, _use_backup_cloudinary
    current_time = time.time()
    if current_time - _last_cloudinary_check_time < 3600.0:
        configure_cloudinary(backup=_use_backup_cloudinary)
        return

    try:
        db = get_active_db()
        meta = db.collection("_meta").document("quota").get()
        if meta.exists and meta.to_dict().get("useBackupCloudinary", False):
            _use_backup_cloudinary = True
            _last_cloudinary_check_time = current_time
            configure_cloudinary(backup=True)
            return
        usage = cloudinary.api.usage()
        usage_gb = usage.get("storage", {}).get("usage", 0) / (1024**3)
        if usage_gb > 22.5:
            db.collection("_meta").document("quota").set(
                {"useBackupCloudinary": True}, merge=True
            )
            increment_write_count(1)
            _use_backup_cloudinary = True
            _last_cloudinary_check_time = current_time
            configure_cloudinary(backup=True)
            return
    except Exception:
        logger.warning("Cloudinary quota check failed, using primary config.")
    _use_backup_cloudinary = False
    _last_cloudinary_check_time = current_time
    configure_cloudinary(backup=False)


# --- API Routes ---
@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/api/wakeup")
def wakeup():
    """Lightweight endpoint for frontend to wake the Render backend service."""
    return {"success": True}


@app.get("/api/keys/status")
async def get_keys_status(uid: str = Depends(get_current_uid)):
    try:
        db = get_active_db()
        user_ref = db.collection("users").document(uid)
        user_doc = user_ref.get()
        if user_doc.exists:
            setup_complete = user_doc.to_dict().get("setupComplete", False)
            return {"success": True, "data": {"setupComplete": setup_complete}}
        return {"success": True, "data": {"setupComplete": False}}
    except Exception as exc:
        logger.exception("Failed to get key status for user %s", uid)
        return {"success": False, "error": "Failed to check setup status."}


@app.post("/api/keys/save")
async def save_keys(request_data: KeysSaveRequest, user: dict = Depends(get_current_user)):
    uid = user.get("uid")
    email = user.get("email", "")
    display_name = user.get("name", "")

    try:
        db = get_active_db()
        user_ref = db.collection("users").document(uid)
        user_doc = user_ref.get()

        # Check if placeholders are used and retrieve existing keys if so
        existing_keys = {}
        if user_doc.exists and user_doc.to_dict().get("setupComplete", False):
            try:
                existing_keys = get_user_keys(uid)
            except Exception:
                pass

        openrouter_key = request_data.openrouter_key
        if openrouter_key == "sk-or-keep-existing-key-placeholder" and "openrouter_key" in existing_keys:
            openrouter_key = existing_keys["openrouter_key"]

        acoustid_key = request_data.acoustid_key
        if acoustid_key == "keep-existing-acoustid-key-placeholder" and "acoustid_key" in existing_keys:
            acoustid_key = existing_keys["acoustid_key"]

        # Encrypt keys using cryptography.fernet
        encrypted_openrouter = encrypt(openrouter_key)
        encrypted_acoustid = encrypt(acoustid_key)

        if user_doc.exists:
            update_data = {
                "setupComplete": True,
                "openrouterKeyEncrypted": encrypted_openrouter,
                "acoustidKeyEncrypted": encrypted_acoustid,
                "updatedAt": firestore.firestore.SERVER_TIMESTAMP
            }
            if email:
                update_data["email"] = email
            if display_name:
                update_data["displayName"] = display_name
            user_ref.update(update_data)
            increment_write_count(1)
        else:
            set_data = {
                "uid": uid,
                "email": email,
                "displayName": display_name,
                "setupComplete": True,
                "openrouterKeyEncrypted": encrypted_openrouter,
                "acoustidKeyEncrypted": encrypted_acoustid,
                "createdAt": firestore.firestore.SERVER_TIMESTAMP,
                "updatedAt": firestore.firestore.SERVER_TIMESTAMP
            }
            user_ref.set(set_data)
            increment_write_count(1)

        return {"success": True}
    except Exception as exc:
        logger.exception("Failed to save keys for user %s", uid)
        return {"success": False, "error": "Failed to save API keys."}


@app.get("/api/jobs/{job_id}")
async def get_job_endpoint(job_id: str, uid: str = Depends(get_current_uid)):
    try:
        db = get_active_db()
        doc_id = job_id if job_id.startswith(f"{uid}_") else f"{uid}_{job_id}"
        job_ref = db.collection("jobs").document(doc_id)
        job_doc = job_ref.get()
        if not job_doc.exists:
            raise HTTPException(status_code=404, detail="Job not found")
        job_data = job_doc.to_dict()
        if job_data.get("uid") != uid:
            raise HTTPException(status_code=403, detail="Forbidden")


        return {
            "success": True,
            "data": {
                "jobId": job_data.get("jobId"),
                "status": job_data.get("status"),
                "fileCount": job_data.get("fileCount", 0),
                "files": job_data.get("files", []),
                "errorType": job_data.get("errorType"),
                "errorMessage": job_data.get("errorMessage")
            }
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to get job %s for user %s", job_id, uid)
        return {"success": False, "error": "Failed to load job data."}


@app.post("/api/files/rename")
async def rename_file_endpoint(request_data: RenameRequest, uid: str = Depends(get_current_uid)):
    try:
        db = get_active_db()
        job_id = request_data.jobId
        doc_id = job_id if job_id.startswith(f"{uid}_") else f"{uid}_{job_id}"
        job_ref = db.collection("jobs").document(doc_id)
        job_doc = job_ref.get()
        if not job_doc.exists:
            raise HTTPException(status_code=404, detail="Job not found")
        job_data = job_doc.to_dict()
        if job_data.get("uid") != uid:
            raise HTTPException(status_code=403, detail="Forbidden")


        files_list = job_data.get("files", [])
        if request_data.fileIndex < 0 or request_data.fileIndex >= len(files_list):
            raise HTTPException(status_code=400, detail="Invalid file index")

        file_item = files_list[request_data.fileIndex]
        old_public_id = file_item.get("cloudinaryPublicId")

        if old_public_id:
            dir_prefix = "/".join(old_public_id.split("/")[:-1])
            new_public_id = f"{dir_prefix}/{request_data.newName}" if dir_prefix else request_data.newName
        else:
            new_public_id = request_data.newName

        try:
            get_active_cloudinary()
            res = cloudinary.uploader.rename(
                old_public_id,
                new_public_id,
                resource_type="video"
            )
            new_url = res.get("secure_url") or res.get("url")
            if new_url:
                file_item["cloudinaryUrl"] = new_url
                file_item["cloudinaryPublicId"] = new_public_id
        except Exception:
            logger.exception("Cloudinary rename failed, updating Firestore properties only.")
            file_item["cloudinaryPublicId"] = new_public_id
            old_url = file_item.get("cloudinaryUrl", "")
            if old_public_id and old_public_id in old_url:
                file_item["cloudinaryUrl"] = old_url.replace(old_public_id, new_public_id)

        file_item["displayName"] = request_data.newName
        job_ref.update({"files": files_list})
        increment_write_count(1)
        return {"success": True}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to rename file index %d in job %s", request_data.fileIndex, request_data.jobId)
        return {"success": False, "error": "Failed to rename file."}


# ── File Upload Validation ─────────────────────────────────────────────────────

ALLOWED_MIMES = {
    "audio/mpeg", "audio/wav", "audio/ogg", "audio/flac",
    "audio/aac", "audio/mp4", "audio/x-m4a",
}
MAX_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024  # 2GB


async def validate_upload(file: UploadFile) -> bytes:
    """Validate uploaded file MIME type and size. Returns file bytes."""
    content = await file.read()
    file_size = len(content)
    if file_size > MAX_UPLOAD_SIZE:
        raise HTTPException(400, "This file is too large. Maximum size is 2GB.")
    
    file_ext = os.path.splitext(file.filename.lower())[1] if file.filename else ""
    
    try:
        if magic is None:
            raise ImportError("magic module not loaded")
        if not hasattr(magic, "from_buffer"):
            import importlib
            importlib.reload(magic)
        mime = magic.from_buffer(content[:2048], mime=True)
    except Exception as exc:
        logger.warning(f"magic file identification failed: {exc}. Falling back to extension-based mime.")
        ext_to_mime = {
            ".mp3": "audio/mpeg",
            ".wav": "audio/wav",
            ".ogg": "audio/ogg",
            ".flac": "audio/flac",
            ".aac": "audio/aac",
            ".m4a": "audio/x-m4a",
            ".mp4": "video/mp4",
        }
        mime = ext_to_mime.get(file_ext, "application/octet-stream")

    logger.info(f"Uploading file: {file.filename}, Size: {file_size} bytes, Detected MIME: {mime}")
    
    # Standard extensions check
    allowed_exts = {".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a", ".mp4"}
    
    is_allowed_mime = mime in ALLOWED_MIMES
    is_audio_extension = file_ext in allowed_exts
    is_acceptable_fallback = mime == "application/octet-stream" or mime.startswith("audio/") or mime == "video/mp4"
    
    if not (is_allowed_mime or (is_audio_extension and is_acceptable_fallback)):
        raise HTTPException(
            400,
            f"This file type (detected as {mime}) is not supported. Please upload an MP3, WAV, OGG, FLAC, AAC, or M4A file."
        )
    return content



# ── Decrypt user keys from Firestore ───────────────────────────────────────────

def get_user_keys(uid: str) -> dict:
    """Decrypt all 4 user API keys from Firestore. Raises HTTPException on failure."""
    try:
        db = get_active_db()
        user_doc = db.collection("users").document(uid).get()
        if not user_doc.exists:
            raise HTTPException(400, "Setup not complete. Please set up your API keys first.")
        data = user_doc.to_dict()
        if not data.get("setupComplete", False):
            raise HTTPException(400, "Setup not complete. Please set up your API keys first.")

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
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to decrypt keys for user %s", uid)
        raise HTTPException(500, "Failed to load your API keys. Please try again.")


# ── Upload split files to Cloudinary in Parallel ─────────────────────────────

def _upload_single_file(file_info: dict, uid: str, job_id: str) -> dict:
    local_path = file_info.get("localPath", "")
    display_name = file_info.get("displayName", f"song_{file_info['index'] + 1:02d}")
    public_id = f"audiowave/{uid}/{job_id}/{display_name}"
    try:
        result = cloudinary.uploader.upload(
            local_path,
            resource_type="video",
            public_id=public_id,
            overwrite=True,
        )
        return {
            "index": file_info["index"],
            "displayName": display_name,
            "cloudinaryUrl": result.get("secure_url", ""),
            "cloudinaryPublicId": result.get("public_id", public_id),
            "duration": file_info.get("duration", 0),
            "recognized": file_info.get("recognized", False),
        }
    except Exception as exc:
        logger.exception("Cloudinary upload failed for %s", display_name)
        return {
            "index": file_info["index"],
            "displayName": display_name,
            "cloudinaryUrl": "",
            "cloudinaryPublicId": public_id,
            "duration": file_info.get("duration", 0),
            "recognized": file_info.get("recognized", False),
        }

async def upload_to_cloudinary_async(
    file_results: list, uid: str, job_id: str
) -> list:
    """Upload each split song to Cloudinary in parallel."""
    loop = asyncio.get_event_loop()
    get_active_cloudinary()
    tasks = []
    for info in file_results:
        tasks.append(
            loop.run_in_executor(None, _upload_single_file, info, uid, job_id)
        )
    return await asyncio.gather(*tasks)


# ── POST /api/process — Main processing endpoint ──────────────────────────────

@app.post("/api/process")
@limiter.limit("5/15minutes")
async def process_audio(
    request: Request,
    file: UploadFile = File(...),
    analysis: str = Form(...),
    uid: str = Depends(get_current_uid),
):
    """Upload audio file, run the 4-step pipeline, stream SSE progress events."""
    try:
        analysis_json = json.loads(analysis)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid analysis JSON format.")

    # Validate the uploaded file
    content = await validate_upload(file)

    # Decrypt user's API keys from Firestore
    user_keys = get_user_keys(uid)

    # Create a per-job temp directory
    job_uuid = str(uuid.uuid4())[:8]
    work_dir = tempfile.mkdtemp(prefix=f"audiowave_{job_uuid}_")
    audio_path = os.path.join(work_dir, "input.mp3")

    # Write the uploaded file to disk
    with open(audio_path, "wb") as audio_file:
        audio_file.write(content)

    # Create initial job document in Firestore
    job_id = f"{uid}_job_{int(import_time())}"
    try:
        db = get_active_db()
        db.collection("jobs").document(job_id).set({
            "jobId": job_id,
            "uid": uid,
            "status": "processing",
            "originalFileName": file.filename or "unknown.mp3",
            "fileCount": 0,
            "files": [],
            "errorType": None,
            "createdAt": firestore.firestore.SERVER_TIMESTAMP,
            "completedAt": None,
        })
        increment_write_count(1)
    except Exception as exc:
        logger.exception("Failed to create job document")
        # Continue anyway — the pipeline will still work

    async def event_stream():
        try:
            yield f"data: {json.dumps({'step': 'init', 'jobId': job_id})}\n\n"
            final_files = None
            async for event in run_pipeline(
                audio_path=audio_path,
                uid=uid,
                openrouter_key=user_keys["openrouter_key"],
                keys=user_keys,
                work_dir=work_dir,
                job_id=job_id,
                analysis=analysis_json,
            ):
                step = event.get("step", "")

                if step == "complete":
                    # Upload split files to Cloudinary
                    pipeline_files = event.get("files", [])
                    try:
                        uploaded = await upload_to_cloudinary_async(
                            pipeline_files, uid, event.get("jobId", job_id)
                        )
                        final_files = uploaded
                    except Exception as upload_exc:
                        logger.exception("Cloudinary upload batch failed")
                        uploaded = pipeline_files

                    # Update Firestore job to complete
                    actual_job_id = event.get("jobId", job_id)
                    try:
                        db = get_active_db()
                        db.collection("jobs").document(actual_job_id).set({
                            "jobId": actual_job_id,
                            "uid": uid,
                            "status": "complete",
                            "originalFileName": file.filename or "unknown.mp3",
                            "fileCount": len(uploaded),
                            "files": uploaded,
                            "errorType": None,
                            "createdAt": firestore.firestore.SERVER_TIMESTAMP,
                            "completedAt": firestore.firestore.SERVER_TIMESTAMP,
                        }, merge=True)
                        increment_write_count(1)
                    except Exception:
                        logger.exception("Failed to update job to complete")

                    yield f"data: {json.dumps({'step': 'complete', 'jobId': actual_job_id})}\n\n"

                elif step == "error":
                    error_type = event.get("error_type", "general")
                    error_message = event.get("message")
                    try:
                        db = get_active_db()
                        db.collection("jobs").document(job_id).update({
                            "status": "failed",
                            "errorType": error_type,
                            "errorMessage": error_message,
                        })
                        increment_write_count(1)
                    except Exception:
                        logger.exception("Failed to update job to failed")

                    yield f"data: {json.dumps(event)}\n\n"

                else:
                    yield f"data: {json.dumps(event)}\n\n"

        finally:
            # Clean up temp directory
            try:
                if os.path.exists(work_dir):
                    shutil.rmtree(work_dir)
                    logger.info("Cleaned up work dir: %s", work_dir)
            except Exception:
                logger.warning("Failed to clean up work dir: %s", work_dir)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def import_time():
    """Import time module and return current time. Avoids shadowing."""
    import time as _time
    return _time.time()


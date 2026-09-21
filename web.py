"""Minimal Web UI and API server for AI Video Clipper using FastAPI."""
from __future__ import annotations

import os
import uuid
import base64
import json
import time
import threading
import re
from pathlib import Path
from typing import Dict, Any, Optional

from fastapi import FastAPI, BackgroundTasks, HTTPException, Header, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from datetime import datetime, timezone
from sqlalchemy import text, func

from clipper.pipeline import ClipperPipeline
from clipper.cleanup import start_retention_sweeper
from clipper.security import (
    sanitize_and_validate_youtube_url,
    verify_clerk_token,
    sanitize_upload_filename,
    validate_video_magic_bytes,
    validate_upload_size,
)
from clipper.downloader import (
    get_video_metadata_preflight,
    VideoDurationLimitExceeded,
    VideoDownloadError,
    MAX_VIDEO_DURATION_SECONDS,
)
from clipper.queue_manager import JobQueueManager
from clipper.storage import (
    upload_clip_to_storage,
    save_clips_to_db,
    save_job_to_cloud,
    get_user_clips_from_cloud,
    is_supabase_enabled,
    get_storage_provider,
    s3_storage,
    get_supabase_client,
    STORAGE_BUCKET,
)
from clipper.db import (
    init_db,
    get_db_session,
    ProcessingJobModel,
    ClipModel,
    UsageRecord,
    User,
    CreditAccount,
    CreditTransaction,
)
from clipper.credit_service import (
    CreditService,
    InsufficientCreditsError,
)
from clipper.rate_limiter import (
    ai_clipping_limiter,
    transcription_limiter,
    split_limiter,
    estimate_limiter,
)
from clipper.payment_service import (
    PaymentService,
    SubscriptionService,
)
from clipper.stripe_service import StripeBillingService
from clipper.notifier import notify_job_completed, notify_job_failed
from clipper.transcriber import get_transcript, TranscriptionError
from splitter.splitter import (
    probe_video_metadata,
    calculate_split_segments,
    split_video_sequentially,
    VideoSplitError,
)

# Initialize persistence database (PostgreSQL / SQLite fallback)
init_db()

app = FastAPI(title="AI Video Clipper & Video Splitter (Production)")

# Enable CORS for Next.js frontend
allowed_origins_env = os.getenv("ALLOWED_ORIGINS")
cors_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()] if allowed_origins_env else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directories
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
OUTPUT_DIR = BASE_DIR / "output"
TEMP_DIR = BASE_DIR / "temp_downloads"
SPLIT_OUTPUT_DIR = OUTPUT_DIR / "split"
SPLIT_TEMP_DIR = BASE_DIR / "temp_uploads"

STATIC_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)
TEMP_DIR.mkdir(exist_ok=True)
SPLIT_OUTPUT_DIR.mkdir(exist_ok=True)
SPLIT_TEMP_DIR.mkdir(exist_ok=True)

# Mount static files and output directory
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/output", StaticFiles(directory=str(OUTPUT_DIR)), name="output")

# Launch storage retention background cleaner (sweeps 1h source videos & 24h clips immediately & every hour)
start_retention_sweeper(
    output_dirs=[OUTPUT_DIR, SPLIT_OUTPUT_DIR],
    temp_dirs=[TEMP_DIR, SPLIT_TEMP_DIR],
    interval_seconds=3600,
    max_clip_age_seconds=86400,
    max_source_age_seconds=3600
)

# Job Queue & Concurrency Manager (Max 2 concurrent processing jobs)
queue_manager = JobQueueManager(max_concurrent_jobs=2)
jobs: Dict[str, Dict[str, Any]] = queue_manager.jobs

# Crash recovery on server startup & background timeout supervisor
queue_manager.recover_crashed_jobs_on_startup()
queue_manager.start_timeout_supervisor(check_interval_seconds=60, timeout_minutes=15)


class ProcessRequest(BaseModel):
    url: str
    count: int = 10


def init_job_steps() -> Dict[str, Dict[str, Any]]:
    return {
        "video_received": {"label": "Video received & downloading", "status": "pending"},
        "audio_extract": {"label": "Extracting audio stream", "status": "pending"},
        "transcript": {"label": "Generating timestamped transcript", "status": "pending"},
        "ai_moments": {"label": "Finding the best moments with AI", "status": "pending"},
        "context_verify": {"label": "Reviewing candidate clips & context", "status": "pending"},
        "ffmpeg_render": {"label": "Rendering clips with FFmpeg", "status": "pending"},
        "finalizing": {"label": "Finalizing metadata & previews", "status": "pending"},
    }


def run_pipeline_task(job_id: str, url: str, count: int, user_id: str = "guest_user", source_file_path: Optional[str] = None):
    """Background worker for executing clipping pipeline (YouTube or uploaded file)."""
    job = jobs[job_id]

    def status_callback(stage: str, msg: str):
        job["current_message"] = msg
        steps = job["steps"]

        if stage == "video":
            job["stage"] = "video"
            steps["video_received"]["status"] = "processing"
            job["progress_percent"] = 15
        elif stage == "video_done":
            steps["video_received"]["status"] = "completed"
            steps["audio_extract"]["status"] = "completed"
            job["progress_percent"] = 30
        elif stage == "transcript":
            job["stage"] = "transcript"
            steps["transcript"]["status"] = "processing"
            job["progress_percent"] = 45
        elif stage == "transcript_done":
            steps["transcript"]["status"] = "completed"
            steps["ai_moments"]["status"] = "processing"
            job["progress_percent"] = 60
        elif stage == "analysis":
            job["stage"] = "analysis"
            if "Verifying" in msg:
                steps["ai_moments"]["status"] = "completed"
                steps["context_verify"]["status"] = "processing"
                job["progress_percent"] = 75
            elif "Selecting" in msg or "Ranking" in msg:
                steps["context_verify"]["status"] = "processing"
                job["progress_percent"] = 85
            else:
                steps["ai_moments"]["status"] = "processing"
                job["progress_percent"] = 65
        elif stage == "analysis_done":
            steps["context_verify"]["status"] = "completed"
            steps["ffmpeg_render"]["status"] = "processing"
            job["progress_percent"] = 90
        elif stage == "clips":
            job["stage"] = "clips"
            steps["ffmpeg_render"]["status"] = "processing"
            job["progress_percent"] = 94
        elif stage == "clips_done":
            steps["ffmpeg_render"]["status"] = "completed"
            steps["finalizing"]["status"] = "processing"
            job["progress_percent"] = 98

        # Update heartbeat and DB progress
        queue_manager.update_heartbeat(job_id, progress=job.get("progress_percent"), stage=job.get("stage"))

    try:
        pipeline = ClipperPipeline(
            working_dir=TEMP_DIR,
            output_dir=OUTPUT_DIR
        )
        result = pipeline.run(
            youtube_url=url if not source_file_path else None,
            source_video_path=source_file_path,
            target_clip_count=count,
            status_callback=status_callback
        )
        all_clips = result.get("clips", [])

        # 1. Cloud upload to Supabase / S3 if enabled BEFORE marking status as completed
        if is_supabase_enabled():
            for c in all_clips:
                clip_file = OUTPUT_DIR / c.get("file", "")
                if clip_file.exists():
                    try:
                        signed_url = upload_clip_to_storage(
                            file_path=clip_file,
                            user_id=user_id,
                            clip_name=c.get("file", ""),
                            job_id=job_id,
                            cleanup_local=False
                        )
                        if signed_url:
                            c["url"] = signed_url
                            c["signed_url"] = signed_url
                    except Exception as e:
                        print(f"[Supabase Storage] Notice: {e}")

            try:
                save_clips_to_db(user_id, job_id, all_clips, result.get("video"))
            except Exception as e:
                print(f"[Supabase] DB save warning: {e}")

        # 2. Guarantee every clip has a valid playable URL
        for c in all_clips:
            if not c.get("url"):
                c["url"] = f"/output/{c.get('file', '')}"

        # 3. Mark job as completed with fully populated URLs
        job["status"] = "completed"
        job["clips"] = all_clips
        job["video"] = result.get("video", {})
        job["progress_percent"] = 100
        job["current_message"] = f"Successfully generated {len(all_clips)} clips."
        for k in job["steps"]:
            job["steps"][k]["status"] = "completed"

        # 2. Record Job & Usage in Persistence DB
        try:
            db_session = get_db_session()
            try:
                metrics = result.get("metrics", {})
                v_meta = result.get("video", {})
                
                # Save or update ProcessingJobModel
                job_rec = db_session.query(ProcessingJobModel).filter_by(job_id=job_id).first()
                if not job_rec:
                    job_rec = ProcessingJobModel(
                        job_id=job_id,
                        user_id=user_id,
                        job_type="ai_clipper",
                        url=url,
                        status="completed",
                        stage="completed",
                        progress_percent=100,
                        duration_seconds=float(v_meta.get("duration", 0.0)),
                        credits_deducted=float(job.get("credits_deducted", 0.0)),
                        completed_at=datetime.now(timezone.utc)
                    )
                    db_session.add(job_rec)
                else:
                    job_rec.status = "completed"
                    job_rec.stage = "completed"
                    job_rec.progress_percent = 100
                    job_rec.completed_at = datetime.now(timezone.utc)

                # Save UsageRecord
                usage_rec = UsageRecord(
                    user_id=user_id,
                    job_id=job_id,
                    operation="ai_clipper",
                    duration_seconds=float(metrics.get("video_duration", v_meta.get("duration", 0.0))),
                    processing_seconds=float(metrics.get("total_processing_seconds", 0.0)),
                    llm_calls=int(metrics.get("llm_calls", 1)),
                    clip_count=len(result.get("clips", [])),
                    storage_bytes=int(metrics.get("output_size_bytes", 0))
                )
                db_session.add(usage_rec)

                # Save ClipModel records
                for c in result.get("clips", []):
                    clip_rec = ClipModel(
                        job_id=job_id,
                        user_id=user_id,
                        file_name=c.get("file", ""),
                        title=c.get("title", ""),
                        duration=float(c.get("duration", 0.0)),
                        score=float(c.get("score", 8.0)),
                        tags_json=json.dumps(c.get("tags", [])),
                        explanation=c.get("explanation", ""),
                        reason=c.get("reason", ""),
                        start_time=float(c.get("start", 0.0)),
                        end_time=float(c.get("end", 0.0)),
                        storage_path=f"users/{user_id}/{c.get('file', '')}",
                        signed_url=c.get("url")
                    )
                    db_session.add(clip_rec)

                db_session.commit()
            finally:
                db_session.close()
        except Exception as db_err:
            print(f"[DB] Warning saving job and usage: {db_err}")

        # 3. Save per-user local clips archive (subject to 24h retention sweeper)
        try:
            user_dir = OUTPUT_DIR / "users" / user_id
            user_dir.mkdir(parents=True, exist_ok=True)
            with open(user_dir / "clips.json", "w", encoding="utf-8") as f:
                json.dump({
                    "user_id": user_id,
                    "video": result.get("video"),
                    "clips": result.get("clips", []),
                    "created_at": time.time()
                }, f, indent=2)
        except Exception as e:
            print(f"Warning: Failed to save user clips: {e}")

        # 4. Dispatch completion email notification if user email is known
        try:
            notify_job_completed(
                user_email=job.get("user_email"),
                job_id=job_id,
                video_title=result.get("video", {}).get("title", "Video"),
                clips=result.get("clips", []),
                user_id=user_id
            )
        except Exception as n_err:
            print(f"[Notifier] Completion notice error: {n_err}")

    except Exception as e:
        # Transient retry handling (up to max_retries attempts before permanent failure)
        current_retries = job.get("retry_count", 0)
        max_retries = getattr(queue_manager, "max_retries", 2)
        if current_retries < max_retries:
            queue_manager.record_retry(job_id, str(e))
            print(f"[Worker] Transient error for job {job_id} ({e}). Retrying ({current_retries + 1}/{max_retries})...")
            time.sleep(1.5)
            return run_pipeline_task(job_id, url, count, user_id, source_file_path)

        job["status"] = "error"
        job["error"] = str(e)
        for k, v in job["steps"].items():
            if v["status"] == "processing":
                v["status"] = "error"
                break

        # Safe automatic refund of deducted credits on job failure
        refunded_amount = 0.0
        try:
            CreditService.refund_credits(
                user_id=user_id,
                reference_id=job_id,
                reason=f"Pipeline error (after {current_retries} retries): {str(e)}"
            )
            refunded_amount = float(job.get("credits_deducted", 0.0))
        except Exception as ref_err:
            print(f"[CreditService] Warning: Could not refund {job_id}: {ref_err}")

        # Dispatch failure notification
        try:
            notify_job_failed(
                user_email=job.get("user_email"),
                job_id=job_id,
                error_message=str(e),
                credits_refunded=refunded_amount,
                user_id=user_id
            )
        except Exception:
            pass

        # Update DB job status to error
        try:
            db_session = get_db_session()
            try:
                job_rec = db_session.query(ProcessingJobModel).filter_by(job_id=job_id).first()
                if job_rec:
                    job_rec.status = "error"
                    job_rec.error = str(e)
                    job_rec.completed_at = datetime.now(timezone.utc)
                    db_session.commit()
            finally:
                db_session.close()
        except Exception:
            pass

        # Sync error state to Supabase
        if is_supabase_enabled():
            save_job_to_cloud(
                job_id=job_id,
                user_id=user_id,
                url=url,
                status="failed",
                error=str(e)
            )
    finally:
        if source_file_path and job.get("status") in ("completed", "error"):
            try:
                p = Path(source_file_path)
                if p.exists():
                    p.unlink(missing_ok=True)
            except Exception:
                pass

# Register worker with Queue Manager
queue_manager.set_worker(run_pipeline_task)


def extract_user_id(authorization: Optional[str] = None, x_device_id: Optional[str] = None) -> str:
    """Extract authenticated user ID using cryptographic Clerk JWKS verification, with device fallback."""
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1].strip()
        if token:
            claims = verify_clerk_token(token)
            if claims:
                uid = claims.get("sub") or claims.get("user_id")
                if uid:
                    return str(uid)
    
    # Scoped device ID fallback for guest users to prevent cross-tenant collisions
    if x_device_id:
        clean_dev = re.sub(r"[^\w\-]", "", x_device_id)[:48]
        if clean_dev:
            return f"guest_{clean_dev}"

    return "guest_user"


def extract_user_email(authorization: Optional[str] = None) -> Optional[str]:
    """Extract authenticated user email from Clerk token claims."""
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1].strip()
        if token:
            claims = verify_clerk_token(token)
            if claims:
                return claims.get("email") or claims.get("primary_email_address")
    return None


@app.get("/")
@app.get("/dashboard")
def get_index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/system/status")
def get_system_status():
    """System health, cloud storage status, queue metrics, and retention policy."""
    return {
        "status": "healthy",
        "supabase_connected": is_supabase_enabled(),
        "retention_policy": "24_hours",
        "retention_seconds": 86400,
        "security": "clerk_jwks_verified",
        "max_video_duration_minutes": 35,
        "max_video_duration_seconds": MAX_VIDEO_DURATION_SECONDS,
        "queue": queue_manager.get_queue_stats()
    }


class TranscribeRequest(BaseModel):
    url: str


@app.get("/health")
@app.get("/api/health")
def health_check():
    """Production health check for container and orchestrator monitoring."""
    import shutil
    db_connected = False
    try:
        session = get_db_session()
        try:
            session.execute(text("SELECT 1"))
            db_connected = True
        finally:
            session.close()
    except Exception:
        db_connected = False

    storage = get_storage_provider()
    storage_info = {
        "provider": storage.provider_type,
        "is_cloud": storage.provider_type in ("s3", "supabase"),
        "status": "operational"
    }

    disk_total_mb = 0
    disk_free_mb = 0
    disk_used_percent = 0.0
    try:
        total, used, free = shutil.disk_usage(BASE_DIR)
        disk_total_mb = round(total / (1024 * 1024), 1)
        disk_free_mb = round(free / (1024 * 1024), 1)
        disk_used_percent = round((used / total) * 100, 1)
    except Exception:
        pass

    return {
        "status": "healthy" if db_connected else "degraded",
        "service": "Clipper AI Video Engine",
        "database": "connected" if db_connected else "disconnected",
        "storage": storage_info,
        "supabase_connected": is_supabase_enabled(),
        "queue": queue_manager.get_queue_stats(),
        "disk": {
            "total_mb": disk_total_mb,
            "free_mb": disk_free_mb,
            "used_percent": disk_used_percent
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }



@app.get("/api/credits")
def get_user_credits(
    authorization: Optional[str] = Header(None),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id")
):
    """Retrieve authenticated user's current credit balance."""
    user_id = extract_user_id(authorization, x_device_id)
    balance = CreditService.get_balance(user_id)
    return {
        "user_id": user_id,
        "balance": balance,
        "currency": "credits"
    }


@app.get("/api/credits/transactions")
def get_user_transactions(
    limit: int = 50,
    offset: int = 0,
    authorization: Optional[str] = Header(None),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id")
):
    """Retrieve paginated audit log of credit transactions for authenticated user."""
    user_id = extract_user_id(authorization, x_device_id)
    txs = CreditService.get_transactions(user_id, limit=limit, offset=offset)
    return {
        "user_id": user_id,
        "transactions": txs,
        "count": len(txs)
    }


@app.get("/api/credits/estimate")
def estimate_operation_cost(
    operation: str = "ai_clipper",
    duration_seconds: Optional[float] = None,
    url: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id")
):
    """Pre-flight credit cost estimation before starting expensive processing."""
    user_id = extract_user_id(authorization, x_device_id)

    # Rate limit check on estimation
    allowed, _, retry_after = estimate_limiter.is_allowed(user_id, max_requests=30, window_seconds=60)
    if not allowed:
        raise HTTPException(status_code=429, detail=f"Too many estimate requests. Try again in {retry_after}s.")

    # Probe duration from URL if provided and duration_seconds omitted
    if url and not duration_seconds:
        try:
            safe_url = sanitize_and_validate_youtube_url(url)
            meta = get_video_metadata_preflight(safe_url, max_duration_seconds=MAX_VIDEO_DURATION_SECONDS)
            duration_seconds = float(meta.get("duration", 60.0))
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

    dur = float(duration_seconds or 60.0)
    estimate = CreditService.estimate_cost(operation, dur)
    current_balance = CreditService.get_balance(user_id)
    estimate["available_credits"] = current_balance
    estimate["can_afford"] = current_balance >= estimate["estimated_credits"]
    return estimate


@app.post("/api/transcribe")
def transcribe_video(
    req: TranscribeRequest,
    authorization: Optional[str] = Header(None),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id")
):
    """
    Independent billable transcription flow.
    Consumes credits at TRANSCRIPTION rate (e.g. 1 credit/min).
    """
    user_id = extract_user_id(authorization, x_device_id)

    # 1. Rate limiting
    allowed, _, retry_after = transcription_limiter.is_allowed(user_id, max_requests=5, window_seconds=60)
    if not allowed:
        raise HTTPException(status_code=429, detail=f"Rate limit exceeded. Try again in {retry_after}s.")

    # 2. Validate URL & probe duration
    try:
        safe_url = sanitize_and_validate_youtube_url(req.url)
        video_meta = get_video_metadata_preflight(safe_url, max_duration_seconds=MAX_VIDEO_DURATION_SECONDS)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    dur = float(video_meta.get("duration", 60.0))
    cost_data = CreditService.estimate_cost("TRANSCRIPTION", dur)
    required_credits = cost_data["estimated_credits"]
    available_credits = CreditService.get_balance(user_id)

    # 3. Solvency check
    if available_credits < required_credits:
        return JSONResponse(
            status_code=402,
            content={
                "error": {
                    "code": "INSUFFICIENT_CREDITS",
                    "message": f"Not enough credits for transcription. Required: {required_credits}, Available: {available_credits}.",
                    "required": required_credits,
                    "available": available_credits
                }
            }
        )

    job_id = str(uuid.uuid4())

    # 4. Atomic debit
    CreditService.reserve_and_consume(
        user_id=user_id,
        amount=required_credits,
        reference_id=job_id,
        source="TRANSCRIPTION",
        metadata={"url": safe_url, "duration": dur}
    )

    # 5. Execute transcription
    t_start = time.time()
    try:
        transcript_data = get_transcript(video_id=video_meta["id"])
        segments = transcript_data.get("segments", [])
        proc_sec = round(time.time() - t_start, 2)

        # Record usage
        try:
            db_s = get_db_session()
            try:
                usage = UsageRecord(
                    user_id=user_id,
                    job_id=job_id,
                    operation="transcription",
                    duration_seconds=dur,
                    processing_seconds=proc_sec,
                    llm_calls=0
                )
                db_s.add(usage)
                db_s.commit()
            finally:
                db_s.close()
        except Exception:
            pass

        return {
            "job_id": job_id,
            "status": "completed",
            "video": video_meta,
            "segments": segments,
            "total_segments": len(segments),
            "credits_deducted": required_credits,
            "credits_remaining": CreditService.get_balance(user_id)
        }
    except Exception as err:
        # Auto-refund on failure
        CreditService.refund_credits(
            user_id=user_id,
            reference_id=job_id,
            reason=f"Transcription failure: {str(err)}"
        )
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(err)}")


@app.get("/api/usage")
def get_user_usage_summary(
    authorization: Optional[str] = Header(None),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id")
):
    """Retrieve actual infrastructure usage metrics for authenticated user using fast SQL aggregation."""
    user_id = extract_user_id(authorization, x_device_id)
    session = get_db_session()
    try:
        row = (
            session.query(
                func.count(UsageRecord.id),
                func.coalesce(func.sum(UsageRecord.duration_seconds), 0.0),
                func.coalesce(func.sum(UsageRecord.clip_count), 0),
                func.coalesce(func.sum(UsageRecord.llm_calls), 0),
            )
            .filter_by(user_id=user_id)
            .first()
        )
        total_jobs = row[0] if row else 0
        total_duration_mins = (float(row[1]) / 60.0) if row else 0.0
        total_clips = int(row[2]) if row else 0
        total_llm_calls = int(row[3]) if row else 0

        return {
            "user_id": user_id,
            "total_jobs": total_jobs,
            "total_duration_minutes": round(total_duration_mins, 1),
            "total_clips_generated": total_clips,
            "total_llm_calls": total_llm_calls,
            "balance": CreditService.get_balance(user_id)
        }
    finally:
        session.close()


@app.get("/api/plans")
def list_plans():
    """List available subscription tiers (prepared for future payments)."""
    return {"plans": SubscriptionService.get_plans()}


@app.get("/api/credit-packages")
def list_credit_packages():
    """List credit top-up packages (prepared for future payments)."""
    return {"packages": PaymentService.get_available_packages()}


class CheckoutRequest(BaseModel):
    item_type: str  # "plan" or "credit_package"
    item_id: str
    success_url: str
    cancel_url: str


class PortalRequest(BaseModel):
    return_url: str


@app.get("/api/billing/status")
def get_billing_status():
    """Returns billing provider configuration status."""
    return {
        "stripe_configured": StripeBillingService.is_configured(),
        "mode": "live" if StripeBillingService.is_configured() else "sandbox",
        "supported_plans": [p["name"] for p in SubscriptionService.get_plans()],
        "supported_packages": [p["name"] for p in PaymentService.get_available_packages()]
    }


@app.post("/api/billing/create-checkout")
def create_billing_checkout(
    req: CheckoutRequest,
    authorization: Optional[str] = Header(None),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id")
):
    """Creates a Stripe Checkout Session for subscription or credit purchase."""
    user_id = extract_user_id(authorization, x_device_id)
    user_email = extract_user_email(authorization)
    try:
        session_info = StripeBillingService.create_checkout_session(
            user_id=user_id,
            item_type=req.item_type,
            item_id=req.item_id,
            success_url=req.success_url,
            cancel_url=req.cancel_url,
            user_email=user_email
        )
        return session_info
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Billing error: {str(e)}")


@app.post("/api/billing/create-portal")
def create_customer_portal(
    req: PortalRequest,
    authorization: Optional[str] = Header(None),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id")
):
    """Generates customer portal session for managing payment methods and cancelations."""
    user_id = extract_user_id(authorization, x_device_id)
    return StripeBillingService.create_customer_portal_session(
        user_id=user_id,
        return_url=req.return_url
    )


@app.post("/api/billing/webhook")
async def stripe_webhook(request: Request):
    """Handles signed webhook events from Stripe."""
    payload_bytes = await request.body()
    sig_header = request.headers.get("Stripe-Signature")
    try:
        result = StripeBillingService.process_webhook_event(payload_bytes, sig_header)
        return result
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@app.get("/api/user/me")
def get_current_user_profile(
    authorization: Optional[str] = Header(None),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id")
):
    user_id = extract_user_id(authorization, x_device_id)
    subscription = SubscriptionService.get_user_subscription(user_id)
    balance = CreditService.get_balance(user_id)
    return {
        "user_id": user_id,
        "is_authenticated": user_id != "guest_user" and not user_id.startswith("guest_"),
        "plan": subscription["plan_name"],
        "monthly_credits": subscription["monthly_credits"],
        "balance": balance,
        "daily_limit": 10,
        "supabase_connected": is_supabase_enabled()
    }


class AdminCreditRequest(BaseModel):
    user_id: str
    amount: float
    action: str = "add"  # add, deduct, set
    reason: Optional[str] = "Admin manual adjustment"


def check_admin_authorization(authorization: Optional[str] = None, x_admin_key: Optional[str] = None):
    admin_key = os.getenv("ADMIN_SECRET_KEY") or os.getenv("CLERK_SECRET_KEY")
    admin_user_ids = set(filter(None, [u.strip() for u in os.getenv("ADMIN_USER_IDS", "").split(",")]))
    caller_id = extract_user_id(authorization)

    key_match = bool(x_admin_key and admin_key and x_admin_key == admin_key)
    user_match = bool(caller_id in admin_user_ids and caller_id.startswith("user_"))
    dev_fallback = bool(not admin_key and not admin_user_ids and caller_id.startswith("user_") and os.getenv("ENVIRONMENT", "").lower() not in ("production", "prod"))

    if not (key_match or user_match or dev_fallback):
        raise HTTPException(status_code=403, detail="Unauthorized admin action.")


@app.post("/api/admin/credits")
def admin_adjust_credits_endpoint(
    req: AdminCreditRequest,
    authorization: Optional[str] = Header(None),
    x_admin_key: Optional[str] = Header(None, alias="X-Admin-Key")
):
    """
    Admin endpoint to grant, deduct, or set user credits.
    Updates PostgreSQL/SQLite DB and immediately syncs to Clerk publicMetadata.
    """
    check_admin_authorization(authorization, x_admin_key)

    try:
        res = CreditService.admin_adjust_credits(
            user_id=req.user_id,
            amount=req.amount,
            action=req.action,
            reason=req.reason or "Admin modification"
        )
        return res
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Admin credit adjustment failed: {e}")


@app.get("/api/admin/users")
def admin_list_users_endpoint(
    authorization: Optional[str] = Header(None),
    x_admin_key: Optional[str] = Header(None, alias="X-Admin-Key")
):
    """
    List all registered users from Clerk with their live credit balances, plans, and database status.
    """
    check_admin_authorization(authorization, x_admin_key)

    from clipper.clerk_service import list_clerk_users, sync_credits_to_clerk_background
    users = list_clerk_users()
    db_s = get_db_session()
    try:
        user_ids = [u["id"] for u in users if u.get("id")]
        accounts_map = {}
        if user_ids:
            accounts = db_s.query(CreditAccount).filter(CreditAccount.user_id.in_(user_ids)).all()
            accounts_map = {acc.user_id: acc for acc in accounts}

        for u in users:
            uid = u.get("id")
            acc = accounts_map.get(uid)
            if acc:
                u["db_balance"] = round(acc.balance, 2)
                # Keep Clerk metadata matching DB
                if u.get("credits") != round(acc.balance, 2):
                    u["credits"] = round(acc.balance, 2)
                    sync_credits_to_clerk_background(uid, acc.balance, u.get("plan", "free"))
            else:
                u["db_balance"] = 100.0
                if u.get("credits") is None:
                    u["credits"] = 100.0
                    sync_credits_to_clerk_background(uid, 100.0, "free")
        return {"users": users, "count": len(users)}
    finally:
        db_s.close()


@app.get("/api/clips")
def get_saved_clips(
    authorization: Optional[str] = Header(None),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id")
):
    """Retrieve saved clips isolated to the authenticated user within 24h retention window."""
    user_id = extract_user_id(authorization, x_device_id)

    # Candidate user IDs: exact user_id, plus guest device ID fallback if claiming guest work
    target_ids = [user_id]
    if x_device_id:
        clean_dev = re.sub(r"[^\w\-]", "", x_device_id)[:48]
        guest_id = f"guest_{clean_dev}"
        if guest_id != user_id and guest_id not in target_ids:
            target_ids.append(guest_id)

    # 1. Primary Source of Truth: Query SQLAlchemy ClipModel records
    session = get_db_session()
    clips = []
    try:
        records = (
            session.query(ClipModel)
            .filter(ClipModel.user_id.in_(target_ids))
            .order_by(ClipModel.created_at.desc())
            .all()
        )
        for r in records:
            signed_url = r.signed_url
            storage_path = r.storage_path

            # Dynamically refresh signed URL if storage path exists
            if storage_path:
                if s3_storage.is_configured():
                    fresh_s3 = s3_storage.generate_presigned_download_url(
                        storage_path, expires_in=86400, filename=r.file_name
                    )
                    if fresh_s3:
                        signed_url = fresh_s3
                elif is_supabase_enabled():
                    try:
                        s_client = get_supabase_client()
                        if s_client:
                            s_res = s_client.storage.from_(STORAGE_BUCKET).create_signed_url(
                                storage_path, expires_in=86400
                            )
                            fresh_url = (
                                s_res.get("signedURL")
                                or s_res.get("signedUrl")
                                or (s_res.get("data") or {}).get("signedUrl")
                            )
                            if fresh_url:
                                signed_url = fresh_url
                    except Exception as ref_err:
                        print(f"[Storage] Warning refreshing signed url: {ref_err}")

            # Fallback to local file path if signed_url still empty
            if not signed_url:
                local_u = OUTPUT_DIR / "users" / r.user_id / r.file_name
                local_root = OUTPUT_DIR / r.file_name
                if local_u.exists():
                    signed_url = f"/output/users/{r.user_id}/{r.file_name}"
                elif local_root.exists():
                    signed_url = f"/output/{r.file_name}"

            tags = []
            if r.tags_json:
                try:
                    tags = json.loads(r.tags_json) if isinstance(r.tags_json, str) else r.tags_json
                except Exception:
                    tags = []

            clips.append({
                "id": r.id,
                "job_id": r.job_id,
                "file": r.file_name,
                "title": r.title,
                "duration": r.duration,
                "score": r.score,
                "tags": tags,
                "explanation": r.explanation or "",
                "reason": r.reason or "",
                "start": r.start_time,
                "end": r.end_time,
                "url": signed_url,
                "created_at": r.created_at.isoformat() if r.created_at else None
            })
    except Exception as dbe:
        print(f"[DB] Error fetching clips from ClipModel: {dbe}")
    finally:
        session.close()

    if clips:
        return {
            "clips": clips,
            "count": len(clips),
            "user_id": user_id,
            "source": "database"
        }

    # 2. Check Supabase cloud DB if table clips exists and has records
    if is_supabase_enabled():
        cloud_clips = get_user_clips_from_cloud(user_id)
        if cloud_clips:
            return {
                "clips": cloud_clips,
                "count": len(cloud_clips),
                "user_id": user_id,
                "source": "supabase"
            }

    # 3. Fallback to local user clips.json file
    for uid in target_ids:
        user_clips_file = OUTPUT_DIR / "users" / uid / "clips.json"
        if user_clips_file.exists():
            try:
                with open(user_clips_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                loaded = data.get("clips", [])
                if loaded:
                    return {
                        "clips": loaded,
                        "count": len(loaded),
                        "user_id": user_id,
                        "source": "local"
                    }
            except Exception as e:
                print(f"[Storage] Error reading clips.json: {e}")

    return {"clips": [], "count": 0, "user_id": user_id, "source": "empty"}


@app.get("/api/download")
def download_clip_file(
    file: Optional[str] = None,
    url: Optional[str] = None,
    name: Optional[str] = None
):
    """
    Direct download endpoint enforcing Content-Disposition: attachment
    so browser triggers native download instead of opening a player tab.
    """
    download_filename = name or file or "clip.mp4"
    if not download_filename.endswith(".mp4"):
        download_filename += ".mp4"

    # 1. Check local file in OUTPUT_DIR
    if file:
        clean_name = os.path.basename(file)
        local_path = OUTPUT_DIR / clean_name
        if local_path.exists():
            return FileResponse(
                path=str(local_path),
                filename=download_filename,
                media_type="video/mp4",
                headers={"Content-Disposition": f'attachment; filename="{download_filename}"'}
            )
        for u_dir in (OUTPUT_DIR / "users").glob("*"):
            u_file = u_dir / clean_name
            if u_file.exists():
                return FileResponse(
                    path=str(u_file),
                    filename=download_filename,
                    media_type="video/mp4",
                    headers={"Content-Disposition": f'attachment; filename="{download_filename}"'}
                )

    # 2. If remote cloud URL provided, proxy stream it with attachment header
    if url and (url.startswith("http://") or url.startswith("https://")):
        import requests
        try:
            req = requests.get(url, stream=True, timeout=20)
            if req.status_code in (200, 206):
                return StreamingResponse(
                    req.iter_content(chunk_size=65536),
                    media_type="video/mp4",
                    headers={"Content-Disposition": f'attachment; filename="{download_filename}"'}
                )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to stream clip: {e}")

    raise HTTPException(status_code=404, detail="Clip file not found for download.")


@app.delete("/api/clips/{clip_identifier}")
def delete_clip_endpoint(
    clip_identifier: str,
    authorization: Optional[str] = Header(None),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id")
):
    """Delete clip from persistence database, cloud storage, and local disk."""
    user_id = extract_user_id(authorization, x_device_id)
    session = get_db_session()
    deleted = False
    try:
        clip_rec = None
        if clip_identifier.isdigit():
            clip_rec = session.query(ClipModel).filter_by(id=int(clip_identifier)).first()
        if not clip_rec:
            clip_rec = session.query(ClipModel).filter(
                (ClipModel.file_name == clip_identifier) | (ClipModel.file_name == f"{clip_identifier}.mp4")
            ).first()

        if clip_rec:
            if clip_rec.storage_path:
                try:
                    if s3_storage.is_configured():
                        s3_storage.delete_file(clip_rec.storage_path)
                    elif is_supabase_enabled():
                        client = get_supabase_client()
                        if client:
                            client.storage.from_(STORAGE_BUCKET).remove([clip_rec.storage_path])
                except Exception as e:
                    print(f"[Delete] Cloud storage removal notice: {e}")

            file_name = clip_rec.file_name
            session.delete(clip_rec)
            session.commit()
            deleted = True
        else:
            file_name = os.path.basename(clip_identifier)

        local_p = OUTPUT_DIR / file_name
        if local_p.exists():
            local_p.unlink(missing_ok=True)
            deleted = True
        for u_dir in (OUTPUT_DIR / "users").glob("*"):
            u_p = u_dir / file_name
            if u_p.exists():
                u_p.unlink(missing_ok=True)
                deleted = True

        return {"success": True, "deleted": deleted, "clip": clip_identifier}
    finally:
        session.close()


@app.post("/api/process")
def process_video(
    req: ProcessRequest,
    authorization: Optional[str] = Header(None),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
    x_idempotency_key: Optional[str] = Header(None, alias="X-Idempotency-Key")
):
    user_id = extract_user_id(authorization, x_device_id)

    # 1. Rate limiting protection
    allowed, _, retry_after = ai_clipping_limiter.is_allowed(user_id, max_requests=5, window_seconds=60)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded for AI clipping. Please try again in {retry_after}s."
        )

    # 2. Idempotency protection against double clicks & browser refresh
    if x_idempotency_key:
        try:
            db_s = get_db_session()
            try:
                existing_job = db_s.query(ProcessingJobModel).filter_by(
                    user_id=user_id,
                    idempotency_key=x_idempotency_key
                ).first()
            finally:
                db_s.close()
            if existing_job and existing_job.job_id in jobs:
                return {
                    "job_id": existing_job.job_id,
                    "user_id": user_id,
                    "status": jobs[existing_job.job_id]["status"],
                    "queue_position": jobs[existing_job.job_id].get("queue_position", 0),
                    "idempotent": True
                }
        except Exception:
            pass

    # 3. Strict URL validation & SSRF protection
    try:
        safe_url = sanitize_and_validate_youtube_url(req.url)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))

    # 4. Concurrency Protection: Enforce single active job per user
    active_job = queue_manager.check_user_active_job(user_id)
    if active_job:
        raise HTTPException(
            status_code=429,
            detail="You already have an active clipping job in progress. Please wait for it to finish or check your live progress."
        )

    # 5. Preflight check: Probe metadata & enforce 35-minute maximum video duration
    try:
        video_meta = get_video_metadata_preflight(safe_url, max_duration_seconds=MAX_VIDEO_DURATION_SECONDS)
    except VideoDurationLimitExceeded as err:
        raise HTTPException(status_code=400, detail=str(err))
    except VideoDownloadError as err:
        raise HTTPException(status_code=400, detail=str(err))
    except Exception as err:
        raise HTTPException(status_code=400, detail=f"Could not probe YouTube video: {str(err)}")

    # 6. Credit Solvency Check & Atomic Deduction
    dur = float(video_meta.get("duration", 60.0))
    cost_data = CreditService.estimate_cost("AI_CLIPPER", dur)
    required_credits = cost_data["estimated_credits"]
    available_credits = CreditService.get_balance(user_id)

    if available_credits < required_credits:
        return JSONResponse(
            status_code=402,
            content={
                "error": {
                    "code": "INSUFFICIENT_CREDITS",
                    "message": f"Not enough credits for this video. Required: {required_credits}, Available: {available_credits}.",
                    "required": required_credits,
                    "available": available_credits
                }
            }
        )

    job_id = str(uuid.uuid4())

    # Atomically debit credits before scheduling
    debit_info = CreditService.reserve_and_consume(
        user_id=user_id,
        amount=required_credits,
        reference_id=job_id,
        source="AI_CLIPPER",
        metadata={"video_title": video_meta.get("title"), "duration": dur}
    )

    initial_job_data = {
        "job_id": job_id,
        "user_id": user_id,
        "user_email": extract_user_email(authorization),
        "url": safe_url,
        "count": req.count,
        "status": "processing",
        "stage": "video",
        "current_message": "Initializing clipping pipeline...",
        "progress_percent": 5,
        "steps": init_job_steps(),
        "clips": [],
        "video": video_meta,
        "queue_position": 0,
        "credits_deducted": required_credits,
        "created_at": time.time(),
        "error": None
    }

    # Record job in database
    try:
        db_s = get_db_session()
        try:
            db_job = ProcessingJobModel(
                job_id=job_id,
                user_id=user_id,
                job_type="ai_clipper",
                url=safe_url,
                status="processing",
                stage="video",
                progress_percent=5,
                duration_seconds=dur,
                credits_deducted=required_credits,
                idempotency_key=x_idempotency_key
            )
            db_s.add(db_job)
            db_s.commit()
        finally:
            db_s.close()
    except Exception as db_e:
        print(f"[DB] Warning creating job record: {db_e}")

    # Real-time sync to Supabase Cloud Database if enabled
    if is_supabase_enabled():
        save_job_to_cloud(
            job_id=job_id,
            user_id=user_id,
            url=safe_url,
            status="processing",
            progress_percent=5,
            stage="video"
        )

    job, started_immediately = queue_manager.add_job(
        job_id=job_id,
        user_id=user_id,
        url=safe_url,
        count=req.count,
        initial_job_data=initial_job_data
    )

    return {
        "job_id": job_id,
        "user_id": user_id,
        "status": job["status"],
        "queue_position": job.get("queue_position", 0),
        "video": video_meta,
        "credits_deducted": required_credits,
        "credits_remaining": debit_info.get("balance", available_credits - required_credits)
    }


@app.post("/api/process-upload")
async def process_video_upload(
    video: UploadFile = File(...),
    count: int = Form(10),
    authorization: Optional[str] = Header(None),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
    x_idempotency_key: Optional[str] = Header(None, alias="X-Idempotency-Key")
):
    """
    AI Video Clipper endpoint for direct video file uploads.
    Streams upload to disk, enforces zero-trust magic byte & size validation,
    probes duration and safeguards, debits credits, and runs clipping pipeline.
    """
    user_id = extract_user_id(authorization, x_device_id)

    # 1. Rate limiting protection
    allowed, _, retry_after = ai_clipping_limiter.is_allowed(user_id, max_requests=5, window_seconds=60)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded for AI clipping. Please try again in {retry_after}s."
        )

    # 2. Concurrency Protection: Enforce single active job per user
    active_job = queue_manager.check_user_active_job(user_id)
    if active_job:
        raise HTTPException(
            status_code=429,
            detail="You already have an active clipping job in progress. Please wait for it to finish or check your live progress."
        )

    # 3. Stream upload file to disk with 500MB size safeguard
    job_id = str(uuid.uuid4())
    safe_filename = sanitize_upload_filename(video.filename)
    upload_file_path = TEMP_DIR / f"{job_id}_{safe_filename}"
    bytes_written = 0
    max_size = 500 * 1024 * 1024  # 500MB

    try:
        with open(upload_file_path, "wb") as f:
            while chunk := await video.read(1024 * 1024):  # 1MB chunks
                bytes_written += len(chunk)
                if bytes_written > max_size:
                    raise ValueError("File size limit exceeded: maximum allowed upload size is 500 MB.")
                f.write(chunk)
    except Exception as e:
        upload_file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400 if "limit exceeded" in str(e) else 500, detail=f"Failed to upload video: {str(e)}")

    # 4. Zero-Trust Binary Magic Bytes and File Signature Validation
    try:
        validate_upload_size(upload_file_path, max_size_bytes=max_size)
        validate_video_magic_bytes(upload_file_path)
    except ValueError as val_err:
        upload_file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(val_err))

    # 5. Probe video metadata & enforce 35-minute duration cap
    try:
        meta = probe_video_metadata(upload_file_path)
    except Exception as e:
        upload_file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Invalid video file: {str(e)}")

    dur = float(meta.get("duration", 0.0))
    if dur <= 0:
        upload_file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Invalid video duration (0 seconds).")

    if dur > MAX_VIDEO_DURATION_SECONDS:
        upload_file_path.unlink(missing_ok=True)
        mins = round(dur / 60, 1)
        max_mins = int(MAX_VIDEO_DURATION_SECONDS / 60)
        raise HTTPException(
            status_code=400,
            detail=f"Video duration ({mins} mins) exceeds the {max_mins}-minute limit. Please submit videos up to {max_mins} minutes."
        )

    video_meta = {
        "id": f"upload_{job_id[:8]}",
        "title": video.filename or "Uploaded Video",
        "duration": dur,
        "width": meta.get("width", 0),
        "height": meta.get("height", 0)
    }

    # 5. Credit Solvency Check & Atomic Deduction
    cost_data = CreditService.estimate_cost("AI_CLIPPER", dur)
    required_credits = cost_data["estimated_credits"]
    available_credits = CreditService.get_balance(user_id)

    if available_credits < required_credits:
        upload_file_path.unlink(missing_ok=True)
        return JSONResponse(
            status_code=402,
            content={
                "error": {
                    "code": "INSUFFICIENT_CREDITS",
                    "message": f"Not enough credits for this video. Required: {required_credits}, Available: {available_credits}.",
                    "required": required_credits,
                    "available": available_credits
                }
            }
        )

    # Atomically debit credits before scheduling
    debit_info = CreditService.reserve_and_consume(
        user_id=user_id,
        amount=required_credits,
        reference_id=job_id,
        source="AI_CLIPPER",
        metadata={"video_title": video_meta["title"], "duration": dur, "type": "uploaded_video"}
    )

    initial_job_data = {
        "job_id": job_id,
        "user_id": user_id,
        "user_email": extract_user_email(authorization),
        "url": f"uploaded://{safe_filename}",
        "count": count,
        "status": "processing",
        "stage": "video",
        "current_message": "Initializing clipping pipeline on uploaded video...",
        "progress_percent": 5,
        "steps": init_job_steps(),
        "clips": [],
        "video": video_meta,
        "queue_position": 0,
        "credits_deducted": required_credits,
        "created_at": time.time(),
        "error": None
    }

    # Record job in local database
    try:
        db_s = get_db_session()
        try:
            db_job = ProcessingJobModel(
                job_id=job_id,
                user_id=user_id,
                job_type="ai_clipper",
                url=f"uploaded://{safe_filename}",
                status="processing",
                stage="video",
                progress_percent=5,
                duration_seconds=dur,
                credits_deducted=required_credits,
                idempotency_key=x_idempotency_key
            )
            db_s.add(db_job)
            db_s.commit()
        finally:
            db_s.close()
    except Exception as db_e:
        print(f"[DB] Warning creating job record: {db_e}")

    # Real-time sync to Supabase Cloud Database if enabled
    if is_supabase_enabled():
        save_job_to_cloud(
            job_id=job_id,
            user_id=user_id,
            url=f"uploaded://{safe_filename}",
            status="processing",
            progress_percent=5,
            stage="video"
        )

    job, started_immediately = queue_manager.add_job(
        job_id=job_id,
        user_id=user_id,
        url=f"uploaded://{safe_filename}",
        count=count,
        initial_job_data=initial_job_data,
        source_file_path=str(upload_file_path)
    )

    return {
        "job_id": job_id,
        "user_id": user_id,
        "status": job["status"],
        "queue_position": job.get("queue_position", 0),
        "video": video_meta,
        "credits_deducted": required_credits,
        "credits_remaining": debit_info.get("balance", available_credits - required_credits)
    }


@app.get("/api/status/{job_id}")
def get_status(
    job_id: str,
    authorization: Optional[str] = Header(None),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
    token: Optional[str] = None,
    device_id: Optional[str] = None
):
    caller_id = extract_user_id(authorization or (f"Bearer {token}" if token else None), x_device_id or device_id)
    job = queue_manager.get_job(job_id)
    if not job:
        # Fallback to persistent DB for completed/error jobs across server restarts
        db_s = get_db_session()
        try:
            db_job = db_s.query(ProcessingJobModel).filter_by(job_id=job_id).first()
            if db_job:
                clips_recs = db_s.query(ClipModel).filter_by(job_id=job_id).all()
                clips_list = []
                for c in clips_recs:
                    clips_list.append({
                        "file": c.file_name,
                        "title": c.title,
                        "duration": c.duration,
                        "score": c.score,
                        "tags": json.loads(c.tags_json) if c.tags_json else [],
                        "explanation": c.explanation or "",
                        "reason": c.reason or "",
                        "start": c.start_time,
                        "end": c.end_time,
                        "url": c.signed_url or f"/output/{c.file_name}",
                    })
                job = {
                    "job_id": db_job.job_id,
                    "user_id": db_job.user_id,
                    "status": db_job.status,
                    "stage": db_job.stage or "completed",
                    "progress_percent": db_job.progress_percent,
                    "current_message": db_job.error if db_job.status == "error" else f"Successfully generated {len(clips_list)} clips.",
                    "clips": clips_list,
                    "credits_deducted": db_job.credits_deducted,
                    "error": db_job.error,
                }
        finally:
            db_s.close()

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job_user = job.get("user_id")
    if job_user and caller_id != "admin" and job_user != caller_id:
        raise HTTPException(
            status_code=403,
            detail="Access denied: You do not have permission to access this job."
        )
    return job


# ============================================================================
# FIXED-DURATION VIDEO SPLITTER (SEPARATE DETERMINISTIC PIPELINE - NO AI)
# ============================================================================

split_jobs: Dict[str, Dict[str, Any]] = {}


def run_split_worker(job_id: str, video_file_path: Path, clip_duration: float, user_id: str = "guest_user", source_duration: float = 0.0):
    """Background worker for deterministic sequential video splitting."""
    job = split_jobs.get(job_id)
    if not job:
        return

    job_output_dir = SPLIT_OUTPUT_DIR / job_id
    job_output_dir.mkdir(parents=True, exist_ok=True)

    def progress_callback(data: Dict[str, Any]):
        job["stage"] = data.get("stage", "splitting")
        job["clips_created"] = data.get("current", 0)
        job["total_clips"] = data.get("total", job["total_clips"])
        job["progress_percent"] = data.get("percent", 50)
        job["current_message"] = data.get("message", "Processing video...")

    try:
        job["stage"] = "splitting"
        job["current_message"] = f"Splitting video into {int(clip_duration)}s segments..."
        job["progress_percent"] = 15

        res = split_video_sequentially(
            video_path=video_file_path,
            clip_duration=clip_duration,
            output_dir=job_output_dir,
            progress_callback=progress_callback
        )

        for c in res["clips"]:
            c["url"] = f"/output/split/{job_id}/{c['filename']}"
            c["download_url"] = f"/api/split/download/{job_id}/{c['filename']}"

        job["status"] = "completed"
        job["stage"] = "completed"
        job["progress_percent"] = 100
        job["clips_created"] = res["total_clips"]
        job["total_clips"] = res["total_clips"]
        job["clips"] = res["clips"]
        job["zip_url"] = f"/api/split/download-all/{job_id}"
        job["current_message"] = f"Successfully generated {res['total_clips']} clips."

        # Write persistent job manifest for recovery and ownership checks
        manifest_data = {
            "job_id": job_id,
            "user_id": user_id,
            "status": "completed",
            "stage": "completed",
            "progress_percent": 100,
            "clips_created": res["total_clips"],
            "total_clips": res["total_clips"],
            "clip_duration": clip_duration,
            "clips": res["clips"],
            "zip_url": f"/api/split/download-all/{job_id}",
            "created_at": job.get("created_at", time.time())
        }
        try:
            with open(job_output_dir / "manifest.json", "w", encoding="utf-8") as mf:
                json.dump(manifest_data, mf)
        except Exception as mf_err:
            print(f"[Splitter] Warning writing manifest: {mf_err}")

        # Record usage (0 credits consumed, purely tracking infrastructure utilization)
        try:
            db_s = get_db_session()
            try:
                usage = UsageRecord(
                    user_id=user_id,
                    job_id=job_id,
                    operation="video_splitter",
                    duration_seconds=float(source_duration or 0.0),
                    clip_count=res["total_clips"],
                    llm_calls=0,
                    processing_seconds=round(time.time() - job["created_at"], 2)
                )
                db_s.add(usage)
                db_s.commit()
            finally:
                db_s.close()
        except Exception as u_err:
            print(f"[Splitter] Warning logging usage: {u_err}")

    except Exception as e:
        job["status"] = "error"
        job["stage"] = "error"
        job["error"] = str(e)
        job["current_message"] = f"Error during video splitting: {str(e)}"
    finally:
        # Clean up uploaded source video file to preserve server disk space
        try:
            if video_file_path.exists():
                video_file_path.unlink(missing_ok=True)
        except Exception as err:
            print(f"[Splitter] Warning: Failed to clean up temp source video: {err}")


def get_and_authorize_split_job(job_id: str, caller_id: str) -> Dict[str, Any]:
    """Retrieve split job with fallback to disk manifest and enforce user ownership."""
    job = split_jobs.get(job_id)
    if not job:
        manifest_path = SPLIT_OUTPUT_DIR / job_id / "manifest.json"
        if manifest_path.exists():
            try:
                with open(manifest_path, "r", encoding="utf-8") as f:
                    job = json.load(f)
            except Exception:
                job = None
    if not job:
        raise HTTPException(status_code=404, detail="Split job not found.")

    owner = job.get("user_id")
    if owner and caller_id != "admin" and owner != caller_id:
        raise HTTPException(
            status_code=403,
            detail="Access denied: You do not have permission to access this split job."
        )
    return job


@app.post("/api/split")
async def start_split_video(
    video: UploadFile = File(...),
    duration: float = Form(...),
    authorization: Optional[str] = Header(None),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id")
):
    """
    Independent Fixed-Duration Video Splitter endpoint.
    Uploads video and splits it sequentially into equal-length clips using FFmpeg.
    Enforces zero-trust file validation and strict user isolation.
    """
    user_id = extract_user_id(authorization, x_device_id)

    # 1. Rate limiting protection
    allowed, _, retry_after = split_limiter.is_allowed(user_id, max_requests=10, window_seconds=60)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded for video splitting. Please try again in {retry_after}s."
        )

    if duration <= 0 or duration > 3600:
        raise HTTPException(
            status_code=400,
            detail="Clip duration must be between 1 and 3600 seconds."
        )

    job_id = str(uuid.uuid4())
    safe_filename = sanitize_upload_filename(video.filename)
    temp_upload_path = SPLIT_TEMP_DIR / f"{job_id}_{safe_filename}"
    bytes_written = 0
    max_size = 500 * 1024 * 1024  # 500MB

    # Stream write upload file to disk with 500MB size safeguard
    try:
        with open(temp_upload_path, "wb") as f:
            while chunk := await video.read(1024 * 1024):  # 1MB chunks
                bytes_written += len(chunk)
                if bytes_written > max_size:
                    raise ValueError("File size limit exceeded: maximum allowed upload size is 500 MB.")
                f.write(chunk)
    except Exception as e:
        temp_upload_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400 if "limit exceeded" in str(e) else 500, detail=f"Failed to upload video: {str(e)}")

    # Zero-Trust Binary Magic Bytes and File Signature Validation
    try:
        validate_upload_size(temp_upload_path, max_size_bytes=max_size)
        validate_video_magic_bytes(temp_upload_path)
    except ValueError as val_err:
        temp_upload_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(val_err))

    # Probe metadata
    try:
        meta = probe_video_metadata(temp_upload_path)
    except Exception as e:
        temp_upload_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Could not read video metadata: {str(e)}")

    segments = calculate_split_segments(meta["duration"], duration)
    total_clips = len(segments)

    split_jobs[job_id] = {
        "job_id": job_id,
        "user_id": user_id,
        "status": "processing",
        "stage": "upload_analyzed",
        "current_message": f"Video analyzed. Preparing {total_clips} clips...",
        "progress_percent": 10,
        "clips_created": 0,
        "total_clips": total_clips,
        "clip_duration": duration,
        "video_info": meta,
        "clips": [],
        "zip_url": None,
        "credits_deducted": 0,
        "error": None,
        "created_at": time.time()
    }

    # Spawn asynchronous worker thread
    worker_thread = threading.Thread(
        target=run_split_worker,
        args=(job_id, temp_upload_path, duration, user_id, meta.get("duration", 0.0)),
        daemon=True,
        name=f"SplitWorker-{job_id[:8]}"
    )
    worker_thread.start()

    return {
        "job_id": job_id,
        "user_id": user_id,
        "status": "processing",
        "video_info": meta,
        "total_clips": total_clips,
        "clip_duration": duration,
        "credits_deducted": 0
    }


@app.get("/api/split/status/{job_id}")
def get_split_status(
    job_id: str,
    authorization: Optional[str] = Header(None),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
    token: Optional[str] = None,
    device_id: Optional[str] = None
):
    """Retrieve real-time progress and completed clips for a split job with strict ownership check."""
    caller_id = extract_user_id(authorization or (f"Bearer {token}" if token else None), x_device_id or device_id)
    return get_and_authorize_split_job(job_id, caller_id)


@app.get("/api/split/download-all/{job_id}")
def download_all_clips_zip(
    job_id: str,
    authorization: Optional[str] = Header(None),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
    token: Optional[str] = None,
    device_id: Optional[str] = None
):
    """Download all split clips packaged into a single ZIP file with strict caller authorization."""
    caller_id = extract_user_id(authorization or (f"Bearer {token}" if token else None), x_device_id or device_id)
    get_and_authorize_split_job(job_id, caller_id)

    zip_path = SPLIT_OUTPUT_DIR / job_id / "split-clips.zip"
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="ZIP archive not found or still generating.")
    return FileResponse(
        path=str(zip_path),
        filename="split-clips.zip",
        media_type="application/zip"
    )


@app.get("/api/split/download/{job_id}/{clip_name}")
def download_single_clip(
    job_id: str,
    clip_name: str,
    authorization: Optional[str] = Header(None),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
    token: Optional[str] = None,
    device_id: Optional[str] = None
):
    """Download a single split clip with strict caller authorization."""
    caller_id = extract_user_id(authorization or (f"Bearer {token}" if token else None), x_device_id or device_id)
    get_and_authorize_split_job(job_id, caller_id)

    if not re.match(r"^clip_\d{3}\.mp4$", clip_name):
        raise HTTPException(status_code=400, detail="Invalid clip filename.")
    clip_path = SPLIT_OUTPUT_DIR / job_id / clip_name
    if not clip_path.exists():
        raise HTTPException(status_code=404, detail="Clip file not found.")
    return FileResponse(
        path=str(clip_path),
        filename=clip_name,
        media_type="video/mp4"
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    print(f"Starting AI Video Clipper Web UI on http://localhost:{port}")
    uvicorn.run("web:app", host="0.0.0.0", port=port, reload=False)

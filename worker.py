"""Standalone Background Worker for Clipper SaaS.

Runs heavy video processing (Whisper, Gemini, FFmpeg, Cloud Storage Uploads)
in an isolated process decoupled from the FastAPI web server.

Usage:
    python worker.py
"""
import os
import sys
import time
import signal
import uuid
import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from clipper.db import (
    init_db,
    get_db_session,
    ProcessingJobModel,
    ClipModel,
)
from clipper.pipeline import ClipperPipeline
from clipper.storage import upload_clip_to_storage, save_clips_to_db, get_storage_provider
from clipper.credit_service import CreditService
from clipper.notifier import send_job_completion_notification, send_job_failure_notification

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [Worker] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("worker")

WORKER_ID = f"worker_{os.getpid()}_{uuid.uuid4().hex[:6]}"
POLL_INTERVAL_SECONDS = float(os.getenv("WORKER_POLL_INTERVAL", "3.0"))
HEARTBEAT_INTERVAL_SECONDS = 30.0
MAX_JOB_RETRIES = 2

# Directories
BASE_DIR = Path(__file__).resolve().parent
TEMP_DIR = BASE_DIR / "temp_downloads"
TEMP_DIR.mkdir(exist_ok=True)
TEMP_UPLOAD_DIR = BASE_DIR / "temp_uploads"
TEMP_UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR = BASE_DIR / "output_clips"
OUTPUT_DIR.mkdir(exist_ok=True)

stop_requested = False


def sig_handler(signum, frame):
    global stop_requested
    logger.info("Received termination signal (%s). Finishing current task and exiting...", signum)
    stop_requested = True


signal.signal(signal.SIGINT, sig_handler)
signal.signal(signal.SIGTERM, sig_handler)


def heartbeat_loop(job_id: str, stop_event: threading.Event):
    """Background thread updating heartbeat_at while worker processes."""
    while not stop_event.is_set():
        stop_event.wait(HEARTBEAT_INTERVAL_SECONDS)
        if stop_event.is_set():
            break
        db_s = get_db_session()
        try:
            job = db_s.query(ProcessingJobModel).filter_by(job_id=job_id).first()
            if job and job.status == "processing":
                job.heartbeat_at = datetime.now(timezone.utc)
                db_s.commit()
        except Exception as e:
            logger.warning("Heartbeat update failed for job %s: %s", job_id, e)
        finally:
            db_s.close()


def acquire_next_job() -> Optional[dict]:
    """Atomically polls and locks the next queued job from database."""
    db_s = get_db_session()
    try:
        # Find oldest queued job
        job = db_s.query(ProcessingJobModel).filter_by(status="queued").order_by(ProcessingJobModel.created_at.asc()).first()
        if not job:
            return None

        # Lock job for this worker
        job.status = "processing"
        job.worker_id = WORKER_ID
        job.heartbeat_at = datetime.now(timezone.utc)
        db_s.commit()

        meta = {}
        if job.metadata_json:
            try:
                meta = json.loads(job.metadata_json)
            except Exception:
                meta = {}

        job_data = {
            "job_id": job.job_id,
            "user_id": job.user_id,
            "url": job.url,
            "source_file_path": getattr(job, "source_file_path", meta.get("source_file_path")),
            "count": getattr(job, "clip_count", meta.get("count", 10)),
            "retry_count": job.retry_count or 0,
        }
        return job_data
    except Exception as e:
        db_s.rollback()
        logger.error("Error acquiring next job from queue: %s", e)
        return None
    finally:
        db_s.close()


def execute_job(job_info: dict):
    job_id = job_info["job_id"]
    user_id = job_info["user_id"]
    url = job_info.get("url")
    source_file_path = job_info.get("source_file_path")
    count = job_info.get("count", 10)
    retry_count = job_info.get("retry_count", 0)

    logger.info("Starting execution for job %s (user: %s, url: %s, file: %s)", job_id, user_id, url, source_file_path)

    stop_heartbeat = threading.Event()
    hb_thread = threading.Thread(target=heartbeat_loop, args=(job_id, stop_heartbeat), daemon=True)
    hb_thread.start()

    pipeline = ClipperPipeline(
        working_dir=TEMP_DIR,
        output_dir=OUTPUT_DIR,
    )

    try:
        # Run pipeline
        if source_file_path and os.path.exists(source_file_path):
            result = pipeline.run(source_video_path=source_file_path, target_clip_count=count)
        else:
            result = pipeline.run(youtube_url=url, target_clip_count=count)

        clips = result.get("clips", [])
        video_metadata = result.get("video", {})
        title = video_metadata.get("title", "Untitled Video")

        # Upload clips to Cloud Object Storage if enabled (concurrently)
        uploaded_clips = list(clips)
        from concurrent.futures import ThreadPoolExecutor

        def _upload_worker_clip(clip: dict) -> dict:
            local_path = clip.get("file_path")
            if local_path and os.path.exists(local_path):
                clip_filename = os.path.basename(local_path)
                cloud_url = upload_clip_to_storage(
                    file_path=local_path,
                    user_id=user_id,
                    job_id=job_id,
                    clip_name=clip_filename
                )
                clip["download_url"] = cloud_url
            return clip

        if uploaded_clips:
            with ThreadPoolExecutor(max_workers=min(4, len(uploaded_clips))) as uploader:
                list(uploader.map(_upload_worker_clip, uploaded_clips))

        # Save to DB
        save_clips_to_db(user_id=user_id, job_id=job_id, clips=uploaded_clips, video_info=video_metadata)

        # Mark job as completed
        db_s = get_db_session()
        try:
            db_job = db_s.query(ProcessingJobModel).filter_by(job_id=job_id).first()
            if db_job:
                db_job.status = "completed"
                db_job.completed_at = datetime.now(timezone.utc)
                job_meta = {}
                if db_job.metadata_json:
                    try:
                        job_meta = json.loads(db_job.metadata_json)
                    except Exception:
                        pass
                job_meta["video_title"] = title
                job_meta["clips_count"] = len(uploaded_clips)
                db_job.metadata_json = json.dumps(job_meta)
                db_s.commit()
        finally:
            db_s.close()

        logger.info("Job %s successfully completed (%d clips generated)", job_id, len(uploaded_clips))

        # Send completion email notification
        try:
            send_job_completion_notification(
                user_id=user_id,
                job_id=job_id,
                video_title=title,
                clips_count=len(uploaded_clips),
            )
        except Exception as notify_err:
            logger.warning("Completion notification skipped: %s", notify_err)

    except Exception as exc:
        logger.error("Error executing job %s: %s", job_id, exc)

        # Check if retryable
        if retry_count < MAX_JOB_RETRIES:
            new_retry = retry_count + 1
            logger.info("Scheduling retry %d/%d for job %s", new_retry, MAX_JOB_RETRIES, job_id)
            db_s = get_db_session()
            try:
                db_job = db_s.query(ProcessingJobModel).filter_by(job_id=job_id).first()
                if db_job:
                    db_job.status = "queued"
                    db_job.retry_count = new_retry
                    db_s.commit()
            finally:
                db_s.close()
        else:
            # Terminal failure: refund credits and send failure notification
            logger.info("Job %s exhausted retries. Marking error and refunding credits.", job_id)
            db_s = get_db_session()
            try:
                db_job = db_s.query(ProcessingJobModel).filter_by(job_id=job_id).first()
                if db_job:
                    db_job.status = "error"
                    db_job.error = str(exc)
                    db_s.commit()
            finally:
                db_s.close()

            # Refund reserved credits
            try:
                CreditService.refund_credits(
                    user_id=user_id,
                    reference_id=job_id,
                    reason=f"Worker processing error: {exc}"
                )
            except Exception as ref_err:
                logger.warning("Credit refund error: %s", ref_err)

            # Send failure notification
            try:
                send_job_failure_notification(
                    user_id=user_id,
                    job_id=job_id,
                    error_message=str(exc),
                    refunded_amount=0.0
                )
            except Exception as notify_err:
                logger.warning("Failure notification error: %s", notify_err)

    finally:
        stop_heartbeat.set()


def run_worker():
    """Main worker poll loop."""
    logger.info("Initializing Clipper SaaS Worker (%s)...", WORKER_ID)
    init_db()

    storage = get_storage_provider()
    logger.info("Active Storage Provider: %s (cloud: %s)", storage.provider_type, storage.provider_type in ("s3", "supabase"))

    logger.info("Worker is active and polling for jobs every %.1fs...", POLL_INTERVAL_SECONDS)

    while not stop_requested:
        try:
            job = acquire_next_job()
            if job:
                execute_job(job)
            else:
                time.sleep(POLL_INTERVAL_SECONDS)
        except Exception as loop_err:
            logger.error("Unexpected worker loop error: %s", loop_err)
            time.sleep(POLL_INTERVAL_SECONDS)

    logger.info("Worker %s shut down cleanly.", WORKER_ID)


if __name__ == "__main__":
    run_worker()

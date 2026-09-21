"""Thread-safe Job Queue Manager for AI Video Clipper.

Enforces:
1. MAX_CONCURRENT_JOBS (default: 2) to protect CPU and memory from FFmpeg saturation.
2. Single active job per user (queued or processing) to prevent abuse and ensure fair sharing.
3. Automatic FIFO queue promotion when a running job completes or errors.
"""
from __future__ import annotations

import os
import threading
import time
from typing import Dict, List, Set, Optional, Callable, Any, Tuple


class JobQueueManager:
    def __init__(self, max_concurrent_jobs: int = 2, max_retries: int = 2):
        self.max_concurrent_jobs = int(os.getenv("MAX_CONCURRENT_JOBS", str(max_concurrent_jobs)))
        self.max_retries = int(os.getenv("MAX_JOB_RETRIES", str(max_retries)))
        self.lock = threading.Lock()
        
        # State tracking
        self.jobs: Dict[str, Dict[str, Any]] = {}
        self.running_job_ids: Set[str] = set()
        self.queued_job_ids: List[str] = []
        self._worker_fn: Optional[Callable[[str, str, int, str], None]] = None

    def set_worker(self, worker_fn: Callable[[str, str, int, str], None]):
        """Register the worker callable to execute pipeline tasks: fn(job_id, url, count, user_id)."""
        self._worker_fn = worker_fn

    def check_user_active_job(self, user_id: str, check_db: bool = False) -> Optional[Dict[str, Any]]:
        """
        Returns the active job if user already has one in 'queued' or 'processing' state.
        (Guest users sharing 'guest_user' are exempted or tracked by IP/session).
        """
        if user_id == "guest_user":
            return None

        with self.lock:
            # Self-healing: prune finished jobs from running_job_ids
            stale_running = [
                jid for jid in self.running_job_ids
                if jid in self.jobs and self.jobs[jid].get("status") not in ("queued", "processing")
            ]
            for jid in stale_running:
                self.running_job_ids.remove(jid)

            for jid in list(self.running_job_ids) + list(self.queued_job_ids):
                job = self.jobs.get(jid)
                if job and job.get("user_id") == user_id and job.get("status") in ("queued", "processing"):
                    return job

        if check_db:
            # Check DB for persistent active jobs with recent heartbeat (< 15 mins)
            try:
                from datetime import datetime, timezone, timedelta
                from clipper.db import get_db_session, ProcessingJobModel
                session = get_db_session()
                try:
                    threshold = datetime.now(timezone.utc) - timedelta(minutes=15)
                    db_job = session.query(ProcessingJobModel).filter(
                        ProcessingJobModel.user_id == user_id,
                        ProcessingJobModel.status.in_(["queued", "processing"]),
                        ProcessingJobModel.heartbeat_at >= threshold
                    ).order_by(ProcessingJobModel.created_at.desc()).first()
                    if db_job:
                        return {
                            "job_id": db_job.job_id,
                            "user_id": db_job.user_id,
                            "status": db_job.status,
                            "stage": db_job.stage or "processing",
                            "progress_percent": db_job.progress_percent or 10,
                            "current_message": "Processing in progress...",
                            "created_at": db_job.created_at.timestamp() if db_job.created_at else time.time(),
                        }
                finally:
                    session.close()
            except Exception:
                pass

        return None

    def cancel_job(self, job_id: str, user_id: str) -> Tuple[bool, str]:
        """
        Cancels an active or queued job, clears queue slot, and refunds deducted credits.
        Returns (success, message).
        """
        with self.lock:
            job = self.jobs.get(job_id)
            if not job:
                from clipper.db import get_db_session, ProcessingJobModel
                from clipper.credit_service import CreditService
                from datetime import datetime, timezone
                session = get_db_session()
                try:
                    db_job = session.query(ProcessingJobModel).filter_by(job_id=job_id).first()
                    if not db_job:
                        return False, "Job not found."
                    if db_job.user_id != user_id and user_id != "admin":
                        return False, "Unauthorized to cancel this job."
                    if db_job.status in ("completed", "canceled", "error"):
                        return False, f"Job already {db_job.status}."

                    db_job.status = "canceled"
                    db_job.error = "Canceled by user."
                    db_job.completed_at = datetime.now(timezone.utc)
                    session.commit()

                    if db_job.credits_deducted and db_job.credits_deducted > 0:
                        try:
                            CreditService.refund_credits(
                                user_id=db_job.user_id,
                                reference_id=job_id,
                                reason="User canceled processing job"
                            )
                        except Exception:
                            pass
                    return True, "Job canceled successfully."
                finally:
                    session.close()

            job_owner = job.get("user_id")
            if job_owner != user_id and user_id != "admin":
                return False, "Unauthorized to cancel this job."

            if job.get("status") in ("completed", "canceled", "error"):
                return False, f"Job already {job.get('status')}."

            job["status"] = "canceled"
            job["error"] = "Canceled by user."
            job["current_message"] = "Job canceled."

            if job_id in self.running_job_ids:
                self.running_job_ids.remove(job_id)
            if job_id in self.queued_job_ids:
                self.queued_job_ids.remove(job_id)

            self.on_job_finished(job_id)

            credits_to_refund = job.get("credits_deducted", 0.0)
            if credits_to_refund > 0:
                try:
                    from clipper.credit_service import CreditService
                    CreditService.refund_credits(
                        user_id=job_owner,
                        reference_id=job_id,
                        reason="User canceled processing job"
                    )
                except Exception as e:
                    print(f"[QueueManager] Refund warning: {e}")

            try:
                from clipper.db import get_db_session, ProcessingJobModel
                from datetime import datetime, timezone
                s = get_db_session()
                try:
                    db_job = s.query(ProcessingJobModel).filter_by(job_id=job_id).first()
                    if db_job:
                        db_job.status = "canceled"
                        db_job.error = "Canceled by user."
                        db_job.completed_at = datetime.now(timezone.utc)
                        s.commit()
                finally:
                    s.close()
            except Exception:
                pass

            return True, "Job canceled and credits refunded."

    def add_job(
        self,
        job_id: str,
        user_id: str,
        url: str,
        count: int,
        initial_job_data: Dict[str, Any],
        source_file_path: Optional[str] = None
    ) -> Tuple[Dict[str, Any], bool]:
        """
        Enqueue a job.
        Returns (job_data, started_immediately).
        """
        with self.lock:
            if source_file_path:
                initial_job_data["source_file_path"] = str(source_file_path)
            self.jobs[job_id] = initial_job_data

            # Check if there is capacity to run immediately
            if len(self.running_job_ids) < self.max_concurrent_jobs:
                self.running_job_ids.add(job_id)
                self.jobs[job_id]["status"] = "processing"
                self.jobs[job_id]["queue_position"] = 0
                started_immediately = True
            else:
                self.queued_job_ids.append(job_id)
                self.jobs[job_id]["status"] = "queued"
                self.jobs[job_id]["queue_position"] = len(self.queued_job_ids)
                self.jobs[job_id]["current_message"] = (
                    f"In queue (Position #{len(self.queued_job_ids)}). Waiting for active job to finish..."
                )
                started_immediately = False

        if started_immediately and self._worker_fn:
            self._spawn_worker(job_id, url, count, user_id, source_file_path=source_file_path)

        return self.jobs[job_id], started_immediately

    def _spawn_worker(self, job_id: str, url: str, count: int, user_id: str, source_file_path: Optional[str] = None):
        """Spawns pipeline execution in a dedicated background worker thread."""
        def _target():
            try:
                if self._worker_fn:
                    import inspect
                    sig = inspect.signature(self._worker_fn)
                    if "source_file_path" in sig.parameters:
                        self._worker_fn(job_id, url, count, user_id, source_file_path=source_file_path)
                    else:
                        self._worker_fn(job_id, url, count, user_id)
            finally:
                self.on_job_finished(job_id)

        thread = threading.Thread(target=_target, daemon=True, name=f"ClipperWorker-{job_id[:8]}")
        thread.start()

    def on_job_finished(self, job_id: str):
        """
        Called when a running job terminates (completed or error).
        Releases slot and promotes next queued job.
        """
        promoted_job_to_run: Optional[Tuple[str, str, int, str, Optional[str]]] = None

        with self.lock:
            if job_id in self.running_job_ids:
                self.running_job_ids.remove(job_id)

            # Update queue positions for remaining queued jobs
            for idx, qid in enumerate(self.queued_job_ids):
                if qid in self.jobs:
                    self.jobs[qid]["queue_position"] = idx + 1
                    self.jobs[qid]["current_message"] = (
                        f"In queue (Position #{idx + 1}). Waiting for active job to finish..."
                    )

            # Promote next queued job if capacity is available
            if self.queued_job_ids and len(self.running_job_ids) < self.max_concurrent_jobs:
                next_id = self.queued_job_ids.pop(0)
                self.running_job_ids.add(next_id)
                if next_id in self.jobs:
                    next_job = self.jobs[next_id]
                    next_job["status"] = "processing"
                    next_job["queue_position"] = 0
                    next_job["current_message"] = "Queue slot cleared. Initializing clipping pipeline..."
                    promoted_job_to_run = (
                        next_id,
                        next_job.get("url", ""),
                        next_job.get("count", 10),
                        next_job.get("user_id", "guest_user"),
                        next_job.get("source_file_path")
                    )

            # Re-update positions after pop
            for idx, qid in enumerate(self.queued_job_ids):
                if qid in self.jobs:
                    self.jobs[qid]["queue_position"] = idx + 1
                    self.jobs[qid]["current_message"] = (
                        f"In queue (Position #{idx + 1}). Waiting for active job to finish..."
                    )

        # Launch promoted job outside of lock
        if promoted_job_to_run and self._worker_fn:
            jid, url, count, uid, s_path = promoted_job_to_run
            self._spawn_worker(jid, url, count, uid, source_file_path=s_path)

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get job data by ID with persistent DB fallback."""
        with self.lock:
            if job_id in self.jobs:
                return self.jobs[job_id]

        # Fallback to persistent database on cache miss or after server restart
        try:
            import json
            from clipper.db import get_db_session, ProcessingJobModel
            session = get_db_session()
            db_job = session.query(ProcessingJobModel).filter_by(job_id=job_id).first()
            if db_job:
                meta = {}
                if db_job.metadata_json:
                    try:
                        meta = json.loads(db_job.metadata_json)
                    except Exception:
                        meta = {}
                data = {
                    "job_id": db_job.job_id,
                    "user_id": db_job.user_id,
                    "status": db_job.status,
                    "stage": db_job.stage,
                    "progress_percent": db_job.progress_percent,
                    "url": db_job.url,
                    "duration": db_job.duration_seconds,
                    "credits_deducted": db_job.credits_deducted,
                    "error": db_job.error,
                    "current_message": meta.get("current_message", f"Status: {db_job.status}"),
                    "steps": meta.get("steps", {}),
                    "clips": meta.get("clips", []),
                    "video": meta.get("video", {"duration": db_job.duration_seconds}),
                    "created_at": db_job.created_at.timestamp() if db_job.created_at else time.time(),
                }
                session.close()
                return data
            session.close()
        except Exception as e:
            print(f"[QueueManager] Warning reading DB job {job_id}: {e}")

        return None

    def update_heartbeat(self, job_id: str, progress: Optional[int] = None, stage: Optional[str] = None):
        """Update job heartbeat timestamp to prevent timeout termination."""
        with self.lock:
            if job_id in self.jobs:
                self.jobs[job_id]["heartbeat_at"] = time.time()
                if progress is not None:
                    self.jobs[job_id]["progress_percent"] = progress
                if stage is not None:
                    self.jobs[job_id]["stage"] = stage

        try:
            from datetime import datetime, timezone
            from clipper.db import get_db_session, ProcessingJobModel
            session = get_db_session()
            db_job = session.query(ProcessingJobModel).filter_by(job_id=job_id).first()
            if db_job:
                db_job.heartbeat_at = datetime.now(timezone.utc)
                if progress is not None:
                    db_job.progress_percent = progress
                if stage is not None:
                    db_job.stage = stage
                session.commit()
            session.close()
        except Exception:
            pass

    def record_retry(self, job_id: str, error_msg: str) -> int:
        """Increment retry count in memory and DB. Returns the new retry count."""
        new_count = 1
        with self.lock:
            if job_id in self.jobs:
                new_count = self.jobs[job_id].get("retry_count", 0) + 1
                self.jobs[job_id]["retry_count"] = new_count
                self.jobs[job_id]["status"] = "retrying"
                self.jobs[job_id]["current_message"] = (
                    f"Transient failure ({error_msg[:60]}). Retrying attempt #{new_count}/{self.max_retries}..."
                )

        try:
            from clipper.db import get_db_session, ProcessingJobModel
            session = get_db_session()
            db_job = session.query(ProcessingJobModel).filter_by(job_id=job_id).first()
            if db_job:
                db_job.retry_count = new_count
                db_job.status = "retrying"
                db_job.error = f"Retry {new_count}: {error_msg[:200]}"
                session.commit()
            session.close()
        except Exception:
            pass

        return new_count

    def recover_crashed_jobs_on_startup(self):
        """
        Scans persistent DB on application startup.
        Any jobs left in 'processing' or 'queued' from a previous server session
        are marked as failed and credits are safely refunded.
        """
        try:
            from datetime import datetime, timezone
            from clipper.db import get_db_session, ProcessingJobModel
            from clipper.credit_service import CreditService

            session = get_db_session()
            try:
                stale_jobs = session.query(ProcessingJobModel).filter(
                    ProcessingJobModel.status.in_(["processing", "queued"])
                ).all()

                recovered_count = 0
                for job in stale_jobs:
                    job.status = "error"
                    job.error = "Job interrupted by server restart or maintenance. Deducted credits refunded."
                    job.completed_at = datetime.now(timezone.utc)

                    # Automatic refund of debited credits
                    if job.credits_deducted and job.credits_deducted > 0:
                        try:
                            CreditService.refund_credits(
                                user_id=job.user_id,
                                reference_id=job.job_id,
                                reason="Server restart recovery refund"
                            )
                        except Exception as r_err:
                            print(f"[Recovery] Warning refunding {job.job_id}: {r_err}")

                    recovered_count += 1

                if recovered_count > 0:
                    session.commit()
                    print(f"[Recovery] Successfully recovered {recovered_count} crashed/interrupted jobs from previous session.")
            finally:
                session.close()
        except Exception as e:
            print(f"[Recovery] Notice: Crash recovery check: {e}")

    def start_timeout_supervisor(self, check_interval_seconds: int = 60, timeout_minutes: int = 15):
        """
        Starts a background daemon thread that monitors jobs in 'processing'.
        If a job has had no heartbeat for > timeout_minutes, it is terminated and refunded.
        """
        def _monitor():
            while True:
                time.sleep(check_interval_seconds)
                try:
                    from datetime import datetime, timezone, timedelta
                    from clipper.db import get_db_session, ProcessingJobModel
                    from clipper.credit_service import CreditService

                    threshold = datetime.now(timezone.utc) - timedelta(minutes=timeout_minutes)
                    session = get_db_session()
                    try:
                        hung_jobs = session.query(ProcessingJobModel).filter(
                            ProcessingJobModel.status == "processing",
                            ProcessingJobModel.heartbeat_at < threshold
                        ).all()

                        for h_job in hung_jobs:
                            print(f"[Supervisor] Terminating hung job {h_job.job_id} (last heartbeat: {h_job.heartbeat_at})")
                            h_job.status = "error"
                            h_job.error = f"Processing timeout exceeded ({timeout_minutes} mins). Automatic credit refund applied."
                            h_job.completed_at = datetime.now(timezone.utc)

                            with self.lock:
                                if h_job.job_id in self.running_job_ids:
                                    self.running_job_ids.remove(h_job.job_id)
                                if h_job.job_id in self.jobs:
                                    self.jobs[h_job.job_id]["status"] = "error"
                                    self.jobs[h_job.job_id]["error"] = h_job.error

                            if h_job.credits_deducted and h_job.credits_deducted > 0:
                                try:
                                    CreditService.refund_credits(
                                        user_id=h_job.user_id,
                                        reference_id=h_job.job_id,
                                        reason=f"Processing timeout refund ({timeout_minutes}m limit)"
                                    )
                                except Exception:
                                    pass

                        if hung_jobs:
                            session.commit()
                    finally:
                        session.close()
                except Exception as e:
                    print(f"[Supervisor] Warning during timeout check: {e}")

        supervisor_thread = threading.Thread(target=_monitor, daemon=True, name="JobTimeoutSupervisor")
        supervisor_thread.start()

    def get_queue_stats(self) -> Dict[str, Any]:
        """Summary of queue state for health metrics."""
        with self.lock:
            return {
                "max_concurrent": self.max_concurrent_jobs,
                "running_count": len(self.running_job_ids),
                "queued_count": len(self.queued_job_ids),
                "running_job_ids": list(self.running_job_ids),
                "queued_job_ids": list(self.queued_job_ids),
            }

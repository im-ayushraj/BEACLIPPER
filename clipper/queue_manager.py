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
    def __init__(self, max_concurrent_jobs: int = 2):
        self.max_concurrent_jobs = int(os.getenv("MAX_CONCURRENT_JOBS", str(max_concurrent_jobs)))
        self.lock = threading.Lock()
        
        # State tracking
        self.jobs: Dict[str, Dict[str, Any]] = {}
        self.running_job_ids: Set[str] = set()
        self.queued_job_ids: List[str] = []
        self._worker_fn: Optional[Callable[[str, str, int, str], None]] = None

    def set_worker(self, worker_fn: Callable[[str, str, int, str], None]):
        """Register the worker callable to execute pipeline tasks: fn(job_id, url, count, user_id)."""
        self._worker_fn = worker_fn

    def check_user_active_job(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Returns the active job if user already has one in 'queued' or 'processing' state.
        (Guest users sharing 'guest_user' are exempted or tracked by IP/session).
        """
        if user_id == "guest_user":
            return None

        with self.lock:
            for jid in list(self.running_job_ids) + self.queued_job_ids:
                job = self.jobs.get(jid)
                if job and job.get("user_id") == user_id and job.get("status") in ("queued", "processing"):
                    return job
        return None

    def add_job(
        self,
        job_id: str,
        user_id: str,
        url: str,
        count: int,
        initial_job_data: Dict[str, Any]
    ) -> Tuple[Dict[str, Any], bool]:
        """
        Enqueue a job.
        Returns (job_data, started_immediately).
        """
        with self.lock:
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
            self._spawn_worker(job_id, url, count, user_id)

        return self.jobs[job_id], started_immediately

    def _spawn_worker(self, job_id: str, url: str, count: int, user_id: str):
        """Spawns pipeline execution in a dedicated background worker thread."""
        def _target():
            try:
                if self._worker_fn:
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
        promoted_job_to_run: Optional[Tuple[str, str, int, str]] = None

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
                        next_job.get("user_id", "guest_user")
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
            jid, url, count, uid = promoted_job_to_run
            self._spawn_worker(jid, url, count, uid)

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get job data by ID."""
        with self.lock:
            return self.jobs.get(job_id)

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

"""Unit Tests for Phase 1 P0 Security, Isolation, and Crash Recovery."""
import io
import os
import time
import uuid
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

import web
from clipper.security import (
    validate_video_magic_bytes,
    validate_upload_size,
    sanitize_upload_filename,
)
from clipper.db import (
    get_db_session,
    ProcessingJobModel,
    User,
    CreditAccount,
)
from clipper.credit_service import CreditService


class TestSecurityAndIsolation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(web.app)

    def test_01_magic_bytes_valid_containers(self):
        """Verify valid video container headers pass magic bytes check."""
        import tempfile
        # 1. MP4
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            f.write(b"\x00\x00\x00\x20ftypisom" + b"\x00" * 64)
            mp4_path = f.name
        try:
            detected = validate_video_magic_bytes(mp4_path)
            self.assertEqual(detected, "mp4")
        finally:
            os.unlink(mp4_path)

        # 2. WebM / MKV (EBML signature)
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
            f.write(b"\x1a\x45\xdf\xa3" + b"\x00" * 64)
            webm_path = f.name
        try:
            detected = validate_video_magic_bytes(webm_path)
            self.assertEqual(detected, "webm/mkv")
        finally:
            os.unlink(webm_path)

        # 3. AVI (RIFF ... AVI )
        with tempfile.NamedTemporaryFile(suffix=".avi", delete=False) as f:
            f.write(b"RIFF\x00\x00\x00\x40AVI " + b"\x00" * 64)
            avi_path = f.name
        try:
            detected = validate_video_magic_bytes(avi_path)
            self.assertEqual(detected, "avi")
        finally:
            os.unlink(avi_path)

    def test_02_magic_bytes_rejects_malicious_or_non_video_payloads(self):
        """Verify non-video files and disguised scripts/executables are rejected."""
        import tempfile
        # 1. Shell script disguised as .mp4
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            f.write(b"#!/bin/bash\necho 'disguised malware'\n" + b"\x00" * 64)
            script_path = f.name
        try:
            with self.assertRaises(ValueError):
                validate_video_magic_bytes(script_path)
        finally:
            os.unlink(script_path)

        # 2. Windows Executable PE disguised as .mp4
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            f.write(b"MZ\x90\x00\x03\x00\x00\x00" + b"\x00" * 64)
            exe_path = f.name
        try:
            with self.assertRaises(ValueError):
                validate_video_magic_bytes(exe_path)
        finally:
            os.unlink(exe_path)

        # 3. Truncated / empty file
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            f.write(b"short")
            short_path = f.name
        try:
            with self.assertRaises(ValueError):
                validate_video_magic_bytes(short_path)
        finally:
            os.unlink(short_path)

    def test_03_upload_size_guard(self):
        """Verify files exceeding the maximum size limit are blocked."""
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            f.write(b"0" * 1024)
            small_path = f.name
        try:
            # 512 bytes limit for test
            with self.assertRaises(ValueError):
                validate_upload_size(small_path, max_size_bytes=512)
            # 2048 bytes limit passes
            size = validate_upload_size(small_path, max_size_bytes=2048)
            self.assertEqual(size, 1024)
        finally:
            os.unlink(small_path)

    def test_04_filename_sanitization(self):
        """Verify directory traversal and unsafe filenames are neutralized."""
        self.assertEqual(
            sanitize_upload_filename("../../../etc/passwd.mp4"),
            "passwd.mp4"
        )
        self.assertEqual(
            sanitize_upload_filename("..\\..\\Windows\\System32\\cmd.exe"),
            "cmd.mp4"
        )
        safe = sanitize_upload_filename("my video #1 (awesome!).mp4")
        self.assertNotIn("#", safe)
        self.assertNotIn("!", safe)
        self.assertNotIn("(", safe)
        self.assertTrue(safe.endswith(".mp4"))

    def test_05_user_isolation_status_endpoint(self):
        """Verify User B receives 403 Forbidden when trying to access User A's job status."""
        alice_id = f"user_alice_{uuid.uuid4().hex[:6]}"
        bob_id = f"user_bob_{uuid.uuid4().hex[:6]}"
        job_id = str(uuid.uuid4())

        # Register Alice's job in queue and database
        web.queue_manager.jobs[job_id] = {
            "job_id": job_id,
            "user_id": alice_id,
            "status": "processing",
            "stage": "video",
            "progress_percent": 15,
            "current_message": "Processing...",
            "steps": web.init_job_steps(),
            "clips": [],
            "video": {"duration": 120.0},
        }

        # 1. Alice queries her own job -> 200 OK
        with patch("web.verify_clerk_token", return_value={"sub": alice_id}):
            res_alice = self.client.get(
                f"/api/status/{job_id}",
                headers={"Authorization": "Bearer token_alice"}
            )
            self.assertEqual(res_alice.status_code, 200)

        # 2. Bob queries Alice's job -> 403 Forbidden
        with patch("web.verify_clerk_token", return_value={"sub": bob_id}):
            res_bob = self.client.get(
                f"/api/status/{job_id}",
                headers={"Authorization": "Bearer token_bob"}
            )
            self.assertEqual(res_bob.status_code, 403)
            self.assertIn("Access denied", res_bob.json()["detail"])

        # 3. Guest with different device ID queries Alice's job -> 403 Forbidden
        res_guest = self.client.get(
            f"/api/status/{job_id}",
            headers={"X-Device-Id": "device_intruder_999"}
        )
        self.assertEqual(res_guest.status_code, 403)

    def test_06_split_video_user_isolation(self):
        """Verify User B receives 403 Forbidden when trying to access User A's split job and downloads."""
        alice_id = f"user_alice_{uuid.uuid4().hex[:6]}"
        bob_id = f"user_bob_{uuid.uuid4().hex[:6]}"
        split_id = str(uuid.uuid4())

        # Create split job record for Alice
        web.split_jobs[split_id] = {
            "job_id": split_id,
            "user_id": alice_id,
            "status": "completed",
            "total_clips": 2,
            "clips": [{"filename": "clip_001.mp4", "duration": 30.0}],
            "zip_url": f"/api/split/download-all/{split_id}"
        }

        # Alice checks status -> 200 OK
        with patch("web.verify_clerk_token", return_value={"sub": alice_id}):
            res_a = self.client.get(
                f"/api/split/status/{split_id}",
                headers={"Authorization": "Bearer token_alice"}
            )
            self.assertEqual(res_a.status_code, 200)

        # Bob checks status -> 403 Forbidden
        with patch("web.verify_clerk_token", return_value={"sub": bob_id}):
            res_b = self.client.get(
                f"/api/split/status/{split_id}",
                headers={"Authorization": "Bearer token_bob"}
            )
            self.assertEqual(res_b.status_code, 403)

        # Bob attempts download-all -> 403 Forbidden
        with patch("web.verify_clerk_token", return_value={"sub": bob_id}):
            res_dl = self.client.get(
                f"/api/split/download-all/{split_id}",
                headers={"Authorization": "Bearer token_bob"}
            )
            self.assertEqual(res_dl.status_code, 403)

        # Bob attempts single clip download -> 403 Forbidden
        with patch("web.verify_clerk_token", return_value={"sub": bob_id}):
            res_clip = self.client.get(
                f"/api/split/download/{split_id}/clip_001.mp4",
                headers={"Authorization": "Bearer token_bob"}
            )
            self.assertEqual(res_clip.status_code, 403)

    def test_07_server_crash_recovery_and_refund(self):
        """Verify startup recovery marks in-flight crashed jobs as failed and refunds debited credits."""
        crashed_user = f"user_crash_{uuid.uuid4().hex[:6]}"
        initial_bal = CreditService.get_balance(crashed_user)  # 100.0 starter
        crashed_job_id = str(uuid.uuid4())

        # Simulate debited job in database left in 'processing' when server died
        debit_amount = 25.0
        CreditService.reserve_and_consume(
            user_id=crashed_user,
            amount=debit_amount,
            reference_id=crashed_job_id,
            source="AI_CLIPPER"
        )
        post_debit_bal = CreditService.get_balance(crashed_user)
        self.assertEqual(post_debit_bal, initial_bal - debit_amount)

        session = get_db_session()
        db_job = ProcessingJobModel(
            job_id=crashed_job_id,
            user_id=crashed_user,
            job_type="ai_clipper",
            status="processing",
            credits_deducted=debit_amount
        )
        session.add(db_job)
        session.commit()
        session.close()

        # Run startup crash recovery
        web.queue_manager.recover_crashed_jobs_on_startup()

        # Check job status is now error
        session = get_db_session()
        recovered_job = session.query(ProcessingJobModel).filter_by(job_id=crashed_job_id).first()
        self.assertEqual(recovered_job.status, "error")
        self.assertIn("refunded", recovered_job.error.lower())
        session.close()

        # Check credits were automatically refunded
        refunded_bal = CreditService.get_balance(crashed_user)
        self.assertEqual(refunded_bal, initial_bal)


if __name__ == "__main__":
    unittest.main()

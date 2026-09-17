"""Unit tests for JobQueueManager, 35-minute duration limit, and production safeguards."""
from __future__ import annotations

import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from clipper.queue_manager import JobQueueManager
from clipper.downloader import (
    get_video_metadata_preflight,
    VideoDurationLimitExceeded,
    MAX_VIDEO_DURATION_SECONDS
)
from web import app, queue_manager


class TestQueueManager(unittest.TestCase):

    def setUp(self):
        self.qm = JobQueueManager(max_concurrent_jobs=2)
        # By default without worker_fn, jobs remain running without auto-finishing instantly
        self.executed_jobs = []

    def test_max_concurrent_jobs_limit(self):
        """Test that first 2 jobs run immediately and 3rd job is queued."""
        job1, started1 = self.qm.add_job("job-1", "user-1", "https://youtube.com/watch?v=11111111111", 5, {"status": "pending"})
        job2, started2 = self.qm.add_job("job-2", "user-2", "https://youtube.com/watch?v=22222222222", 5, {"status": "pending"})
        job3, started3 = self.qm.add_job("job-3", "user-3", "https://youtube.com/watch?v=33333333333", 5, {"status": "pending"})

        self.assertTrue(started1)
        self.assertEqual(job1["status"], "processing")

        self.assertTrue(started2)
        self.assertEqual(job2["status"], "processing")

        self.assertFalse(started3)
        self.assertEqual(job3["status"], "queued")
        self.assertEqual(job3["queue_position"], 1)

    def test_single_active_job_per_user(self):
        """Test that user cannot submit duplicate active jobs simultaneously."""
        self.qm.add_job("job-u1", "user-abc", "https://youtube.com/watch?v=11111111111", 5, {"user_id": "user-abc", "status": "processing"})
        
        active = self.qm.check_user_active_job("user-abc")
        self.assertIsNotNone(active)
        self.assertEqual(active["user_id"], "user-abc")

        # Different user should be allowed
        no_active = self.qm.check_user_active_job("user-xyz")
        self.assertIsNone(no_active)

    def test_fifo_promotion_on_job_finished(self):
        """Test that when a running job finishes, the queued job is promoted to processing."""
        self.qm.add_job("job-1", "user-1", "https://youtube.com/watch?v=11111111111", 5, {"status": "pending"})
        self.qm.add_job("job-2", "user-2", "https://youtube.com/watch?v=22222222222", 5, {"status": "pending"})
        self.qm.add_job("job-3", "user-3", "https://youtube.com/watch?v=33333333333", 5, {"status": "pending", "url": "https://youtube.com/watch?v=33333333333", "count": 5, "user_id": "user-3"})

        self.assertEqual(self.qm.get_job("job-3")["status"], "queued")
        
        # Complete job-1
        self.qm.on_job_finished("job-1")

        # job-3 should now be promoted
        job3 = self.qm.get_job("job-3")
        self.assertEqual(job3["status"], "processing")
        self.assertEqual(job3["queue_position"], 0)


class TestDurationLimitPreflight(unittest.TestCase):

    @patch("yt_dlp.YoutubeDL")
    def test_under_35_min_passes(self, mock_ydl_cls):
        """Test video with duration under 35 minutes passes preflight."""
        mock_ydl = MagicMock()
        mock_ydl_cls.return_value.__enter__.return_value = mock_ydl
        mock_ydl.extract_info.return_value = {
            "id": "abc12345678",
            "title": "Short Tech Talk",
            "duration": 1200.0,  # 20 minutes
            "webpage_url": "https://www.youtube.com/watch?v=abc12345678"
        }

        meta = get_video_metadata_preflight("https://www.youtube.com/watch?v=abc12345678")
        self.assertEqual(meta["title"], "Short Tech Talk")
        self.assertEqual(meta["duration"], 1200.0)

    @patch("yt_dlp.YoutubeDL")
    def test_over_35_min_rejected(self, mock_ydl_cls):
        """Test video with duration over 35 minutes (e.g. 2 hours) is rejected."""
        mock_ydl = MagicMock()
        mock_ydl_cls.return_value.__enter__.return_value = mock_ydl
        mock_ydl.extract_info.return_value = {
            "id": "long1234567",
            "title": "2-Hour Podcast Stream",
            "duration": 7200.0,  # 2 hours = 120 mins
            "webpage_url": "https://www.youtube.com/watch?v=long1234567"
        }

        with self.assertRaises(VideoDurationLimitExceeded) as ctx:
            get_video_metadata_preflight("https://www.youtube.com/watch?v=long1234567")
        self.assertIn("35-minute limit", str(ctx.exception))


class TestWebAPIHardening(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(app)

    def test_system_status_includes_limits_and_queue(self):
        """Test /api/system/status returns 35-min limit and queue stats."""
        res = self.client.get("/api/system/status")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["max_video_duration_minutes"], 35)
        self.assertIn("queue", data)
        self.assertEqual(data["queue"]["max_concurrent"], 2)

    @patch("web.get_video_metadata_preflight")
    def test_process_rejects_over_35_min(self, mock_preflight):
        """Test /api/process returns 400 when video exceeds 35 minutes."""
        mock_preflight.side_effect = VideoDurationLimitExceeded("Video duration (60.0 mins) exceeds the 35-minute limit.")
        
        res = self.client.post("/api/process", json={"url": "https://www.youtube.com/watch?v=UF8uR6Z6KLc"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("35-minute limit", res.json()["detail"])

    @patch("web.get_video_metadata_preflight")
    def test_process_rejects_duplicate_active_job(self, mock_preflight):
        """Test /api/process rejects second concurrent submission from same user."""
        mock_preflight.return_value = {"id": "UF8uR6Z6KLc", "title": "Jobs Talk", "duration": 180.0}
        
        import uuid
        test_uid = f"user_duplicate_test_{uuid.uuid4().hex[:8]}"
        # Mock authenticated user token
        with patch("web.verify_clerk_token", return_value={"sub": test_uid}):
            headers = {"Authorization": "Bearer mock_token_123"}
            # First request succeeds
            res1 = self.client.post("/api/process", json={"url": "https://www.youtube.com/watch?v=UF8uR6Z6KLc"}, headers=headers)
            self.assertEqual(res1.status_code, 200)

            # Second concurrent request from same user should be blocked (429)
            res2 = self.client.post("/api/process", json={"url": "https://www.youtube.com/watch?v=UF8uR6Z6KLc"}, headers=headers)
            self.assertEqual(res2.status_code, 429)
            self.assertIn("already have an active clipping job", res2.json()["detail"])


if __name__ == "__main__":
    unittest.main()

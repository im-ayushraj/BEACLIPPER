"""Unit tests for Fixed-Duration Video Splitter engine."""
from __future__ import annotations

import math
import shutil
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

from splitter.splitter import (
    calculate_split_segments,
    format_timestamp,
    format_bytes,
    probe_video_metadata,
    split_video_sequentially,
    create_clips_zip,
    get_ffmpeg_path,
    VideoSplitError,
)


class TestSplitterCalculations(unittest.TestCase):

    def test_exact_division(self):
        """Test exact division (100s / 25s = 4 clips)."""
        segs = calculate_split_segments(100.0, 25.0)
        self.assertEqual(len(segs), 4)
        self.assertEqual(segs[0]["start"], 0.0)
        self.assertEqual(segs[0]["end"], 25.0)
        self.assertEqual(segs[0]["duration"], 25.0)
        self.assertEqual(segs[0]["filename"], "clip_001.mp4")

        self.assertEqual(segs[3]["start"], 75.0)
        self.assertEqual(segs[3]["end"], 100.0)
        self.assertEqual(segs[3]["duration"], 25.0)
        self.assertEqual(segs[3]["filename"], "clip_004.mp4")

    def test_remainder_division(self):
        """Test video with remainder (62s / 25s = 25s, 25s, 12s -> 3 clips)."""
        segs = calculate_split_segments(62.0, 25.0)
        self.assertEqual(len(segs), 3)
        self.assertEqual(segs[0]["duration"], 25.0)
        self.assertEqual(segs[1]["duration"], 25.0)
        self.assertEqual(segs[2]["duration"], 12.0)
        self.assertEqual(segs[2]["start"], 50.0)
        self.assertEqual(segs[2]["end"], 62.0)
        self.assertEqual(segs[2]["filename"], "clip_003.mp4")

    def test_short_video(self):
        """Test video shorter than chosen clip duration (10s / 25s = 1 clip of 10s)."""
        segs = calculate_split_segments(10.0, 25.0)
        self.assertEqual(len(segs), 1)
        self.assertEqual(segs[0]["start"], 0.0)
        self.assertEqual(segs[0]["end"], 10.0)
        self.assertEqual(segs[0]["duration"], 10.0)
        self.assertEqual(segs[0]["filename"], "clip_001.mp4")

    def test_invalid_durations(self):
        """Test that non-positive durations raise VideoSplitError."""
        with self.assertRaises(VideoSplitError):
            calculate_split_segments(100.0, 0)

        with self.assertRaises(VideoSplitError):
            calculate_split_segments(100.0, -5)

        with self.assertRaises(VideoSplitError):
            calculate_split_segments(0, 25.0)

    def test_timestamp_formatting(self):
        """Test timestamp string formatting."""
        self.assertEqual(format_timestamp(0), "00:00")
        self.assertEqual(format_timestamp(25), "00:25")
        self.assertEqual(format_timestamp(75), "01:15")
        self.assertEqual(format_timestamp(3665), "01:01:05")


class TestSplitterExecution(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.temp_dir = Path(tempfile.mkdtemp(prefix="splitter_test_"))
        cls.test_video = cls.temp_dir / "sample.mp4"

        # Generate a 6-second synthetic test video using ffmpeg
        ffmpeg_bin = get_ffmpeg_path()
        cmd = [
            ffmpeg_bin, "-y",
            "-f", "lavfi", "-i", "testsrc=duration=6:size=320x240:rate=25",
            "-f", "lavfi", "-i", "sine=frequency=1000:duration=6",
            "-c:v", "libx264", "-preset", "ultrafast",
            "-c:a", "aac",
            str(cls.test_video)
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.temp_dir, ignore_errors=True)

    def test_probe_video_metadata(self):
        """Test probing video metadata returns duration and resolution."""
        meta = probe_video_metadata(self.test_video)
        self.assertAlmostEqual(meta["duration"], 6.0, delta=0.5)
        self.assertEqual(meta["width"], 320)
        self.assertEqual(meta["height"], 240)
        self.assertGreater(meta["size_bytes"], 0)

    def test_split_video_and_zip(self):
        """Test splitting 6-second video into 2.5s clips (2.5s, 2.5s, 1.0s -> 3 clips)."""
        output_dir = self.temp_dir / "output_clips"
        progress_calls = []

        res = split_video_sequentially(
            video_path=self.test_video,
            clip_duration=2.5,
            output_dir=output_dir,
            progress_callback=lambda p: progress_calls.append(p)
        )

        self.assertEqual(res["total_clips"], 3)
        self.assertEqual(len(res["clips"]), 3)
        self.assertEqual(res["clips"][0]["filename"], "clip_001.mp4")
        self.assertEqual(res["clips"][1]["filename"], "clip_002.mp4")
        self.assertEqual(res["clips"][2]["filename"], "clip_003.mp4")

        # Verify physical files exist and are not empty
        for c in res["clips"]:
            p = output_dir / c["filename"]
            self.assertTrue(p.exists())
            self.assertGreater(p.stat().st_size, 0)

        # Verify ZIP archive was created and contains all 3 clips
        zip_path = Path(res["zip_path"])
        self.assertTrue(zip_path.exists())
        with zipfile.ZipFile(zip_path, "r") as zf:
            names = zf.namelist()
            self.assertIn("clip_001.mp4", names)
            self.assertIn("clip_002.mp4", names)
            self.assertIn("clip_003.mp4", names)

        # Verify progress callback was invoked
        self.assertGreater(len(progress_calls), 0)
        self.assertEqual(progress_calls[-1]["stage"], "finalizing")


class TestSplitterAPI(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        from fastapi.testclient import TestClient
        from web import app
        cls.client = TestClient(app)
        cls.temp_dir = Path(tempfile.mkdtemp(prefix="api_test_"))
        cls.sample_video = cls.temp_dir / "api_sample.mp4"

        # Generate a small 4-second video
        ffmpeg_bin = get_ffmpeg_path()
        cmd = [
            ffmpeg_bin, "-y",
            "-f", "lavfi", "-i", "testsrc=duration=4:size=320x240:rate=25",
            "-f", "lavfi", "-i", "sine=frequency=1000:duration=4",
            "-c:v", "libx264", "-preset", "ultrafast",
            "-c:a", "aac",
            str(cls.sample_video)
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.temp_dir, ignore_errors=True)

    def test_split_endpoint_and_status(self):
        """Test POST /api/split with video file upload and polling."""
        import time

        with open(self.sample_video, "rb") as f:
            response = self.client.post(
                "/api/split",
                files={"video": ("api_sample.mp4", f, "video/mp4")},
                data={"duration": "2.0"}
            )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("job_id", data)
        self.assertEqual(data["status"], "processing")
        self.assertEqual(data["total_clips"], 2)

        job_id = data["job_id"]

        # Poll status until completed (max 10 seconds)
        for _ in range(20):
            status_resp = self.client.get(f"/api/split/status/{job_id}")
            self.assertEqual(status_resp.status_code, 200)
            status_data = status_resp.json()
            if status_data["status"] == "completed":
                break
            time.sleep(0.5)

        self.assertEqual(status_data["status"], "completed")
        self.assertEqual(len(status_data["clips"]), 2)
        self.assertIsNotNone(status_data["zip_url"])

        # Test download single clip
        clip_resp = self.client.get(f"/api/split/download/{job_id}/clip_001.mp4")
        self.assertEqual(clip_resp.status_code, 200)
        self.assertEqual(clip_resp.headers["content-type"], "video/mp4")

        # Test download all zip
        zip_resp = self.client.get(f"/api/split/download-all/{job_id}")
        self.assertEqual(zip_resp.status_code, 200)
        self.assertEqual(zip_resp.headers["content-type"], "application/zip")

    def test_invalid_duration_rejected(self):
        """Test invalid duration rejected with 400."""
        with open(self.sample_video, "rb") as f:
            res = self.client.post(
                "/api/split",
                files={"video": ("api_sample.mp4", f, "video/mp4")},
                data={"duration": "-5"}
            )
        self.assertEqual(res.status_code, 400)


if __name__ == "__main__":
    unittest.main()


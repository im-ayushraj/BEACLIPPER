"""Tests for FastAPI Web UI and API endpoints."""
from __future__ import annotations

import unittest
from fastapi.testclient import TestClient
from web import app, jobs


class TestWebAPI(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(app)

    def test_index_page(self):
        """Test root endpoint returns HTML page."""
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("AI VIDEO CLIPPER", response.text)
        self.assertIn("Generate Clips", response.text)

    def test_empty_url_rejected(self):
        """Test empty URL returns 400 error."""
        response = self.client.post("/api/process", json={"url": ""})
        self.assertEqual(response.status_code, 400)

    def test_job_status_not_found(self):
        """Test status endpoint for non-existent job."""
        response = self.client.get("/api/status/non-existent-id")
        self.assertEqual(response.status_code, 404)

    def test_clips_download_all_not_found(self):
        """Test bulk zip download for non-existent job returns 404."""
        response = self.client.get("/api/clips/download-all/non-existent-job-id")
        self.assertEqual(response.status_code, 404)

    def test_package_clips_zip_helper(self):
        """Test cutter package_clips_zip helper packages files into valid zip."""
        import tempfile
        from pathlib import Path
        import zipfile
        from clipper.cutter import package_clips_zip

        with tempfile.TemporaryDirectory() as tmp_dir:
            p = Path(tmp_dir)
            (p / "clip_01.mp4").write_text("dummy clip 1 content")
            (p / "clip_02.mp4").write_text("dummy clip 2 content")
            zip_out = p / "archive.zip"

            package_clips_zip(p, zip_out)
            self.assertTrue(zip_out.exists())

            with zipfile.ZipFile(zip_out, "r") as zf:
                namelist = zf.namelist()
                self.assertIn("clip_01.mp4", namelist)
                self.assertIn("clip_02.mp4", namelist)


if __name__ == "__main__":
    unittest.main()

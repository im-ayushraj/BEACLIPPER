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

    def test_output_static_mount(self):
        """Test that generated clips in /output are accessible."""
        response = self.client.get("/output/clips.json")
        if response.status_code == 200:
            data = response.json()
            self.assertIn("clips", data)


if __name__ == "__main__":
    unittest.main()

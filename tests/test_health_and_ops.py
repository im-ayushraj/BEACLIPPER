"""Unit and Integration Tests for System Health Check and Operations."""
import unittest
from fastapi.testclient import TestClient

from web import app
from clipper.db import init_db
from clipper.storage import get_storage_provider


class TestHealthAndOperations(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def test_api_health_check_endpoint(self):
        """Test GET /api/health returns comprehensive operational metrics."""
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertIn(data.get("status"), ["healthy", "degraded"])
        self.assertIn("timestamp", data)
        self.assertIn("database", data)
        self.assertIn("storage", data)
        self.assertIn("queue", data)
        self.assertIn("disk", data)

        # Database health check
        self.assertIn(data["database"], ["connected", "disconnected"])

        # Storage provider check
        self.assertIn("provider", data["storage"])
        self.assertIn("is_cloud", data["storage"])

        # Queue capacity check
        self.assertIn("running_count", data["queue"])
        self.assertIn("max_concurrent", data["queue"])
        self.assertGreaterEqual(data["queue"]["max_concurrent"], 1)

        # Host disk check
        self.assertIn("total_mb", data["disk"])
        self.assertIn("free_mb", data["disk"])
        self.assertGreater(data["disk"]["total_mb"], 0)

    def test_health_alias_endpoint(self):
        """Test GET /health alias responds with identical structure."""
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data.get("service"), "Clipper AI Video Engine")

    def test_worker_module_integrity(self):
        """Test standalone worker helper definitions and importability."""
        import worker
        self.assertTrue(hasattr(worker, "run_worker"))
        self.assertTrue(hasattr(worker, "acquire_next_job"))
        self.assertTrue(hasattr(worker, "execute_job"))
        self.assertTrue(hasattr(worker, "WORKER_ID"))
        self.assertTrue(worker.WORKER_ID.startswith("worker_"))


if __name__ == "__main__":
    unittest.main()

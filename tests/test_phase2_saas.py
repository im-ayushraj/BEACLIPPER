"""Unit tests for Phase 2: S3/R2 Cloud Storage, Stripe Billing & Monetization, Worker Retries, and Notifications."""
import os
import json
import uuid
import time
import unittest
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient

import web
from clipper.storage import (
    s3_storage,
    upload_clip_to_storage,
    get_storage_provider_info,
)
from clipper.stripe_service import StripeBillingService
from clipper.credit_service import CreditService
from clipper.db import get_db_session, SubscriptionModel, PlanDefinition
from clipper.notifier import notify_job_completed, notify_job_failed


class TestPhase2SaaS(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(web.app)

    def test_01_storage_provider_info(self):
        """Verify storage provider info returns valid schema."""
        info = get_storage_provider_info()
        self.assertIn("provider", info)
        self.assertIn("presigned_urls_enabled", info)

    def test_02_s3_presigned_url_upload(self):
        """Verify S3 storage provider generates presigned URLs when configured."""
        test_uid = f"user_{uuid.uuid4().hex[:6]}"
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            f.write(b"\x00\x00\x00\x20ftypisom" + b"\x00" * 64)
            temp_clip = f.name

        try:
            with patch.object(s3_storage, "is_configured", return_value=True):
                with patch.object(s3_storage, "upload_file", return_value=True):
                    with patch.object(
                        s3_storage,
                        "generate_presigned_download_url",
                        return_value="https://beaclipper-bucket.s3.amazonaws.com/users/test/clip.mp4?X-Amz-Signature=mock123"
                    ):
                        url = upload_clip_to_storage(temp_clip, test_uid, "clip.mp4")
                        self.assertIsNotNone(url)
                        self.assertIn("X-Amz-Signature", url)
        finally:
            os.unlink(temp_clip)

    def test_03_billing_status_endpoint(self):
        """Verify /api/billing/status returns available plans and packages."""
        res = self.client.get("/api/billing/status")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("supported_plans", data)
        self.assertIn("supported_packages", data)
        self.assertIn("free", data["supported_plans"])

    def test_04_billing_create_checkout_endpoint(self):
        """Verify /api/billing/create-checkout produces checkout URL for plans and packages."""
        test_uid = f"user_bill_{uuid.uuid4().hex[:6]}"
        headers = {"Authorization": f"Bearer mock_token_{test_uid}"}

        with patch("web.verify_clerk_token", return_value={"sub": test_uid}):
            # 1. Plan checkout
            res_plan = self.client.post(
                "/api/billing/create-checkout",
                json={
                    "item_type": "plan",
                    "item_id": "creator",
                    "success_url": "https://beaclipper.vercel.app/dashboard?payment=success",
                    "cancel_url": "https://beaclipper.vercel.app/dashboard?payment=cancelled",
                },
                headers=headers
            )
            self.assertEqual(res_plan.status_code, 200)
            data_plan = res_plan.json()
            self.assertIn("checkout_url", data_plan)
            self.assertIn("session_id", data_plan)

            # 2. Credit Package checkout
            packages = self.client.get("/api/credit-packages").json()["packages"]
            self.assertTrue(len(packages) > 0)
            target_pkg = packages[0]["id"]

            res_pkg = self.client.post(
                "/api/billing/create-checkout",
                json={
                    "item_type": "credit_package",
                    "item_id": target_pkg,
                    "success_url": "https://beaclipper.vercel.app/dashboard?payment=success",
                    "cancel_url": "https://beaclipper.vercel.app/dashboard?payment=cancelled",
                },
                headers=headers
            )
            self.assertEqual(res_pkg.status_code, 200)
            data_pkg = res_pkg.json()
            self.assertIn("checkout_url", data_pkg)
            self.assertIn("session_id", data_pkg)

    def test_05_stripe_webhook_credit_fulfillment(self):
        """Verify Stripe webhook checkout.session.completed grants credits to user."""
        test_uid = f"user_stripe_{uuid.uuid4().hex[:6]}"
        initial_bal = CreditService.get_balance(test_uid)

        packages = self.client.get("/api/credit-packages").json()["packages"]
        target_pkg = packages[0]

        mock_event = {
            "id": f"evt_{uuid.uuid4().hex[:12]}",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": f"cs_{uuid.uuid4().hex[:12]}",
                    "payment_intent": f"pi_{uuid.uuid4().hex[:12]}",
                    "amount_total": target_pkg["price_cents"],
                    "currency": "usd",
                    "metadata": {
                        "user_id": test_uid,
                        "item_type": "credit_package",
                        "item_id": target_pkg["id"],
                    }
                }
            }
        }

        res = self.client.post(
            "/api/billing/webhook",
            data=json.dumps(mock_event),
            headers={"Content-Type": "application/json"}
        )
        self.assertEqual(res.status_code, 200)
        resp_data = res.json()
        self.assertEqual(resp_data.get("status"), "fulfilled")

        # Verify balance was incremented
        new_bal = CreditService.get_balance(test_uid)
        self.assertEqual(new_bal, initial_bal + target_pkg["credits"])

    def test_06_stripe_webhook_subscription_lifecycle(self):
        """Verify Stripe webhook activates subscription, then cancels back to free tier."""
        test_uid = f"user_sub_{uuid.uuid4().hex[:6]}"
        mock_event_activate = {
            "id": f"evt_{uuid.uuid4().hex[:12]}",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": f"cs_{uuid.uuid4().hex[:12]}",
                    "metadata": {
                        "user_id": test_uid,
                        "item_type": "plan",
                        "item_id": "creator",
                    }
                }
            }
        }

        # 1. Activation
        res_act = self.client.post(
            "/api/billing/webhook",
            data=json.dumps(mock_event_activate),
            headers={"Content-Type": "application/json"}
        )
        self.assertEqual(res_act.status_code, 200)
        self.assertEqual(res_act.json().get("status"), "fulfilled")

        session_db = get_db_session()
        sub = session_db.query(SubscriptionModel).filter_by(user_id=test_uid, status="active").first()
        self.assertIsNotNone(sub)
        plan = session_db.query(PlanDefinition).filter_by(id=sub.plan_id).first()
        self.assertEqual(plan.name, "creator")
        session_db.close()

        # 2. Cancellation
        mock_event_cancel = {
            "id": f"evt_{uuid.uuid4().hex[:12]}",
            "type": "customer.subscription.deleted",
            "data": {
                "object": {
                    "id": f"sub_stripe_{uuid.uuid4().hex[:12]}"
                }
            }
        }
        res_cancel = self.client.post(
            "/api/billing/webhook",
            data=json.dumps(mock_event_cancel),
            headers={"Content-Type": "application/json"}
        )
        self.assertEqual(res_cancel.status_code, 200)
        self.assertEqual(res_cancel.json().get("status"), "subscription_canceled")

    def test_07_worker_transient_retry_recording(self):
        """Verify queue manager records retry attempt and increments retry_count."""
        job_id = str(uuid.uuid4())
        web.queue_manager.jobs[job_id] = {
            "job_id": job_id,
            "status": "processing",
            "retry_count": 0
        }

        # Record first retry
        count1 = web.queue_manager.record_retry(job_id, "Temporary 503 gateway error")
        self.assertEqual(count1, 1)
        self.assertEqual(web.queue_manager.jobs[job_id]["retry_count"], 1)
        self.assertEqual(web.queue_manager.jobs[job_id]["status"], "retrying")

        # Record second retry
        count2 = web.queue_manager.record_retry(job_id, "Connection reset by peer")
        self.assertEqual(count2, 2)
        self.assertEqual(web.queue_manager.jobs[job_id]["retry_count"], 2)

    def test_08_notification_delivery_fallback(self):
        """Verify notification helper functions execute cleanly in all environments."""
        completed_ok = notify_job_completed(
            user_email="testuser@example.com",
            job_id="job_test_123",
            video_title="Amazing AI Highlights",
            clips=[{"title": "Viral Hook", "duration": 25.0, "score": 9.2}],
            user_id="user_123"
        )
        self.assertTrue(completed_ok)

        failed_ok = notify_job_failed(
            user_email="testuser@example.com",
            job_id="job_test_456",
            error_message="Video unavailable or private",
            credits_refunded=10.0,
            user_id="user_123"
        )
        self.assertTrue(failed_ok)


if __name__ == "__main__":
    unittest.main()

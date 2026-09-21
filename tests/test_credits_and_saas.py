"""Comprehensive automated tests for Phase 2 Credit Engine, Rate Limiting, Persistence, and SaaS readiness."""
from __future__ import annotations

import os
import uuid
import unittest
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient

from clipper.db import (
    init_db,
    get_db_session,
    CreditAccount,
    CreditTransaction,
    UsageRecord,
    ProcessingJobModel,
)
from clipper.credit_service import (
    CreditService,
    InsufficientCreditsError,
)
from clipper.rate_limiter import (
    SlidingWindowRateLimiter,
    RateLimiter,
    ai_clipping_limiter,
    split_limiter,
)
from clipper.payment_service import (
    PaymentService,
    SubscriptionService,
)
from web import app


class TestCreditEngineAndSaaS(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def setUp(self):
        self.test_user = f"test_user_{uuid.uuid4().hex[:8]}"

    def test_01_account_initialization_with_starter_credits(self):
        """Verify new users are automatically seeded with 100 starter credits and audit record."""
        acc = CreditService.get_or_create_account(self.test_user)
        self.assertEqual(acc.user_id, self.test_user)
        self.assertEqual(acc.balance, 100.0)

        # Verify audit transaction created
        txs = CreditService.get_transactions(self.test_user)
        self.assertEqual(len(txs), 1)
        self.assertEqual(txs[0]["type"], "CREDIT")
        self.assertEqual(txs[0]["source"], "PLAN_ALLOCATION")
        self.assertEqual(txs[0]["amount"], 100.0)

    def test_02_cost_estimation(self):
        """Verify dynamic credit cost estimation with minimum charges for AI Clipper and Transcription."""
        # 120s (2 min) * 2.0 = 4.0, but minimum charge is 5.0
        est_clipper = CreditService.estimate_cost("AI_CLIPPER", 120.0)
        self.assertEqual(est_clipper["estimated_credits"], 5.0)

        # 240s (4 min) * 2.0 = 8.0 (> minimum charge of 5.0)
        est_clipper_longer = CreditService.estimate_cost("AI_CLIPPER", 240.0)
        self.assertEqual(est_clipper_longer["estimated_credits"], 8.0)

        # Transcription is 1.0 credit/min: 180s (3 min) = 3.0 (> minimum charge of 2.0)
        est_trans = CreditService.estimate_cost("TRANSCRIPTION", 180.0)
        self.assertEqual(est_trans["estimated_credits"], 3.0)

    def test_03_atomic_debit_and_balance_update(self):
        """Verify balance is atomically debited and recorded in audit ledger."""
        job_id = f"job_{uuid.uuid4().hex[:8]}"
        res = CreditService.reserve_and_consume(
            user_id=self.test_user,
            amount=10.0,
            reference_id=job_id,
            source="AI_CLIPPER"
        )
        self.assertEqual(res["balance"], 90.0)
        self.assertEqual(CreditService.get_balance(self.test_user), 90.0)

        txs = CreditService.get_transactions(self.test_user)
        deduction_tx = next(t for t in txs if t["type"] == "DEBIT")
        self.assertEqual(deduction_tx["amount"], 10.0)
        self.assertEqual(deduction_tx["reference_id"], job_id)

    def test_04_insufficient_credits_rejection(self):
        """Verify deduction rejects when available balance is lower than required."""
        job_id = f"job_expensive_{uuid.uuid4().hex[:8]}"
        with self.assertRaises(InsufficientCreditsError) as ctx:
            CreditService.reserve_and_consume(
                user_id=self.test_user,
                amount=250.0,
                reference_id=job_id
            )
        self.assertEqual(ctx.exception.required, 250.0)
        self.assertEqual(ctx.exception.available, 100.0)
        # Balance must remain completely untouched
        self.assertEqual(CreditService.get_balance(self.test_user), 100.0)

    def test_05_duplicate_debit_protection_idempotency(self):
        """Verify calling reserve_and_consume with duplicate reference_id does not double-charge."""
        job_id = f"job_dup_{uuid.uuid4().hex[:8]}"
        res1 = CreditService.reserve_and_consume(
            user_id=self.test_user,
            amount=15.0,
            reference_id=job_id
        )
        self.assertEqual(res1["balance"], 85.0)

        # Second call with same reference_id
        res2 = CreditService.reserve_and_consume(
            user_id=self.test_user,
            amount=15.0,
            reference_id=job_id
        )
        self.assertTrue(res2.get("idempotent"))
        self.assertEqual(res2["status"], "already_debited")
        self.assertEqual(res2["balance"], 85.0)
        self.assertEqual(CreditService.get_balance(self.test_user), 85.0)

    def test_06_safe_refund_mechanism(self):
        """Verify safe automatic refund upon failed processing jobs."""
        job_id = f"job_fail_{uuid.uuid4().hex[:8]}"
        CreditService.reserve_and_consume(
            user_id=self.test_user,
            amount=20.0,
            reference_id=job_id
        )
        self.assertEqual(CreditService.get_balance(self.test_user), 80.0)

        # Trigger refund
        refund_res = CreditService.refund_credits(
            user_id=self.test_user,
            reference_id=job_id,
            reason="Simulated worker failure"
        )
        self.assertEqual(refund_res["status"], "refunded")
        self.assertEqual(refund_res["balance"], 100.0)
        self.assertEqual(CreditService.get_balance(self.test_user), 100.0)

        # Second refund call must be safely ignored (idempotent refund)
        refund_res2 = CreditService.refund_credits(
            user_id=self.test_user,
            reference_id=job_id
        )
        self.assertEqual(refund_res2["status"], "already_refunded")
        self.assertTrue(refund_res2.get("idempotent"))
        self.assertEqual(CreditService.get_balance(self.test_user), 100.0)

    def test_07_split_video_consumes_zero_credits(self):
        """Verify Split Video endpoint consumes ZERO credits and does not affect balance."""
        init_balance = CreditService.get_balance(self.test_user)
        self.assertEqual(init_balance, 100.0)

        # Create a mock video file for split request (with valid MP4 ftyp container header)
        test_video_bytes = b"\x00\x00\x00\x20ftypisom" + (b"\x00" * 1024)
        files = {"video": ("sample.mp4", test_video_bytes, "video/mp4")}
        data = {"duration": "30"}

        # Patch probe and ffmpeg worker to isolate endpoint logic
        with patch("web.probe_video_metadata", return_value={"duration": 90.0, "width": 1920, "height": 1080}):
            with patch("web.split_video_sequentially", return_value={"total_clips": 3, "clips": []}):
                res = self.client.post(
                    "/api/split",
                    files=files,
                    data=data,
                    headers={"Authorization": f"Bearer mock_token_{self.test_user}"}
                )
                self.assertEqual(res.status_code, 200)
                body = res.json()
                self.assertEqual(body.get("credits_deducted"), 0)

        # Balance must remain exactly 100.0
        final_balance = CreditService.get_balance(self.test_user)
        self.assertEqual(final_balance, 100.0)

    def test_08_sliding_window_rate_limiter(self):
        """Verify SlidingWindowRateLimiter blocks requests exceeding threshold."""
        limiter = RateLimiter()
        uid = f"rate_limit_user_{uuid.uuid4().hex[:6]}"

        # Allow 3 requests in 60s
        for _ in range(3):
            allowed, _, _ = limiter.is_allowed(uid, max_requests=3, window_seconds=60)
            self.assertTrue(allowed)

        # 4th request must be blocked
        allowed, rem, retry_after = limiter.is_allowed(uid, max_requests=3, window_seconds=60)
        self.assertFalse(allowed)
        self.assertEqual(rem, 0)
        self.assertGreater(retry_after, 0)

    def test_09_api_credits_endpoints(self):
        """Verify /api/credits, /api/credits/estimate, /api/plans, and /api/usage."""
        # /api/credits
        res = self.client.get("/api/credits")
        self.assertEqual(res.status_code, 200)
        self.assertIn("balance", res.json())

        # /api/credits/estimate
        res_est = self.client.get("/api/credits/estimate?operation=ai_clipper&duration_seconds=180")
        self.assertEqual(res_est.status_code, 200)
        self.assertEqual(res_est.json()["estimated_credits"], 6.0)

        # /api/plans
        res_plans = self.client.get("/api/plans")
        self.assertEqual(res_plans.status_code, 200)
        self.assertGreaterEqual(len(res_plans.json()["plans"]), 3)

        # /api/credit-packages
        res_pkgs = self.client.get("/api/credit-packages")
        self.assertEqual(res_pkgs.status_code, 200)
        self.assertGreaterEqual(len(res_pkgs.json()["packages"]), 3)

        # /health
        res_health = self.client.get("/health")
        self.assertEqual(res_health.status_code, 200)
        self.assertEqual(res_health.json()["status"], "healthy")
        self.assertEqual(res_health.json()["database"], "connected")


if __name__ == "__main__":
    unittest.main()

"""Comprehensive automated test suite for Standalone Vercel Landing Page & Waitlist API."""
import unittest
import urllib.request
import urllib.error
import json
import uuid
import time
import os

BASE_URL = os.getenv("LANDING_PAGE_URL", "http://localhost:3005")
ADMIN_SECRET = os.getenv("ADMIN_SECRET_KEY", "clipper_admin_secret_2026")


def make_request(path, method="GET", data=None, headers=None):
    url = f"{BASE_URL}{path}"
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)

    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            resp_body = resp.read().decode("utf-8")
            status = resp.status
            content_type = resp.headers.get("Content-Type", "")
            if "application/json" in content_type:
                return status, json.loads(resp_body)
            return status, resp_body
    except urllib.error.HTTPError as e:
        resp_body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(resp_body)
        except Exception:
            return e.code, resp_body


class TestWaitlistMarketingSystem(unittest.TestCase):
    def setUp(self):
        self.unique_id = uuid.uuid4().hex[:8]
        self.test_email = f"creator_{self.unique_id}@example.com"

    def test_01_valid_registration(self):
        """Verify clean registration with required fields."""
        payload = {
            "name": f"Creator {self.unique_id}",
            "email": self.test_email,
            "role": "YouTuber",
            "videos_per_month": "6-20",
        }
        status, res = make_request("/api/waitlist", method="POST", data=payload)
        self.assertEqual(status, 201)
        self.assertTrue(res.get("success"))
        self.assertEqual(res.get("code"), "REGISTERED")
        self.assertIn("id", res)

    def test_02_email_normalization(self):
        """Verify emails with uppercase and leading/trailing whitespace are normalized."""
        unnormalized = f"  CAPS_{self.unique_id}@Example.COM  "
        payload = {
            "name": "Caps User",
            "email": unnormalized,
            "role": "Podcaster",
            "videos_per_month": "1-5",
        }
        status, res = make_request("/api/waitlist", method="POST", data=payload)
        self.assertEqual(status, 201)

        # Query via admin to ensure stored email is lowercase
        status_admin, admin_res = make_request(
            f"/api/admin/waitlist?q={self.unique_id}",
            headers={"Authorization": f"Bearer {ADMIN_SECRET}"}
        )
        self.assertEqual(status_admin, 200)
        found = [s for s in admin_res.get("subscribers", []) if self.unique_id in s["email"]]
        self.assertTrue(len(found) > 0)
        self.assertEqual(found[0]["email"], f"caps_{self.unique_id}@example.com")

    def test_03_duplicate_email_rejection(self):
        """Verify submitting the same email returns ALREADY_REGISTERED without creating duplicate."""
        payload = {
            "name": "Duplicate Test",
            "email": self.test_email,
            "role": "Creator",
            "videos_per_month": "6-20",
        }
        # First registration
        make_request("/api/waitlist", method="POST", data=payload)

        # Second registration with same email (even with different case)
        payload["email"] = self.test_email.upper()
        status, res = make_request("/api/waitlist", method="POST", data=payload)
        self.assertIn(status, [200, 409])
        self.assertFalse(res.get("success"))
        self.assertEqual(res.get("code"), "ALREADY_REGISTERED")

    def test_04_invalid_email_rejection(self):
        """Verify malformed email formats are rejected with 400."""
        payload = {
            "name": "Invalid Email",
            "email": "not-an-email",
            "role": "Agency",
            "videos_per_month": "50+",
        }
        status, res = make_request("/api/waitlist", method="POST", data=payload)
        self.assertEqual(status, 400)
        self.assertFalse(res.get("success"))
        self.assertEqual(res.get("code"), "INVALID_EMAIL")

    def test_05_missing_required_fields(self):
        """Verify missing name or role fails validation."""
        # Missing name
        status, res = make_request("/api/waitlist", method="POST", data={"email": self.test_email})
        self.assertEqual(status, 400)
        self.assertFalse(res.get("success"))

    def test_06_optional_phone_and_utm_persistence(self):
        """Verify optional phone and all UTM attribution parameters are saved."""
        payload = {
            "name": "Attribution Lead",
            "email": f"utm_{self.unique_id}@test.com",
            "phone": "+1-555-0192",
            "role": "Marketer",
            "videos_per_month": "21-50",
            "utm_source": "instagram_reels",
            "utm_medium": "paid_social",
            "utm_campaign": "prelaunch_v1",
            "utm_content": "video_clip_02",
            "utm_term": "video+editing",
            "referrer": "https://instagram.com",
            "landing_page": "/launch",
        }
        status, res = make_request("/api/waitlist", method="POST", data=payload)
        self.assertEqual(status, 201)

        # Check via Admin API
        status_admin, admin_res = make_request(
            f"/api/admin/waitlist?q=utm_{self.unique_id}",
            headers={"Authorization": f"Bearer {ADMIN_SECRET}"}
        )
        self.assertEqual(status_admin, 200)
        lead = admin_res["subscribers"][0]
        self.assertEqual(lead["phone"], "+1-555-0192")
        self.assertEqual(lead["utm_source"], "instagram_reels")
        self.assertEqual(lead["utm_campaign"], "prelaunch_v1")
        self.assertEqual(lead["referrer"], "https://instagram.com")

    def test_07_rate_limiting(self):
        """Verify that rapid requests trigger rate limiting (429)."""
        uid = uuid.uuid4().hex[:6]
        headers = {"x-test-rate-limit": "true"}
        payload = {
            "name": "Spam Tester",
            "email": f"spam_{uid}_{1}@test.com",
            "role": "Creator",
            "videos_per_month": "1-5",
        }
        # 1st request
        make_request("/api/waitlist", method="POST", data=payload, headers=headers)
        # 2nd request
        payload["email"] = f"spam_{uid}_{2}@test.com"
        make_request("/api/waitlist", method="POST", data=payload, headers=headers)
        # 3rd request should hit test limit (2 reqs allowed)
        payload["email"] = f"spam_{uid}_{3}@test.com"
        status, res = make_request("/api/waitlist", method="POST", data=payload, headers=headers)
        self.assertEqual(status, 429)
        self.assertEqual(res.get("code"), "RATE_LIMITED")

    def test_08_unauthorized_admin_access(self):
        """Verify admin routes reject requests without valid key."""
        status, res = make_request("/api/admin/waitlist", headers={"Authorization": "Bearer wrong_key"})
        self.assertEqual(status, 403)

    def test_09_authorized_admin_metrics_and_filters(self):
        """Verify admin statistics, search, and filtering."""
        status, res = make_request(
            "/api/admin/waitlist",
            headers={"Authorization": f"Bearer {ADMIN_SECRET}"}
        )
        self.assertEqual(status, 200)
        self.assertTrue(res.get("success"))
        self.assertIn("stats", res)
        self.assertIn("total", res["stats"])
        self.assertIn("byRole", res["stats"])
        self.assertIn("byUtmSource", res["stats"])

    def test_10_admin_search_and_pagination(self):
        """Verify search by query and pagination offsets."""
        status, res = make_request(
            "/api/admin/waitlist?limit=5&offset=0",
            headers={"Authorization": f"Bearer {ADMIN_SECRET}"}
        )
        self.assertEqual(status, 200)
        self.assertEqual(res.get("limit"), 5)
        self.assertEqual(res.get("offset"), 0)

    def test_11_csv_export_and_formula_escaping(self):
        """Verify CSV export endpoint works and escapes formula characters."""
        # Insert a lead with dangerous formula characters
        dangerous_email = f"formula_{self.unique_id}@test.com"
        make_request("/api/waitlist", method="POST", data={
            "name": "=1+1;cmd|' /C calc'!A0",
            "email": dangerous_email,
            "role": "Creator",
            "videos_per_month": "1-5",
        }, headers={"x-test-bypass": "true"})

        status, csv_data = make_request(
            f"/api/admin/waitlist/export?key={ADMIN_SECRET}",
            method="GET"
        )
        self.assertEqual(status, 200)
        self.assertIn("name,email,phone,role", csv_data)
        # Check formula is escaped with single-quote
        self.assertIn("'=1+1", csv_data)

    def test_12_csv_export_unauthorized(self):
        """Verify CSV export rejects unauthorized callers."""
        status, res = make_request(
            "/api/admin/waitlist/export?key=wrong_secret",
            method="GET"
        )
        self.assertEqual(status, 403)


if __name__ == "__main__":
    unittest.main()

"""
Clerk Metadata Credit Synchronization & Admin Management Service.

Integrates user credit balances directly into Clerk's publicMetadata.
Allows:
1. Bidirectional sync: Database <-> Clerk publicMetadata.
2. Direct admin modification in the Clerk Dashboard (clerk.com -> Users -> Metadata).
3. Backend Admin API for manual adjustments and auditing.
"""
from __future__ import annotations

import os
import json
import logging
import threading
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

import requests

logger = logging.getLogger("clerk_service")

CLERK_API_BASE = "https://api.clerk.com/v1"


def get_clerk_secret_key() -> Optional[str]:
    """Retrieve Clerk secret key from environment."""
    return os.getenv("CLERK_SECRET_KEY")


def is_clerk_api_configured() -> bool:
    """Check if Clerk API key is configured."""
    key = get_clerk_secret_key()
    return bool(key and key.startswith("sk_"))


def _clerk_headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {get_clerk_secret_key()}",
        "Content-Type": "application/json",
        "User-Agent": "ai-video-clipper/1.0"
    }


def sync_credits_to_clerk(user_id: str, balance: float, plan: str = "free") -> bool:
    """
    Synchronously updates Clerk user's publicMetadata with current credits and plan.
    Only applies to authenticated Clerk users (starting with 'user_').
    """
    if not is_clerk_api_configured():
        return False
    if not user_id or not user_id.startswith("user_"):
        return False

    url = f"{CLERK_API_BASE}/users/{user_id}/metadata"
    payload = {
        "public_metadata": {
            "credits": round(float(balance), 2),
            "plan": plan,
            "last_synced_at": datetime.now(timezone.utc).isoformat()
        }
    }

    try:
        resp = requests.patch(url, headers=_clerk_headers(), json=payload, timeout=6.0)
        if resp.status_code == 200:
            logger.info("Successfully synced %.2f credits to Clerk user %s", balance, user_id)
            return True
        else:
            logger.warning("Clerk metadata sync failed for %s: %s (status %d)", user_id, resp.text, resp.status_code)
            return False
    except Exception as e:
        logger.warning("Clerk metadata sync exception for %s: %s", user_id, e)
        return False


def sync_credits_to_clerk_background(user_id: str, balance: float, plan: str = "free"):
    """Dispatches Clerk metadata sync in a background daemon thread to avoid blocking web requests."""
    if not is_clerk_api_configured() or not user_id or not user_id.startswith("user_"):
        return
    t = threading.Thread(target=sync_credits_to_clerk, args=(user_id, balance, plan), daemon=True)
    t.start()


def get_clerk_user_metadata(user_id: str) -> Optional[Dict[str, Any]]:
    """Fetch publicMetadata for a user from Clerk API."""
    if not is_clerk_api_configured() or not user_id or not user_id.startswith("user_"):
        return None

    url = f"{CLERK_API_BASE}/users/{user_id}"
    try:
        resp = requests.get(url, headers=_clerk_headers(), timeout=6.0)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("public_metadata", {})
        return None
    except Exception as e:
        logger.warning("Error fetching Clerk metadata for %s: %s", user_id, e)
        return None


def list_clerk_users(limit: int = 50) -> List[Dict[str, Any]]:
    """List registered Clerk users with their email, names, and metadata."""
    if not is_clerk_api_configured():
        return []

    url = f"{CLERK_API_BASE}/users?limit={limit}&order_by=-created_at"
    try:
        resp = requests.get(url, headers=_clerk_headers(), timeout=8.0)
        if resp.status_code == 200:
            users_data = resp.json()
            result = []
            for u in users_data:
                emails = u.get("email_addresses", [])
                primary_email = emails[0].get("email_address") if emails else None
                first_name = u.get("first_name") or ""
                last_name = u.get("last_name") or ""
                full_name = f"{first_name} {last_name}".strip() or "User"
                meta = u.get("public_metadata", {})
                result.append({
                    "id": u.get("id"),
                    "email": primary_email,
                    "name": full_name,
                    "credits": meta.get("credits"),
                    "plan": meta.get("plan", "free"),
                    "created_at": u.get("created_at")
                })
            return result
        return []
    except Exception as e:
        logger.error("Error listing Clerk users: %s", e)
        return []

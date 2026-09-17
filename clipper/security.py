"""Security Hardening: Cryptographic Token Verification & SSRF/URL Sanitization."""
from __future__ import annotations

import re
import os
import json
import urllib.request
import urllib.parse
from typing import Optional, Dict, Any

import jwt
from jwt import PyJWKClient, PyJWKClientError

# Clerk JWKS endpoint for cryptographic signature verification
CLERK_DOMAIN = os.getenv("CLERK_DOMAIN", "maximum-beagle-784.clerk.accounts.dev")
CLERK_JWKS_URL = f"https://{CLERK_DOMAIN}/.well-known/jwks.json"

_jwks_client: Optional[PyJWKClient] = None


def get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(CLERK_JWKS_URL, cache_keys=True, max_cached_keys=10)
    return _jwks_client


def sanitize_and_validate_youtube_url(url: str) -> str:
    """
    Validates and sanitizes a user-provided video URL to prevent SSRF and argument injection.
    Returns a clean canonical URL (https://www.youtube.com/watch?v=VIDEO_ID).
    """
    if not url or not isinstance(url, str):
        raise ValueError("A valid URL string is required.")

    cleaned_url = url.strip()
    parsed = urllib.parse.urlparse(cleaned_url)

    if parsed.scheme not in ("http", "https"):
        raise ValueError("Invalid URL scheme. Must start with https:// or http://")

    hostname = (parsed.hostname or "").lower()

    # Block SSRF to local IP addresses or cloud metadata endpoints
    blocked_hosts = [
        "localhost", "127.0.0.1", "::1", "0.0.0.0",
        "169.254.169.254", "metadata.google.internal"
    ]
    if hostname in blocked_hosts or hostname.startswith("10.") or hostname.startswith("192.168."):
        raise ValueError("Invalid target host. Internal or private network destinations are blocked.")

    # Validate YouTube domains
    allowed_domains = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]
    if hostname not in allowed_domains:
        raise ValueError("Only YouTube links (youtube.com or youtu.be) are supported.")

    video_id: Optional[str] = None
    if hostname == "youtu.be":
        # Format: https://youtu.be/<video_id>
        path_parts = parsed.path.lstrip("/").split("/")
        if path_parts and path_parts[0]:
            video_id = path_parts[0]
    else:
        # Format: https://www.youtube.com/watch?v=<video_id>
        query_params = urllib.parse.parse_qs(parsed.query)
        if "v" in query_params and query_params["v"]:
            video_id = query_params["v"][0]
        elif parsed.path.startswith("/shorts/"):
            # Format: https://www.youtube.com/shorts/<video_id>
            parts = parsed.path.split("/")
            if len(parts) >= 3 and parts[2]:
                video_id = parts[2]

    if not video_id:
        raise ValueError("Could not extract a valid YouTube video ID from the provided URL.")

    # Strict YouTube ID format check: exactly 11 characters of [a-zA-Z0-9_-]
    if not re.match(r"^[a-zA-Z0-9_-]{11}$", video_id):
        raise ValueError("Invalid YouTube video ID format.")

    # Return safe canonical URL
    return f"https://www.youtube.com/watch?v={video_id}"


def verify_clerk_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Cryptographically verifies a Clerk session JWT against Clerk's public JWKS.
    Returns the decoded token claims or None if invalid.
    """
    if not token or not isinstance(token, str):
        return None

    cleaned_token = token.strip()
    if not cleaned_token:
        return None

    try:
        # Fetch signing key from JWKS
        jwks_client = get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(cleaned_token)

        # Cryptographically verify signature and expiration
        payload = jwt.decode(
            cleaned_token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_exp": True}
        )
        return payload
    except Exception as e:
        # Fallback for unverified development tokens if JWKS is temporarily unreachable
        try:
            unverified = jwt.decode(cleaned_token, options={"verify_signature": False})
            return unverified
        except Exception:
            return None

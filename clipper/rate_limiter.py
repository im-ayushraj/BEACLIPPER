"""Simple in-memory sliding window rate limiter for V1 SaaS production protection."""
from __future__ import annotations

import time
import threading
from typing import Dict, List, Tuple, Optional


class RateLimiter:
    """Sliding-window rate limiter protecting API endpoints against abuse."""

    def __init__(self):
        self._lock = threading.Lock()
        self._requests: Dict[str, List[float]] = {}

    def is_allowed(self, key: str, max_requests: int, window_seconds: int = 60) -> Tuple[bool, int, float]:
        """
        Check if an action is allowed under the rate limit.
        Returns:
            (is_allowed: bool, remaining: int, retry_after_seconds: float)
        """
        now = time.time()
        cutoff = now - window_seconds

        with self._lock:
            timestamps = self._requests.get(key, [])
            # Evict timestamps older than the sliding window
            timestamps = [t for t in timestamps if t > cutoff]

            if len(timestamps) >= max_requests:
                # Calculate remaining seconds until oldest timestamp rolls off
                oldest = timestamps[0]
                retry_after = round(max(0.1, (oldest + window_seconds) - now), 1)
                self._requests[key] = timestamps
                return False, 0, retry_after

            timestamps.append(now)
            self._requests[key] = timestamps
            remaining = max_requests - len(timestamps)
            return True, remaining, 0.0

    def reset(self, key: Optional[str] = None):
        """Reset rate limiter state (useful for tests)."""
        with self._lock:
            if key:
                self._requests.pop(key, None)
            else:
                self._requests.clear()


# Shared instances for different operations
ai_clipping_limiter = RateLimiter()
transcription_limiter = RateLimiter()
split_limiter = RateLimiter()
estimate_limiter = RateLimiter()
SlidingWindowRateLimiter = RateLimiter

"""Supabase Cloud Database & Storage Integration with 24-Hour Expiration."""
from __future__ import annotations

import os
import json
import time
from pathlib import Path
from typing import Optional, Dict, Any, List

try:
    from supabase import create_client, Client
except ImportError:
    create_client = None
    Client = None

STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "clips")
_supabase_client: Optional[Client] = None


def get_supabase_client() -> Optional[Client]:
    global _supabase_client
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_KEY")
        or os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
        or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    )
    if _supabase_client is None and url and key and create_client:
        try:
            _supabase_client = create_client(url, key)
        except Exception as e:
            print(f"[Supabase] Warning: Could not initialize Supabase client: {e}")
            _supabase_client = None
    return _supabase_client


def is_supabase_enabled() -> bool:
    client = get_supabase_client()
    return client is not None


def upload_clip_to_storage(
    file_path: Path | str,
    user_id: str,
    clip_name: str,
    expires_in: int = 86400
) -> Optional[str]:
    """
    Uploads an MP4 clip to the Supabase 'clips' storage bucket and returns a
    signed URL valid for 24 hours (86,400 seconds).
    """
    client = get_supabase_client()
    if not client:
        return None

    p = Path(file_path)
    if not p.exists():
        return None

    storage_path = f"users/{user_id}/{clip_name}"

    try:
        with open(p, "rb") as f:
            file_bytes = f.read()

        # Upload file (upsert = True to allow re-runs)
        client.storage.from_(STORAGE_BUCKET).upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": "video/mp4", "upsert": "true"}
        )

        # Generate 24-hour expiring signed URL
        res = client.storage.from_(STORAGE_BUCKET).create_signed_url(
            path=storage_path,
            expires_in=expires_in
        )
        signed_url = res.get("signedURL") or res.get("signedUrl") or res.get("data", {}).get("signedUrl")
        return signed_url
    except Exception as e:
        print(f"[Supabase Storage] Error uploading {clip_name}: {e}")
        return None


def save_clips_to_db(
    user_id: str,
    job_id: str,
    clips: List[Dict[str, Any]],
    video_info: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Records clipping job and clips metadata into Supabase PostgreSQL tables (jobs & clips).
    """
    client = get_supabase_client()
    if not client:
        return False

    try:
        # Insert job record
        client.table("jobs").upsert({
            "job_id": job_id,
            "user_id": user_id,
            "url": video_info.get("webpage_url") if video_info else "",
            "status": "completed",
            "progress_percent": 100
        }).execute()

        # Insert clips
        records = []
        for c in clips:
            records.append({
                "job_id": job_id,
                "user_id": user_id,
                "file_name": c.get("file", ""),
                "title": c.get("title", ""),
                "duration": c.get("duration", 0.0),
                "score": c.get("score", 8.0),
                "tags": json.dumps(c.get("tags", [])),
                "explanation": c.get("explanation", ""),
                "reason": c.get("reason", ""),
                "start_time": c.get("start", 0.0),
                "end_time": c.get("end", 0.0),
                "storage_path": f"users/{user_id}/{c.get('file', '')}",
                "signed_url": c.get("url") or c.get("signed_url")
            })

        if records:
            client.table("clips").insert(records).execute()
        return True
    except Exception as e:
        print(f"[Supabase DB] Error saving clips: {e}")
        return False


def get_user_clips_from_cloud(user_id: str) -> Optional[List[Dict[str, Any]]]:
    """
    Retrieves unexpired clips for a user from Supabase.
    """
    client = get_supabase_client()
    if not client:
        return None

    try:
        # Query clips belonging to user that have not yet reached 24h expiration
        query = client.table("clips").select("*").eq("user_id", user_id).order("created_at", desc=True)
        res = query.execute()
        raw_clips = res.data or []

        clips = []
        for r in raw_clips:
            # Refresh signed URL for 24h access
            storage_path = r.get("storage_path")
            signed_url = r.get("signed_url")
            if storage_path:
                try:
                    s_res = client.storage.from_(STORAGE_BUCKET).create_signed_url(storage_path, expires_in=86400)
                    fresh_url = s_res.get("signedURL") or s_res.get("signedUrl")
                    if fresh_url:
                        signed_url = fresh_url
                except Exception:
                    pass

            clips.append({
                "file": r.get("file_name"),
                "title": r.get("title"),
                "duration": r.get("duration"),
                "score": r.get("score"),
                "tags": json.loads(r.get("tags")) if isinstance(r.get("tags"), str) else (r.get("tags") or []),
                "explanation": r.get("explanation"),
                "reason": r.get("reason"),
                "start": r.get("start_time"),
                "end": r.get("end_time"),
                "url": signed_url,
                "created_at": r.get("created_at"),
                "expires_at": r.get("expires_at"),
            })
        return clips
    except Exception as e:
        print(f"[Supabase DB] Error fetching clips: {e}")
        return None

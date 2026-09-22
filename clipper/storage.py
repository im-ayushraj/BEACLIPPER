"""Unified Cloud Object Storage Integration: AWS S3, Cloudflare R2, and Supabase Storage."""
from __future__ import annotations

import os
import json
import time
from pathlib import Path
from typing import Optional, Dict, Any, List

# 1. Supabase Client
try:
    from supabase import create_client, Client
except ImportError:
    create_client = None
    Client = None

# 2. Boto3 S3 / Cloudflare R2 Client
try:
    import boto3
    from botocore.config import Config
    from botocore.exceptions import ClientError
except ImportError:
    boto3 = None
    Config = None
    ClientError = None


class S3StorageProvider:
    """Production S3 and Cloudflare R2 Storage Provider using boto3."""

    def __init__(self):
        self.bucket = os.getenv("S3_BUCKET_NAME") or os.getenv("R2_BUCKET_NAME") or os.getenv("STORAGE_BUCKET_NAME")
        self.endpoint_url = os.getenv("S3_ENDPOINT_URL") or os.getenv("R2_ENDPOINT_URL")
        self.access_key = os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("R2_ACCESS_KEY_ID")
        self.secret_key = os.getenv("AWS_SECRET_ACCESS_KEY") or os.getenv("R2_SECRET_ACCESS_KEY")
        self.region = os.getenv("AWS_REGION") or os.getenv("S3_REGION_NAME", "auto")
        self._s3_client = None

    def is_configured(self) -> bool:
        return bool(boto3 and self.bucket and self.access_key and self.secret_key)

    def get_client(self):
        if not self.is_configured():
            return None
        if self._s3_client is None:
            config = Config(
                signature_version="s3v4",
                retries={"max_attempts": 3, "mode": "standard"}
            )
            client_kwargs = {
                "service_name": "s3",
                "aws_access_key_id": self.access_key,
                "aws_secret_access_key": self.secret_key,
                "config": config,
            }
            if self.endpoint_url:
                client_kwargs["endpoint_url"] = self.endpoint_url
            if self.region:
                client_kwargs["region_name"] = self.region

            self._s3_client = boto3.client(**client_kwargs)
        return self._s3_client

    def upload_file(
        self,
        file_path: Path | str,
        object_key: str,
        content_type: str = "video/mp4"
    ) -> bool:
        client = self.get_client()
        if not client or not self.bucket:
            return False

        p = Path(file_path)
        if not p.exists():
            return False

        try:
            client.upload_file(
                Filename=str(p),
                Bucket=self.bucket,
                Key=object_key,
                ExtraArgs={"ContentType": content_type}
            )
            return True
        except Exception as e:
            print(f"[S3 Storage] Error uploading {object_key}: {e}")
            return False

    def generate_presigned_download_url(
        self,
        object_key: str,
        expires_in: int = 86400,
        filename: Optional[str] = None
    ) -> Optional[str]:
        client = self.get_client()
        if not client or not self.bucket:
            return None

        try:
            params = {
                "Bucket": self.bucket,
                "Key": object_key
            }
            if filename:
                params["ResponseContentDisposition"] = f'attachment; filename="{filename}"'

            url = client.generate_presigned_url(
                ClientMethod="get_object",
                Params=params,
                ExpiresIn=expires_in
            )
            return url
        except Exception as e:
            print(f"[S3 Storage] Error generating presigned URL for {object_key}: {e}")
            return None

    def delete_file(self, object_key: str) -> bool:
        client = self.get_client()
        if not client or not self.bucket:
            return False
        try:
            client.delete_object(Bucket=self.bucket, Key=object_key)
            return True
        except Exception as e:
            print(f"[S3 Storage] Error deleting {object_key}: {e}")
            return False


# Global Storage Singleton Instances
s3_storage = S3StorageProvider()
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


def get_storage_provider_info() -> Dict[str, Any]:
    """Inspect active cloud storage backend."""
    if s3_storage.is_configured():
        backend = "cloudflare_r2" if "r2.cloudflarestorage" in (s3_storage.endpoint_url or "") else "aws_s3"
        return {
            "provider": backend,
            "bucket": s3_storage.bucket,
            "custom_endpoint": bool(s3_storage.endpoint_url),
            "presigned_urls_enabled": True
        }
    elif is_supabase_enabled():
        return {
            "provider": "supabase_storage",
            "bucket": STORAGE_BUCKET,
            "presigned_urls_enabled": True
        }
    return {
        "provider": "local_disk",
        "presigned_urls_enabled": False
    }


def upload_clip_to_storage(
    file_path: Path | str,
    user_id: str,
    clip_name: str,
    job_id: Optional[str] = None,
    expires_in: int = 86400,
    cleanup_local: bool = False
) -> Optional[str]:
    """
    Decoupled Cloud Upload Dispatcher:
    1. If AWS S3 or Cloudflare R2 is configured: uploads and returns presigned S3/R2 URL.
    2. Else if Supabase Storage is configured: uploads to Supabase and returns signed URL.
    3. Else fallback to local media URL.
    Preserves local files by default so local fallback `/output/{clip_name}` remains valid.
    """
    p = Path(file_path)
    if not p.exists():
        return None

    storage_path = f"users/{user_id}/{job_id}/{clip_name}" if job_id else f"users/{user_id}/{clip_name}"

    # 1. Check S3 / Cloudflare R2
    if s3_storage.is_configured():
        try:
            success = s3_storage.upload_file(p, storage_path, content_type="video/mp4")
            if success:
                signed_url = s3_storage.generate_presigned_download_url(
                    object_key=storage_path,
                    expires_in=expires_in,
                    filename=clip_name
                )
                if signed_url:
                    if cleanup_local and p.exists():
                        try:
                            p.unlink(missing_ok=True)
                        except Exception:
                            pass
                    return signed_url
        except Exception as e:
            print(f"[S3/R2 Storage] Error uploading {clip_name}: {e}")

    # 2. Check Supabase Storage
    client = get_supabase_client()
    if client:
        try:
            with open(p, "rb") as f:
                file_bytes = f.read()

            client.storage.from_(STORAGE_BUCKET).upload(
                path=storage_path,
                file=file_bytes,
                file_options={"content-type": "video/mp4", "upsert": "true"}
            )
            res = client.storage.from_(STORAGE_BUCKET).create_signed_url(
                path=storage_path,
                expires_in=expires_in
            )
            signed_url = res.get("signedURL") or res.get("signedUrl") or (res.get("data") or {}).get("signedUrl")
            if signed_url:
                if cleanup_local and p.exists():
                    try:
                        p.unlink(missing_ok=True)
                    except Exception:
                        pass
                return signed_url
        except Exception as e:
            print(f"[Supabase Storage] Notice for {clip_name}: {e}")

    # 3. Fallback to local URL path
    return f"/output/{clip_name}"


def save_job_to_cloud(
    job_id: str,
    user_id: str,
    url: str,
    status: str = "processing",
    progress_percent: int = 5,
    stage: str = "video",
    error: Optional[str] = None
) -> bool:
    """Records or updates job lifecycle in Supabase public.jobs table."""
    client = get_supabase_client()
    if not client:
        return False

    try:
        data = {
            "job_id": job_id,
            "user_id": user_id,
            "url": url,
            "status": status,
            "progress_percent": progress_percent,
            "stage": stage
        }
        if error:
            data["error"] = str(error)[:500]
        client.table("jobs").upsert(data, on_conflict="job_id").execute()
        return True
    except Exception as e:
        print(f"[Supabase DB] Warning syncing job {job_id}: {e}")
        return False


def save_clips_to_db(
    user_id: str,
    job_id: str,
    clips: List[Dict[str, Any]],
    video_info: Optional[Dict[str, Any]] = None
) -> bool:
    """Records clipping job and clips metadata into both SQLAlchemy DB and Supabase PostgreSQL tables."""
    # 1. Primary persistence: Save to SQLAlchemy ClipModel
    try:
        from clipper.db import get_db_session, ClipModel
        s = get_db_session()
        try:
            for c in clips:
                file_name = c.get("file") or (os.path.basename(c.get("file_path", "")) if c.get("file_path") else "")
                existing = s.query(ClipModel).filter_by(job_id=job_id, file_name=file_name).first()
                if not existing:
                    clip_rec = ClipModel(
                        job_id=job_id,
                        user_id=user_id,
                        file_name=file_name,
                        title=c.get("title", ""),
                        duration=float(c.get("duration", 0.0)),
                        score=float(c.get("score", 8.0)),
                        tags_json=json.dumps(c.get("tags", [])) if isinstance(c.get("tags"), list) else str(c.get("tags") or "[]"),
                        explanation=c.get("explanation", ""),
                        reason=c.get("reason", ""),
                        start_time=float(c.get("start", 0.0)),
                        end_time=float(c.get("end", 0.0)),
                        storage_path=f"users/{user_id}/{job_id}/{file_name}" if job_id else f"users/{user_id}/{file_name}",
                        signed_url=c.get("download_url") or c.get("url") or c.get("signed_url")
                    )
                    s.add(clip_rec)
            s.commit()
        finally:
            s.close()
    except Exception as dbe:
        print(f"[DB] Warning saving clips to ClipModel: {dbe}")

    # 2. Secondary cloud sync to Supabase if configured
    client = get_supabase_client()
    if not client:
        return True

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
            file_name = c.get("file") or (os.path.basename(c.get("file_path", "")) if c.get("file_path") else "")
            records.append({
                "job_id": job_id,
                "user_id": user_id,
                "file_name": file_name,
                "title": c.get("title", ""),
                "duration": c.get("duration", 0.0),
                "score": c.get("score", 8.0),
                "tags": json.dumps(c.get("tags", [])) if isinstance(c.get("tags"), list) else str(c.get("tags") or "[]"),
                "explanation": c.get("explanation", ""),
                "reason": c.get("reason", ""),
                "start_time": c.get("start", 0.0),
                "end_time": c.get("end", 0.0),
                "storage_path": f"users/{user_id}/{job_id}/{file_name}" if job_id else f"users/{user_id}/{file_name}",
                "signed_url": c.get("download_url") or c.get("url") or c.get("signed_url")
            })

        if records:
            client.table("clips").insert(records).execute()
        return True
    except Exception as e:
        print(f"[Supabase DB] Error saving clips: {e}")
        return False


def get_user_clips_from_cloud(user_id: str) -> Optional[List[Dict[str, Any]]]:
    """Retrieves unexpired clips for a user from cloud database with fresh signed URLs."""
    client = get_supabase_client()
    if not client:
        return None

    try:
        query = client.table("clips").select("*").eq("user_id", user_id).order("created_at", desc=True)
        res = query.execute()
        raw_clips = res.data or []

        clips = []
        for r in raw_clips:
            storage_path = r.get("storage_path")
            signed_url = r.get("signed_url")

            # Refresh signed URL if using S3/R2 or Supabase
            if storage_path:
                if s3_storage.is_configured():
                    fresh_s3 = s3_storage.generate_presigned_download_url(storage_path, expires_in=86400)
                    if fresh_s3:
                        signed_url = fresh_s3
                else:
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


class StorageProviderWrapper:
    """Wrapper exposing active cloud/local storage provider info."""
    @property
    def provider_type(self) -> str:
        if s3_storage.is_configured():
            return "s3"
        elif is_supabase_enabled():
            return "supabase"
        return "local"


_storage_wrapper = StorageProviderWrapper()


def get_storage_provider() -> StorageProviderWrapper:
    """Returns the unified storage provider instance."""
    return _storage_wrapper


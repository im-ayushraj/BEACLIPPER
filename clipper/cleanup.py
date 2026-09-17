"""Automated Server Cleanup & 24-Hour Clip Retention Manager."""
from __future__ import annotations

import os
import time
import shutil
import threading
from pathlib import Path
from typing import Dict, Any, Optional

TWENTY_FOUR_HOURS = 24 * 60 * 60  # 86,400 seconds


def cleanup_temp_video_files(video_info: Dict[str, Any]) -> None:
    """
    Immediately deletes bulky raw full-length video and audio files from temp_downloads/
    as soon as FFmpeg completes cutting the 30-60s short clips.
    """
    targets = [video_info.get("video_path"), video_info.get("audio_path")]
    for path_str in targets:
        if not path_str:
            continue
        try:
            p = Path(path_str)
            if p.exists() and p.is_file():
                size_mb = round(p.stat().st_size / (1024 * 1024), 2)
                p.unlink()
                print(f"[Cleanup] Deleted temporary raw media {p.name} ({size_mb} MB reclaimed).")
        except Exception as e:
            print(f"[Cleanup] Notice: Could not remove temp file {path_str}: {e}")


def purge_expired_clips_on_server(
    output_dir: str | Path,
    temp_dir: Optional[str | Path] = None,
    max_age_seconds: int = TWENTY_FOUR_HOURS
) -> int:
    """
    Scans the local server's storage and deletes any generated MP4 clips and
    associated metadata files that are older than 24 hours (86,400 seconds).
    """
    purged_count = 0
    now = time.time()
    directories = [Path(output_dir)]
    if temp_dir:
        directories.append(Path(temp_dir))

    for base_path in directories:
        if not base_path.exists():
            continue

        for root, dirs, files in os.walk(base_path, topdown=False):
            for file in files:
                file_path = Path(root) / file
                try:
                    # Check age of file
                    file_age = now - file_path.stat().st_mtime
                    if file_age > max_age_seconds:
                        # Only purge media clips and transient metadata, protect permanent system configs
                        if file_path.suffix.lower() in [".mp4", ".webm", ".wav", ".json", ".part"]:
                            size_mb = round(file_path.stat().st_size / (1024 * 1024), 2)
                            file_path.unlink()
                            purged_count += 1
                            print(f"[Retention 24h] Purged expired file {file_path.name} ({size_mb} MB, age: {int(file_age/3600)}h).")
                except Exception as e:
                    print(f"[Retention 24h] Error evaluating file {file_path}: {e}")

            # Remove empty subdirectories under users/
            for dir_name in dirs:
                dir_path = Path(root) / dir_name
                try:
                    if dir_path.is_dir() and not any(dir_path.iterdir()):
                        dir_path.rmdir()
                except Exception:
                    pass

    return purged_count


def start_retention_sweeper(
    output_dir: str | Path,
    temp_dir: Optional[str | Path] = None,
    interval_seconds: int = 3600,
    max_age_seconds: int = TWENTY_FOUR_HOURS
) -> threading.Thread:
    """
    Launches a daemon background thread that runs the 24-hour expiration sweeper
    at server launch and repeats every hour.
    """
    def _sweeper_loop():
        # Run initial sweep on boot
        try:
            purged = purge_expired_clips_on_server(output_dir, temp_dir, max_age_seconds)
            if purged > 0:
                print(f"[Retention Sweeper] Initial boot sweep: Removed {purged} expired clip(s).")
        except Exception as e:
            print(f"[Retention Sweeper] Initial sweep error: {e}")

        while True:
            time.sleep(interval_seconds)
            try:
                purged = purge_expired_clips_on_server(output_dir, temp_dir, max_age_seconds)
                if purged > 0:
                    print(f"[Retention Sweeper] Hourly sweep: Removed {purged} expired clip(s).")
            except Exception as e:
                print(f"[Retention Sweeper] Loop error: {e}")

    thread = threading.Thread(target=_sweeper_loop, daemon=True, name="24h-Retention-Sweeper")
    thread.start()
    return thread

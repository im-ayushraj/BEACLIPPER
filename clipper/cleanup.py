"""Automated Server Cleanup & 24-Hour Clip Retention Manager."""
from __future__ import annotations

import os
import time
import shutil
import threading
from pathlib import Path
from typing import Dict, Any, Optional, List

ONE_HOUR = 60 * 60  # 3,600 seconds (1 hour for raw source uploads & downloads)
TWENTY_FOUR_HOURS = 24 * 60 * 60  # 86,400 seconds (24 hours for output clips & zips)


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


def purge_raw_source_videos(
    temp_dirs: List[str | Path] | str | Path,
    max_age_seconds: int = ONE_HOUR
) -> int:
    """
    Scans temporary upload and download directories and deletes raw input videos/audios
    older than 1 hour (3,600 seconds) to prevent disk space exhaustion from abandoned or completed jobs.
    """
    purged_count = 0
    now = time.time()
    dirs = [temp_dirs] if isinstance(temp_dirs, (str, Path)) else temp_dirs

    for base_dir in dirs:
        p = Path(base_dir)
        if not p.exists():
            continue

        for root, _, files in os.walk(p, topdown=False):
            for file in files:
                file_path = Path(root) / file
                try:
                    file_age = now - file_path.stat().st_mtime
                    if file_age > max_age_seconds:
                        if file_path.suffix.lower() in [".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".mp3", ".wav", ".part", ".tmp"]:
                            size_mb = round(file_path.stat().st_size / (1024 * 1024), 2)
                            file_path.unlink()
                            purged_count += 1
                            print(f"[Source Retention 1h] Purged stale raw file {file_path.name} ({size_mb} MB, age: {int(file_age/60)}m).")
                except Exception as e:
                    print(f"[Source Retention 1h] Error evaluating {file_path}: {e}")

    return purged_count


def purge_expired_clips_on_server(
    output_dirs: List[str | Path] | str | Path,
    temp_dirs: Optional[List[str | Path] | str | Path] = None,
    max_age_seconds: int = TWENTY_FOUR_HOURS
) -> int:
    """
    Scans server storage and deletes generated MP4 clips, zip archives, and
    associated metadata files that are older than 24 hours (86,400 seconds).
    """
    purged_count = 0
    now = time.time()
    dirs_to_check: list[Path] = []
    
    if isinstance(output_dirs, (list, tuple)):
        dirs_to_check.extend([Path(d) for d in output_dirs])
    elif output_dirs:
        dirs_to_check.append(Path(output_dirs))

    if isinstance(temp_dirs, (list, tuple)):
        dirs_to_check.extend([Path(d) for d in temp_dirs])
    elif temp_dirs:
        dirs_to_check.append(Path(temp_dirs))

    for base_path in dirs_to_check:
        if not base_path.exists():
            continue

        for root, dirs, files in os.walk(base_path, topdown=False):
            for file in files:
                file_path = Path(root) / file
                try:
                    file_age = now - file_path.stat().st_mtime
                    if file_age > max_age_seconds:
                        if file_path.suffix.lower() in [".mp4", ".webm", ".wav", ".json", ".part", ".zip"]:
                            size_mb = round(file_path.stat().st_size / (1024 * 1024), 2)
                            file_path.unlink()
                            purged_count += 1
                            print(f"[Retention 24h] Purged expired file {file_path.name} ({size_mb} MB, age: {int(file_age/3600)}h).")
                except Exception as e:
                    print(f"[Retention 24h] Error evaluating file {file_path}: {e}")

            # Remove empty subdirectories
            for dir_name in dirs:
                dir_path = Path(root) / dir_name
                try:
                    if dir_path.is_dir() and not any(dir_path.iterdir()):
                        dir_path.rmdir()
                except Exception:
                    pass

    return purged_count


def start_retention_sweeper(
    output_dirs: List[str | Path] | str | Path,
    temp_dirs: Optional[List[str | Path] | str | Path] = None,
    interval_seconds: int = 3600,
    max_clip_age_seconds: int = TWENTY_FOUR_HOURS,
    max_source_age_seconds: int = ONE_HOUR
) -> threading.Thread:
    """
    Launches a daemon background thread that:
    1. Sweeps raw source videos older than 1 hour in temp directories.
    2. Sweeps generated clips and zip packages older than 24 hours in output directories.
    Runs on boot and repeats every interval_seconds (default: 1 hour).
    """
    def _sweeper_loop():
        def _run_sweep():
            if temp_dirs:
                src_purged = purge_raw_source_videos(temp_dirs, max_source_age_seconds)
                if src_purged > 0:
                    print(f"[Retention Sweeper] Purged {src_purged} stale source media (>1h).")
            clip_purged = purge_expired_clips_on_server(output_dirs, temp_dirs, max_clip_age_seconds)
            if clip_purged > 0:
                print(f"[Retention Sweeper] Purged {clip_purged} expired clip/zip files (>24h).")

        # Initial sweep on boot
        try:
            _run_sweep()
        except Exception as e:
            print(f"[Retention Sweeper] Initial sweep error: {e}")

        while True:
            time.sleep(interval_seconds)
            try:
                _run_sweep()
            except Exception as e:
                print(f"[Retention Sweeper] Loop error: {e}")

    thread = threading.Thread(target=_sweeper_loop, daemon=True, name="Storage-Retention-Sweeper")
    thread.start()
    return thread

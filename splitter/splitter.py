"""Deterministic Fixed-Duration Video Splitter Engine.

Takes a video and splits it sequentially into equal-length clips using FFmpeg,
preserving partial remainders and packaging results into a downloadable ZIP archive.
"""
from __future__ import annotations

import math
import os
import re
import shutil
import subprocess
import zipfile
from pathlib import Path
from typing import Dict, Any, List, Optional, Callable

try:
    import imageio_ffmpeg
    DEFAULT_FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    DEFAULT_FFMPEG = "ffmpeg"


class VideoSplitError(Exception):
    """Raised when video splitting or metadata probing fails."""
    pass


def get_ffmpeg_path() -> str:
    """Resolve FFmpeg executable path."""
    which_ffmpeg = shutil.which("ffmpeg")
    if which_ffmpeg:
        return which_ffmpeg
    return DEFAULT_FFMPEG


def format_timestamp(seconds: float) -> str:
    """Format seconds into HH:MM:SS or MM:SS."""
    seconds = max(0.0, float(seconds))
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def format_bytes(size_bytes: int) -> str:
    """Format bytes to human-readable string."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"


def probe_video_metadata(video_path: str | Path) -> Dict[str, Any]:
    """
    Extract video duration, resolution, and file size using FFmpeg.
    Works without requiring ffprobe binary.
    """
    path = Path(video_path).resolve()
    if not path.exists():
        raise VideoSplitError(f"Video file not found: {path}")

    size_bytes = path.stat().st_size
    ffmpeg_bin = get_ffmpeg_path()

    cmd = [ffmpeg_bin, "-hide_banner", "-i", str(path)]
    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            errors="replace",
            timeout=30
        )
        err = proc.stderr or ""
    except subprocess.TimeoutExpired:
        raise VideoSplitError("FFmpeg metadata probe timed out (file may be corrupted or slow to read).")
    except Exception as e:
        raise VideoSplitError(f"Failed to execute FFmpeg probe: {e}") from e

    # Parse Duration: 00:30:10.90
    dur_match = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.?\d*)", err)
    if not dur_match:
        raise VideoSplitError("Could not determine video duration. Is the file a valid video?")

    h, m, s = dur_match.groups()
    duration_seconds = round(int(h) * 3600 + int(m) * 60 + float(s), 2)
    if duration_seconds <= 0:
        raise VideoSplitError("Invalid video duration (0 seconds)")

    # Parse Resolution: e.g. 1920x1080
    res_match = re.search(r"Stream #\d+:\d+.*Video:.*,\s*(\d{2,5})x(\d{2,5})", err)
    if res_match:
        width = int(res_match.group(1))
        height = int(res_match.group(2))
        resolution_str = f"{width} × {height}"
    else:
        width = 1920
        height = 1080
        resolution_str = "Unknown"

    return {
        "filename": path.name,
        "duration": duration_seconds,
        "duration_formatted": format_timestamp(duration_seconds),
        "width": width,
        "height": height,
        "resolution": resolution_str,
        "size_bytes": size_bytes,
        "size_formatted": format_bytes(size_bytes),
    }


def calculate_split_segments(total_duration: float, clip_duration: float) -> List[Dict[str, Any]]:
    """
    Calculate start/end timestamps and file names for sequential splitting.
    
    Handles:
    - Exact division (e.g. 100s / 25s = 4 clips)
    - Remainder (e.g. 62s / 25s = 25s, 25s, 12s)
    - Short videos (e.g. 10s / 25s = 1 clip of 10s)
    """
    if clip_duration <= 0:
        raise VideoSplitError("Clip duration must be greater than 0 seconds.")
    if total_duration <= 0:
        raise VideoSplitError("Total video duration must be greater than 0 seconds.")

    segments: List[Dict[str, Any]] = []
    start = 0.0
    index = 1

    while start < total_duration:
        end = min(round(start + clip_duration, 2), round(total_duration, 2))
        dur = round(end - start, 2)
        if dur > 0:
            segments.append({
                "index": index,
                "filename": f"clip_{index:03d}.mp4",
                "start": round(start, 2),
                "end": round(end, 2),
                "duration": dur,
                "start_formatted": format_timestamp(start),
                "end_formatted": format_timestamp(end),
            })
            index += 1
        start = end

    return segments


def create_clips_zip(clips_dir: str | Path, zip_output_path: str | Path) -> str:
    """Package all clip_*.mp4 files in clips_dir into a zip archive."""
    clips_path = Path(clips_dir).resolve()
    zip_path = Path(zip_output_path).resolve()
    zip_path.parent.mkdir(parents=True, exist_ok=True)

    clip_files = sorted(clips_path.glob("clip_*.mp4"))
    if not clip_files:
        raise VideoSplitError("No clips found to package into ZIP archive.")

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for clip in clip_files:
            zf.write(clip, arcname=clip.name)

    return str(zip_path)


def split_video_sequentially(
    video_path: str | Path,
    clip_duration: float,
    output_dir: str | Path,
    progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None
) -> Dict[str, Any]:
    """
    Execute deterministic FFmpeg sequential cutting across entire video.
    """
    vpath = Path(video_path).resolve()
    out_dir = Path(output_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    metadata = probe_video_metadata(vpath)
    total_dur = metadata["duration"]
    segments = calculate_split_segments(total_dur, clip_duration)
    total_clips = len(segments)

    ffmpeg_bin = get_ffmpeg_path()
    generated_clips: List[Dict[str, Any]] = []

    for i, seg in enumerate(segments, start=1):
        clip_file = out_dir / seg["filename"]
        start_time = seg["start"]
        duration = seg["duration"]

        # Fast Stream Copy attempt: copies packet streams without decoding/re-encoding (25x-50x faster)
        copy_cmd = [
            ffmpeg_bin,
            "-y",
            "-ss", str(start_time),
            "-i", str(vpath),
            "-t", str(duration),
            "-c", "copy",
            "-avoid_negative_ts", "make_zero",
            "-movflags", "+faststart",
            str(clip_file)
        ]

        try:
            proc = subprocess.run(
                copy_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                errors="replace",
                timeout=180
            )
        except subprocess.TimeoutExpired:
            proc = None

        # Verify output exists and is not corrupt/empty; fallback to ultrafast re-encode if needed
        if proc is None or proc.returncode != 0 or not clip_file.exists() or clip_file.stat().st_size < 500:
            encode_cmd = [
                ffmpeg_bin,
                "-y",
                "-ss", str(start_time),
                "-i", str(vpath),
                "-t", str(duration),
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-crf", "23",
                "-c:a", "aac",
                "-b:a", "128k",
                "-avoid_negative_ts", "make_zero",
                "-movflags", "+faststart",
                str(clip_file)
            ]
            try:
                proc = subprocess.run(
                    encode_cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    errors="replace",
                    timeout=180
                )
            except subprocess.TimeoutExpired:
                raise VideoSplitError(f"FFmpeg timed out while encoding clip {seg['filename']}")

            if proc.returncode != 0 or not clip_file.exists():
                raise VideoSplitError(f"FFmpeg failed while creating clip {seg['filename']}: {proc.stderr[:300]}")

        file_size = clip_file.stat().st_size
        seg_record = dict(seg)
        seg_record["size_bytes"] = file_size
        seg_record["size_formatted"] = format_bytes(file_size)
        seg_record["relative_path"] = str(clip_file.name)
        generated_clips.append(seg_record)

        if progress_callback:
            percent = int((i / total_clips) * 100)
            progress_callback({
                "stage": "splitting",
                "current": i,
                "total": total_clips,
                "percent": percent,
                "message": f"Splitting video into {int(clip_duration)}s segments ({i}/{total_clips} clips created)...",
                "latest_clip": seg_record
            })

    # Step: Package all clips into ZIP for Download All
    if progress_callback:
        progress_callback({
            "stage": "finalizing",
            "current": total_clips,
            "total": total_clips,
            "percent": 98,
            "message": "Finalizing files and creating ZIP package..."
        })

    zip_file_path = out_dir / "split-clips.zip"
    create_clips_zip(out_dir, zip_file_path)

    return {
        "video_info": metadata,
        "clip_duration": clip_duration,
        "total_clips": total_clips,
        "clips": generated_clips,
        "zip_path": str(zip_file_path),
        "zip_name": "split-clips.zip"
    }

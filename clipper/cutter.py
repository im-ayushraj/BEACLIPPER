"""High-performance FFmpeg video cutting and clips.json metadata generator."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, Any, List, Optional, Callable

from clipper.downloader import get_ffmpeg_path


class VideoCuttingError(Exception):
    """Raised when FFmpeg video cutting fails."""
    pass


def cut_single_clip(
    video_path: str,
    start: float,
    duration: float,
    output_path: str,
    ffmpeg_bin: str = "ffmpeg"
) -> None:
    """
    Cut a single clip using high-speed stream copy (25x-50x faster).
    Automatically falls back to ultrafast re-encoding if stream copy fails
    or produces an invalid file.
    """
    out_file = Path(output_path)

    # 1. Attempt Fast Stream Copy: Zero re-encoding, pure packet copy (~0.1s - 0.3s)
    copy_cmd = [
        ffmpeg_bin,
        "-y",
        "-ss", str(start),
        "-i", video_path,
        "-t", str(duration),
        "-c", "copy",
        "-avoid_negative_ts", "make_zero",
        "-movflags", "+faststart",
        output_path
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

    # 2. Check if output exists and is valid; if not, fallback to ultrafast re-encoding
    if proc is None or proc.returncode != 0 or not out_file.exists() or out_file.stat().st_size < 500:
        if out_file.exists():
            try:
                out_file.unlink(missing_ok=True)
            except Exception:
                pass

        encode_cmd = [
            ffmpeg_bin,
            "-y",
            "-ss", f"{max(0.0, float(start)):.3f}",
            "-i", video_path,
            "-t", f"{max(0.5, float(duration)):.3f}",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "23",
            "-c:a", "aac",
            "-b:a", "128k",
            "-avoid_negative_ts", "make_zero",
            "-fflags", "+genpts",
            "-movflags", "+faststart",
            output_path
        ]

        try:
            fallback_proc = subprocess.run(
                encode_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                errors="replace",
                timeout=180
            )
        except subprocess.TimeoutExpired:
            raise VideoCuttingError(f"FFmpeg timed out while cutting clip at {output_path}")

        if fallback_proc.returncode != 0 or not out_file.exists() or out_file.stat().st_size < 500:
            stderr_msg = fallback_proc.stderr or (proc.stderr if proc else "Process timeout or error")
            raise VideoCuttingError(f"FFmpeg failed to create clip at {output_path}: {stderr_msg[:300]}")


def generate_clips(
    video_path: str,
    clips_data: List[Dict[str, Any]],
    output_dir: str | Path,
    ffmpeg_bin: str | None = None,
    max_workers: Optional[int] = None,
    progress_callback: Optional[Callable[[int, int], None]] = None
) -> Dict[str, Any]:
    """
    Cut all top clips concurrently using multi-threaded worker pool
    and write output/clips.json.
    """
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    bin_path = ffmpeg_bin or get_ffmpeg_path()

    num_clips = len(clips_data)
    if num_clips == 0:
        result_json: Dict[str, Any] = {"clips": []}
        with open(out_dir / "clips.json", "w", encoding="utf-8") as f:
            json.dump(result_json, f, indent=2)
        return result_json

    workers = max_workers or min(4, os.cpu_count() or 2)
    prepared_items = []

    for index, clip in enumerate(clips_data, start=1):
        filename = f"clip_{index:02d}.mp4"
        clip_filepath = out_dir / filename
        start = float(clip["start"])
        end = float(clip["end"])
        duration = round(end - start, 2)
        score = float(clip.get("score", 0.0))
        reason = str(clip.get("reason", ""))
        title = str(clip.get("title", f"Clip {index:02d}"))
        tags = clip.get("tags", ["#shorts", "#viral", "#highlights"])
        explanation = str(clip.get("explanation", reason))

        prepared_items.append({
            "index": index,
            "filename": filename,
            "clip_filepath": str(clip_filepath),
            "start": start,
            "end": end,
            "duration": duration,
            "score": score,
            "reason": reason,
            "title": title,
            "tags": tags,
            "explanation": explanation
        })

    completed_count = 0

    def _worker_cut(item: Dict[str, Any]) -> Dict[str, Any]:
        cut_single_clip(
            video_path=video_path,
            start=item["start"],
            duration=item["duration"],
            output_path=item["clip_filepath"],
            ffmpeg_bin=bin_path
        )
        return item

    final_clips_dict: Dict[int, Dict[str, Any]] = {}

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(_worker_cut, item): item for item in prepared_items}
        for future in as_completed(futures):
            item = future.result()
            completed_count += 1
            if progress_callback:
                progress_callback(completed_count, num_clips)

            final_clips_dict[item["index"]] = {
                "file": item["filename"],
                "title": item["title"],
                "tags": item["tags"],
                "explanation": item["explanation"],
                "start": item["start"],
                "end": item["end"],
                "duration": item["duration"],
                "score": item["score"],
                "reason": item["reason"]
            }

    # Ensure clips are in original sequential order
    final_clips = [final_clips_dict[i] for i in range(1, num_clips + 1) if i in final_clips_dict]

    result_json = {"clips": final_clips}
    json_path = out_dir / "clips.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result_json, f, indent=2)

    return result_json

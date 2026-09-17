"""FFmpeg video cutting and clips.json metadata generator."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Dict, Any, List

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
    """Cut a single clip using FFmpeg with re-encoding for frame accuracy."""
    cmd = [
        ffmpeg_bin,
        "-y",
        "-ss", str(start),
        "-i", video_path,
        "-t", str(duration),
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "22",
        "-c:a", "aac",
        "-b:a", "128k",
        "-avoid_negative_ts", "make_zero",
        "-movflags", "+faststart",
        output_path
    ]

    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True
        )
    except subprocess.CalledProcessError as e:
        stderr_msg = e.stderr.decode("utf-8", errors="ignore")
        raise VideoCuttingError(f"FFmpeg failed to create clip at {output_path}: {stderr_msg}") from e


def generate_clips(
    video_path: str,
    clips_data: List[Dict[str, Any]],
    output_dir: str | Path,
    ffmpeg_bin: str | None = None
) -> Dict[str, Any]:
    """
    Cut all top clips and write output/clips.json.
    Returns:
        {
            "clips": [
                {
                    "file": "clip_01.mp4",
                    "start": 100.5,
                    "end": 151.2,
                    "duration": 50.7,
                    "score": 9.4,
                    "reason": "..."
                }
            ]
        }
    """
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    bin_path = ffmpeg_bin or get_ffmpeg_path()

    final_clips: List[Dict[str, Any]] = []

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

        cut_single_clip(
            video_path=video_path,
            start=start,
            duration=duration,
            output_path=str(clip_filepath),
            ffmpeg_bin=bin_path
        )

        final_clips.append({
            "file": filename,
            "title": title,
            "tags": tags,
            "explanation": explanation,
            "start": start,
            "end": end,
            "duration": duration,
            "score": score,
            "reason": reason
        })

    result_json = {"clips": final_clips}
    json_path = out_dir / "clips.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result_json, f, indent=2)

    return result_json

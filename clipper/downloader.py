"""YouTube Video Downloader and Audio Extractor using yt-dlp and FFmpeg."""
from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional

import yt_dlp
try:
    import imageio_ffmpeg
    DEFAULT_FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    DEFAULT_FFMPEG = "ffmpeg"


class VideoDownloadError(Exception):
    """Raised when video download or processing fails."""
    pass


class VideoDurationLimitExceeded(Exception):
    """Raised when a video exceeds the maximum allowed duration (e.g. 35 minutes)."""
    pass


class InvalidURLError(Exception):
    """Raised when provided URL is not a valid YouTube URL."""
    pass


MAX_VIDEO_DURATION_SECONDS = 35 * 60  # 35 minutes (2100s)

YOUTUBE_REGEX = re.compile(
    r"^(https?://)?(www\.|m\.)?(youtube\.com/(watch\?v=|shorts/|embed/)|youtu\.be/)([a-zA-Z0-9_-]{11})"
)


def get_ffmpeg_path() -> str:
    """Resolve FFmpeg binary path."""
    which_ffmpeg = shutil.which("ffmpeg")
    if which_ffmpeg:
        return which_ffmpeg
    return DEFAULT_FFMPEG


def extract_video_id(url: str) -> str:
    """Extract 11-character YouTube video ID from URL."""
    url = url.strip()
    match = YOUTUBE_REGEX.search(url)
    if not match:
        raise InvalidURLError(f"Invalid YouTube URL: {url}")
    return match.group(5)


COOKIES_FILE = Path(__file__).resolve().parent.parent / "cookies.txt"


def get_base_ydl_opts() -> Dict[str, Any]:
    """Base yt-dlp configuration with player client spoofing and optional cookies."""
    opts: Dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "js_runtimes": {"node": {}},
        "extractor_args": {
            "youtube": {
                "player_client": ["android", "ios", "web"],
            }
        },
    }
    if COOKIES_FILE.exists() and COOKIES_FILE.stat().st_size > 0:
        opts["cookiefile"] = str(COOKIES_FILE)
    return opts


def get_video_metadata_preflight(
    url: str,
    max_duration_seconds: int = MAX_VIDEO_DURATION_SECONDS
) -> Dict[str, Any]:
    """
    Fast pre-flight metadata probe without downloading video files.
    Enforces the 35-minute maximum duration limit.
    """
    ydl_opts = get_base_ydl_opts()
    ydl_opts["skip_download"] = True

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if not info:
                raise VideoDownloadError(f"Could not retrieve video information for {url}")

            duration = float(info.get("duration", 0.0))
            if duration > max_duration_seconds:
                mins = round(duration / 60, 1)
                max_mins = int(max_duration_seconds / 60)
                raise VideoDurationLimitExceeded(
                    f"Video duration ({mins} mins) exceeds the {max_mins}-minute limit. "
                    f"Please submit videos up to {max_mins} minutes."
                )

            return {
                "id": info.get("id"),
                "title": info.get("title", "YouTube Video"),
                "duration": duration,
                "webpage_url": info.get("webpage_url", url)
            }
    except yt_dlp.utils.DownloadError as e:
        raise VideoDownloadError(f"Failed to probe video: {str(e)}") from e


def download_video(
    url: str,
    output_dir: str | Path,
    max_resolution: int = 1080,
    max_duration_seconds: int = MAX_VIDEO_DURATION_SECONDS
) -> Dict[str, Any]:
    """
    Download YouTube video to output_dir and ensure an audio stream exists.
    Enforces maximum video duration cap (default 35 minutes).
    Returns metadata dict with:
        video_id, title, duration, video_path, audio_path
    """
    video_id = extract_video_id(url)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    ffmpeg_bin = get_ffmpeg_path()
    out_template = str(output_path / f"{video_id}.%(ext)s")

    ydl_opts = get_base_ydl_opts()
    ydl_opts.update({
        "format": f"bestvideo[ext=mp4][height<={max_resolution}]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "outtmpl": out_template,
        "merge_output_format": "mp4",
        "ffmpeg_location": ffmpeg_bin,
    })

    video_file = output_path / f"{video_id}.mp4"
    already_downloaded = video_file.exists() and video_file.stat().st_size > 1000

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # 1. First probe info to enforce 35-minute duration cap
            info = ydl.extract_info(url, download=False)
            if info is None:
                raise VideoDownloadError(f"Could not retrieve video information for {url}")

            duration = float(info.get("duration", 0.0))
            if duration > max_duration_seconds:
                mins = round(duration / 60, 1)
                max_mins = int(max_duration_seconds / 60)
                raise VideoDurationLimitExceeded(
                    f"Video duration ({mins} mins) exceeds the {max_mins}-minute limit. "
                    f"Please submit videos up to {max_mins} minutes."
                )

            # 2. Download only if within allowed limit
            if not already_downloaded:
                info = ydl.process_ie_result(info, download=True)

            title = info.get("title", f"video_{video_id}")
            duration = float(info.get("duration", 0.0))

            video_file = output_path / f"{video_id}.mp4"
            if not video_file.exists():
                # Check if it was saved with another extension
                candidates = list(output_path.glob(f"{video_id}.*"))
                candidates = [c for c in candidates if c.suffix.lower() in [".mp4", ".mkv", ".webm"]]
                if candidates:
                    video_file = candidates[0]
                else:
                    raise VideoDownloadError(f"Downloaded video file not found in {output_path}")

    except yt_dlp.utils.DownloadError as e:
        raise VideoDownloadError(f"Download failed: {str(e)}") from e
    except Exception as e:
        if isinstance(e, (VideoDownloadError, InvalidURLError)):
            raise
        raise VideoDownloadError(f"Unexpected error during download: {str(e)}") from e

    # Extract audio file for possible transcription fallback
    audio_file = output_path / f"{video_id}.mp3"
    if not audio_file.exists():
        extract_audio(str(video_file), str(audio_file))

    return {
        "id": video_id,
        "title": title,
        "duration": duration,
        "video_path": str(video_file),
        "audio_path": str(audio_file),
    }


def extract_audio(video_path: str, audio_output_path: str) -> str:
    """Extract audio track from video as 16kHz mono mp3 using FFmpeg."""
    ffmpeg_bin = get_ffmpeg_path()
    cmd = [
        ffmpeg_bin,
        "-y",
        "-i", video_path,
        "-vn",
        "-acodec", "libmp3lame",
        "-ar", "16000",
        "-ac", "1",
        "-q:a", "4",
        audio_output_path
    ]
    try:
        subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True
        )
    except subprocess.CalledProcessError as e:
        # If libmp3lame fails, fallback to simple copy or default mp3
        fallback_cmd = [ffmpeg_bin, "-y", "-i", video_path, "-vn", audio_output_path]
        subprocess.run(fallback_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)

    return audio_output_path

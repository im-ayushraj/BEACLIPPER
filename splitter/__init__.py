"""Deterministic Fixed-Duration Video Splitter Package."""
from splitter.splitter import (
    probe_video_metadata,
    calculate_split_segments,
    split_video_sequentially,
    create_clips_zip,
    VideoSplitError,
)

__all__ = [
    "probe_video_metadata",
    "calculate_split_segments",
    "split_video_sequentially",
    "create_clips_zip",
    "VideoSplitError",
]

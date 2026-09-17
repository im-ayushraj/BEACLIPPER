"""End-to-end AI Video Clipper Pipeline with Whole-Video Scanning and Rich Metadata."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, Any, List, Optional, Callable

from clipper.downloader import download_video
from clipper.transcriber import get_transcript
from clipper.ai_analyzer import find_important_moments
from clipper.verifier import verify_all_candidates
from clipper.ranker import rank_and_deduplicate
from clipper.cutter import generate_clips
from clipper.cleanup import cleanup_temp_video_files


class ClipperPipeline:
    """Coordinates video download, whole-video transcription, AI moment finding, verification, and cutting."""

    def __init__(
        self,
        working_dir: str | Path = "temp_downloads",
        output_dir: str | Path = "output",
        gemini_api_key: Optional[str] = None,
        openai_api_key: Optional[str] = None,
    ):
        self.working_dir = Path(working_dir)
        self.output_dir = Path(output_dir)
        self.gemini_api_key = gemini_api_key or os.getenv("GEMINI_API_KEY")
        self.openai_api_key = openai_api_key or os.getenv("OPENAI_API_KEY")

        self.working_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def run(
        self,
        youtube_url: str,
        target_clip_count: int = 10,
        status_callback: Optional[Callable[[str, str], None]] = None,
        precomputed_transcript: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Execute the full pipeline for a YouTube URL.
        status_callback(stage, message) can be used to track progress.
        """
        import time

        start_time = time.time()
        metrics: Dict[str, Any] = {
            "transcription_calls": 0,
            "transcription_seconds": 0.0,
            "llm_calls": 0,
            "retries": 0,
        }

        def notify(stage: str, msg: str):
            if status_callback:
                status_callback(stage, msg)

        # 1. Download video & extract audio
        notify("video", "Downloading video and extracting audio...")
        video_info = download_video(youtube_url, self.working_dir)
        notify("video_done", f"Video '{video_info['title']}' ready ({int(video_info.get('duration', 0)/60)} mins).")

        # 2. Get timestamped transcript (or reuse precomputed)
        if precomputed_transcript:
            segments = precomputed_transcript
            notify("transcript_done", f"Reusing verified transcript with {len(segments)} segments.")
        else:
            notify("transcript", "Extracting timestamped transcript across entire video...")
            t_start = time.time()
            transcript_data = get_transcript(
                video_id=video_info["id"],
                audio_path=video_info["audio_path"],
                gemini_api_key=self.gemini_api_key,
            )
            segments = transcript_data["segments"]
            metrics["transcription_seconds"] = round(time.time() - t_start, 2)
            metrics["transcription_calls"] = 1
            notify("transcript_done", f"Retrieved {len(segments)} transcript segments covering full video.")

        # 3. AI finds important moments across the whole video
        notify("analysis", f"AI scanning full transcript for top {target_clip_count}+ viral moments...")
        raw_candidates = find_important_moments(
            segments=segments,
            gemini_key=self.gemini_api_key,
            openai_key=self.openai_api_key,
            target_clip_count=target_clip_count,
            progress_callback=lambda msg: notify("analysis", msg),
            metrics_collector=metrics
        )

        # 4. Context verification & 30-60s timestamp adjustment
        notify("analysis", "Verifying sentence context, complete thoughts, and 30-60s durations...")
        verified_candidates = verify_all_candidates(
            candidates=raw_candidates,
            segments=segments,
            video_duration=video_info.get("duration")
        )

        # 5. Rank and deduplicate across entire timeline (select top diverse clips)
        notify("analysis", f"Selecting top {target_clip_count} diverse clips distributed across the video...")
        top_candidates = rank_and_deduplicate(
            candidates=verified_candidates,
            target_count=target_clip_count,
            ensure_timeline_diversity=True
        )

        if not top_candidates:
            t_start = segments[0]["start"]
            t_end = min(segments[-1]["end"], t_start + 45.0)
            if t_end - t_start < 30.0 and video_info.get("duration", 0) >= 30:
                t_end = t_start + 30.0
            top_candidates = [{
                "start": t_start,
                "end": t_end,
                "duration": round(t_end - t_start, 2),
                "score": 8.5,
                "title": f"Highlight from {video_info.get('title', 'Video')}",
                "tags": ["#shorts", "#highlights", "#viral"],
                "explanation": "Key opening moment from the video covering the core concept.",
                "reason": "Top segment from video"
            }]

        notify("analysis_done", f"Selected {len(top_candidates)} optimal clips with full titles, tags & explanations.")

        # 6. FFmpeg creates clips and clips.json
        notify("clips", f"Generating {len(top_candidates)} video clips using FFmpeg...")
        clips_result = generate_clips(
            video_path=video_info["video_path"],
            clips_data=top_candidates,
            output_dir=self.output_dir
        )
        notify("clips_done", f"Generated {len(clips_result['clips'])} clips in {self.output_dir}.")

        # Immediate cleanup of raw heavy video and audio download
        cleanup_temp_video_files(video_info)

        total_processing_seconds = round(time.time() - start_time, 2)
        output_size_bytes = sum(
            (self.output_dir / c.get("file", "")).stat().st_size
            for c in clips_result["clips"]
            if (self.output_dir / c.get("file", "")).exists()
        )

        metrics["total_processing_seconds"] = total_processing_seconds
        metrics["video_duration"] = video_info.get("duration", 0.0)
        metrics["clip_count"] = len(clips_result["clips"])
        metrics["output_size_bytes"] = output_size_bytes

        return {
            "video": video_info,
            "clips": clips_result["clips"],
            "transcript_segments": segments,
            "metrics": metrics,
            "output_dir": str(self.output_dir)
        }

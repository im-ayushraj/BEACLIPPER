"""End-to-end AI Video Clipper Pipeline with Whole-Video Scanning and Rich Metadata."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, Any, List, Optional, Callable

from clipper.downloader import download_video, extract_audio
from clipper.transcriber import get_transcript, TranscriptionError
from clipper.ai_analyzer import find_important_moments, analyze_multimodal_candidates_batched
from clipper.verifier import verify_all_candidates
from clipper.ranker import rank_and_deduplicate
from clipper.cutter import generate_clips
from clipper.cleanup import cleanup_temp_video_files
from clipper.multimodal import (
    evaluate_transcript_usefulness,
    get_adaptive_sample_interval,
    detect_local_visual_signals,
    detect_local_audio_signals,
    generate_candidate_windows,
    extract_sparse_candidate_frames,
    analysis_cache,
    STATE_TRANSCRIPT_AVAILABLE,
    STATE_NO_USEFUL_TRANSCRIPT,
    STATE_TRANSCRIPT_PARTIAL,
)
from splitter.splitter import probe_video_metadata


class ClipperPipeline:
    """Coordinates video download/upload, whole-video transcription, AI moment finding, verification, and cutting."""

    def __init__(
        self,
        working_dir: str | Path = "temp_downloads",
        output_dir: str | Path = "output",
        gemini_api_key: Optional[str] = None,
        openai_api_key: Optional[str] = None,
        groq_api_key: Optional[str] = None,
        temp_dir: Optional[str | Path] = None,
        **kwargs: Any
    ):
        target_working = temp_dir if temp_dir is not None else working_dir
        self.working_dir = Path(target_working)
        self.output_dir = Path(output_dir)
        self.gemini_api_key = gemini_api_key or os.getenv("GEMINI_API_KEY")
        self.openai_api_key = openai_api_key or os.getenv("OPENAI_API_KEY")
        self.groq_api_key = groq_api_key or os.getenv("GROQ_API_KEY")

        self.working_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def run(
        self,
        youtube_url: Optional[str] = None,
        source_video_path: Optional[str | Path] = None,
        target_clip_count: int = 10,
        status_callback: Optional[Callable[[str, str], None]] = None,
        precomputed_transcript: Optional[List[Dict[str, Any]]] = None,
        url: Optional[str] = None,
        count: Optional[int] = None,
        aspect_ratio: str = "original",
        burn_subtitles: bool = True,
        mode: str = "AUTO",
        instruction: Optional[str] = None,
        preset: Optional[str] = None,
        min_duration: float = 30.0,
        max_duration: float = 60.0,
    ) -> Dict[str, Any]:
        """
        Execute the full pipeline for a YouTube URL or directly uploaded video file.
        Supports AUTO and GUIDED modes, dual Groq and Gemini engines,
        and automatic routing between transcript semantic analysis and multimodal visual/audio intelligence.
        """
        import time

        actual_url = youtube_url or url
        actual_count = count if count is not None else target_clip_count

        if not actual_url and not source_video_path:
            raise ValueError("Either youtube_url or source_video_path must be provided to ClipperPipeline.run")

        start_time = time.time()
        metrics: Dict[str, Any] = {
            "transcription_calls": 0,
            "transcription_seconds": 0.0,
            "llm_calls": 0,
            "retries": 0,
            "analysis_mode": "auto",
        }

        def notify(stage: str, msg: str):
            if status_callback:
                status_callback(stage, msg)

        # 1. Acquire video & extract audio track
        if source_video_path:
            vpath = Path(source_video_path).resolve()
            notify("video", "Processing uploaded video and checking media streams...")
            meta = probe_video_metadata(vpath)
            has_audio = meta.get("has_audio", True)
            vid_id = f"upload_{vpath.stem[:12]}"
            title = vpath.stem.replace("_", " ").title()
            audio_path = None
            if has_audio:
                candidate_audio_path = self.working_dir / f"{vid_id}.mp3"
                if not candidate_audio_path.exists():
                    res = extract_audio(str(vpath), str(candidate_audio_path))
                    if res and candidate_audio_path.exists():
                        audio_path = str(candidate_audio_path)
                else:
                    audio_path = str(candidate_audio_path)

            video_info = {
                "id": vid_id,
                "title": title,
                "duration": float(meta.get("duration", 0.0)),
                "video_path": str(vpath),
                "audio_path": audio_path,
                "has_audio": bool(audio_path),
                "is_local_file": True
            }
            if not video_info["has_audio"]:
                notify("video_done", f"Uploaded video '{title}' ready ({int(video_info['duration']/60)} mins, silent/no audio track).")
            else:
                notify("video_done", f"Uploaded video '{title}' ready ({int(video_info['duration']/60)} mins).")
        else:
            notify("video", "Downloading video and checking audio...")
            video_info = download_video(youtube_url, self.working_dir)
            video_info["is_local_file"] = False
            try:
                probe_meta = probe_video_metadata(video_info["video_path"])
                video_info["has_audio"] = probe_meta.get("has_audio", True)
                if not video_info["has_audio"]:
                    video_info["audio_path"] = None
            except Exception:
                video_info["has_audio"] = True
            notify("video_done", f"Video '{video_info['title']}' ready ({int(video_info.get('duration', 0)/60)} mins).")

        # 2. Get timestamped transcript (or attempt lazy extraction)
        segments: List[Dict[str, Any]] = []
        if not video_info.get("has_audio", True):
            notify("transcript", "Video has no audio track. Skipping speech transcription.")
            segments = []
        elif precomputed_transcript:
            segments = precomputed_transcript
            notify("transcript_done", f"Reusing verified transcript with {len(segments)} segments.")
        else:
            notify("transcript", "Checking for spoken audio transcript across video...")
            t_start = time.time()
            try:
                transcript_data = get_transcript(
                    video_id=video_info["id"],
                    audio_path=video_info.get("audio_path"),
                    gemini_api_key=self.gemini_api_key,
                    groq_api_key=self.groq_api_key,
                    is_local_file=video_info.get("is_local_file", False),
                    video_path=video_info.get("video_path"),
                )
                segments = transcript_data.get("segments", [])
                metrics["transcription_seconds"] = round(time.time() - t_start, 2)
                metrics["transcription_calls"] = 1
                notify("transcript_done", f"Retrieved {len(segments)} transcript segments.")
            except Exception as tr_err:
                print(f"[Pipeline] Transcript retrieval notice: {tr_err}. Proceeding to multimodal evaluation.")
                segments = []

        # 3. Evaluate transcript usefulness
        v_dur = float(video_info.get("duration", 0.0))
        usefulness = evaluate_transcript_usefulness(segments, v_dur)
        metrics["transcript_status"] = usefulness["status"]
        metrics["speech_ratio"] = usefulness["speech_ratio"]

        # 4. Route: Transcript-based OR Multimodal Visual/Audio Intelligence
        if usefulness["status"] == STATE_TRANSCRIPT_AVAILABLE:
            metrics["analysis_mode"] = "transcript_semantic"
            notify("analysis", f"AI scanning full transcript for top {target_clip_count}+ viral moments...")
            raw_candidates = find_important_moments(
                segments=segments,
                gemini_key=self.gemini_api_key,
                openai_key=self.openai_api_key,
                groq_key=self.groq_api_key,
                target_clip_count=target_clip_count,
                progress_callback=lambda msg: notify("analysis", msg),
                metrics_collector=metrics
            )

            # Context verification & 30-60s timestamp adjustment
            notify("analysis", "Verifying sentence context, complete thoughts, and 30-60s durations...")
            verified_candidates = verify_all_candidates(
                candidates=raw_candidates,
                segments=segments,
                video_duration=video_info.get("duration")
            )

            # Rank and deduplicate across entire timeline
            notify("analysis", f"Selecting top {target_clip_count} diverse clips distributed across the video...")
            top_candidates = rank_and_deduplicate(
                candidates=verified_candidates,
                target_count=target_clip_count,
                ensure_timeline_diversity=True
            )
        else:
            # 4B. MULTIMODAL VISUAL & AUDIO INTELLIGENCE (No useful speech / Action / Gaming)
            metrics["analysis_mode"] = "multimodal_visual_audio"
            notify("analysis", "No useful speech detected. Activating visual & audio multimodal intelligence...")

            cache_config = {
                "min_duration": min_duration,
                "max_duration": max_duration,
                "mode": mode,
                "preset": preset,
                "instruction": instruction
            }
            cached_data = analysis_cache.get(video_info.get("id", ""), cache_config)

            if cached_data and cached_data.get("candidates"):
                notify("analysis", "Reusing cached multimodal video candidate analysis...")
                top_candidates = cached_data["candidates"]
                metrics["cache_hit"] = True
            else:
                metrics["cache_hit"] = False
                notify("analysis", "Analyzing video visual scenes and audio energy bursts...")
                interval = get_adaptive_sample_interval(v_dur)
                metrics["sample_interval"] = interval

                # Local cheap signal detection
                visual_signals = detect_local_visual_signals(
                    video_path=video_info["video_path"],
                    duration=v_dur,
                    sample_interval=interval
                )
                audio_signals = detect_local_audio_signals(
                    audio_or_video_path=video_info.get("audio_path") or video_info["video_path"],
                    duration=v_dur,
                    has_audio=bool(video_info.get("has_audio", True) and video_info.get("audio_path"))
                )

                notify("analysis", f"Detected {len(visual_signals)} visual cues & {len(audio_signals)} audio events. Generating candidate windows...")
                local_candidates = generate_candidate_windows(
                    visual_signals=visual_signals,
                    audio_signals=audio_signals,
                    video_duration=v_dur,
                    min_clip_duration=min_duration,
                    max_clip_duration=max_duration,
                    has_transcript=bool(segments)
                )

                metrics["local_candidates_count"] = len(local_candidates)
                notify("analysis", f"Selected {len(local_candidates)} top candidate moments. Extracting sparse frames...")

                # Extract sparse representative frames for top candidates
                frames_dir = self.working_dir / "cand_frames" / str(video_info["id"])
                frames_dir.mkdir(parents=True, exist_ok=True)
                candidate_frames_map = {}
                for cand in local_candidates:
                    candidate_frames_map[cand["id"]] = extract_sparse_candidate_frames(
                        video_path=video_info["video_path"],
                        candidate=cand,
                        output_dir=frames_dir / f"cand_{cand['id']}",
                        frame_count=4,
                        max_width=768
                    )

                # Batched Gemini Vision analysis
                notify("analysis", f"Sending {len(local_candidates)} candidate frame sets to Gemini Vision...")
                evaluated_cands = analyze_multimodal_candidates_batched(
                    candidates=local_candidates,
                    candidate_frames_map=candidate_frames_map,
                    video_duration=v_dur,
                    guided_instruction=instruction,
                    preset=preset,
                    target_count=actual_count,
                    gemini_key=self.gemini_api_key,
                    groq_key=self.groq_api_key,
                    min_duration=min_duration,
                    max_duration=max_duration,
                    progress_callback=lambda msg: notify("analysis", msg),
                    metrics_collector=metrics
                )

                # Rank and deduplicate
                top_candidates = rank_and_deduplicate(
                    candidates=evaluated_cands,
                    target_count=actual_count,
                    ensure_timeline_diversity=True
                )

                # Store in cache
                analysis_cache.set(video_info.get("id", ""), {"candidates": top_candidates}, cache_config)

            # Subtitles should not burn if no valid speech segments exist
            if not segments or usefulness["status"] == STATE_NO_USEFUL_TRANSCRIPT:
                burn_subtitles = False

        if not top_candidates:
            t_start = 0.0
            t_end = min(v_dur, 45.0)
            if t_end - t_start < 25.0 and v_dur >= 25.0:
                t_end = t_start + 25.0
            top_candidates = [{
                "start": t_start,
                "end": t_end,
                "duration": round(t_end - t_start, 2),
                "score": 8.0,
                "title": f"Highlight from {video_info.get('title', 'Video')}",
                "tags": ["#shorts", "#highlights", "#viral"],
                "explanation": "Key opening moment from the video.",
                "reason": "Top segment from video"
            }]

        notify("analysis_done", f"Selected {len(top_candidates)} optimal clips with full titles, tags & explanations.")

        # 5. FFmpeg creates clips and clips.json using stream-copy & parallel processing
        sub_msg = " with animated subtitles" if burn_subtitles else ""
        notify("clips", f"Generating {len(top_candidates)} video clips{sub_msg} using high-speed FFmpeg...")
        clips_result = generate_clips(
            video_path=video_info["video_path"],
            clips_data=top_candidates,
            output_dir=self.output_dir,
            progress_callback=lambda done, total: notify("clips", f"Cut {done}/{total} clips..."),
            aspect_ratio=aspect_ratio,
            burn_subtitles=burn_subtitles,
            transcript_segments=segments
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

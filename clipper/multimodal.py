"""Lightweight local multimodal intelligence module for AI Clipper.
Performs cheap local signal detection (scene changes, frame diffs, audio energy spikes),
adaptive sparse sampling, candidate window generation with nearby event merging,
and sparse representative frame extraction for batched vision evaluation.
"""
from __future__ import annotations

import os
import re
import json
import math
import time
import hashlib
import subprocess
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

from splitter.splitter import probe_video_metadata


# Configurable Environment Constants
DEFAULT_SAMPLE_INTERVAL = float(os.getenv("VIDEO_ANALYSIS_SAMPLE_INTERVAL", "3.0"))
MAX_LOCAL_CANDIDATES = int(os.getenv("VIDEO_ANALYSIS_MAX_CANDIDATES", "20"))
MAX_LLM_CANDIDATES = int(os.getenv("VIDEO_ANALYSIS_MAX_LLM_CANDIDATES", "12"))
FRAMES_PER_CANDIDATE = int(os.getenv("VIDEO_ANALYSIS_FRAMES_PER_CANDIDATE", "4"))
MAX_VISION_BATCHES = int(os.getenv("VIDEO_ANALYSIS_MAX_BATCHES", "2"))
MAX_FRAME_WIDTH = int(os.getenv("VIDEO_ANALYSIS_MAX_FRAME_WIDTH", "768"))

# Signal scoring weights (normalized)
DEFAULT_WEIGHT_VISUAL = float(os.getenv("VIDEO_ANALYSIS_WEIGHT_VISUAL", "0.45"))
DEFAULT_WEIGHT_MOTION = float(os.getenv("VIDEO_ANALYSIS_WEIGHT_MOTION", "0.30"))
DEFAULT_WEIGHT_AUDIO = float(os.getenv("VIDEO_ANALYSIS_WEIGHT_AUDIO", "0.25"))
DEFAULT_WEIGHT_TRANSCRIPT = float(os.getenv("VIDEO_ANALYSIS_WEIGHT_TRANSCRIPT", "0.20"))


# Transcript state constants
STATE_TRANSCRIPT_AVAILABLE = "TRANSCRIPT_AVAILABLE"
STATE_TRANSCRIPT_PARTIAL = "TRANSCRIPT_PARTIAL"
STATE_NO_USEFUL_TRANSCRIPT = "NO_USEFUL_TRANSCRIPT"


def evaluate_transcript_usefulness(
    segments: Optional[List[Dict[str, Any]]],
    video_duration: float
) -> Dict[str, Any]:
    """
    Determine if a generated or retrieved transcript contains useful, dense speech.
    Returns:
        {
            "status": "TRANSCRIPT_AVAILABLE" | "TRANSCRIPT_PARTIAL" | "NO_USEFUL_TRANSCRIPT",
            "speech_detected": bool,
            "speech_duration": float,
            "speech_ratio": float,
            "transcript_length": int,
            "average_segment_length": float,
            "segment_count": int,
        }
    """
    if not segments or video_duration <= 0.0:
        return {
            "status": STATE_NO_USEFUL_TRANSCRIPT,
            "speech_detected": False,
            "speech_duration": 0.0,
            "speech_ratio": 0.0,
            "transcript_length": 0,
            "average_segment_length": 0.0,
            "segment_count": 0,
        }

    total_speech_sec = 0.0
    total_chars = 0
    clean_segments = 0

    non_speech_tokens = {
        "[music]", "[applause]", "[laughter]", "[cheering]",
        "[sound]", "[screaming]", "[silence]", "[noise]",
        "music", "applause"
    }

    for s in segments:
        text = str(s.get("text", "")).strip()
        cleaned_text = re.sub(r"[^\w\s]", "", text).strip().lower()
        if not cleaned_text or cleaned_text in non_speech_tokens:
            continue

        dur = max(0.2, float(s.get("end", 0.0)) - float(s.get("start", 0.0)))
        total_speech_sec += dur
        total_chars += len(text)
        clean_segments += 1

    speech_ratio = min(1.0, total_speech_sec / max(1.0, video_duration))
    avg_seg_len = total_speech_sec / max(1, clean_segments) if clean_segments > 0 else 0.0
    speech_detected = clean_segments > 0 and total_chars >= 20

    # Categorize input state
    if speech_ratio >= 0.15 and clean_segments >= 3 and total_chars >= 50:
        status = STATE_TRANSCRIPT_AVAILABLE
    elif speech_ratio >= 0.04 and clean_segments >= 1 and total_chars >= 20:
        status = STATE_TRANSCRIPT_PARTIAL
    else:
        status = STATE_NO_USEFUL_TRANSCRIPT

    return {
        "status": status,
        "speech_detected": speech_detected,
        "speech_duration": round(total_speech_sec, 2),
        "speech_ratio": round(speech_ratio, 3),
        "transcript_length": total_chars,
        "average_segment_length": round(avg_seg_len, 2),
        "segment_count": clean_segments,
    }


def get_adaptive_sample_interval(duration_seconds: float) -> float:
    """
    Scale sampling interval adaptively to keep CPU cost approximately constant
    regardless of video duration:
      < 10m  -> 2.5s
      10-30m -> 4.0s
      30-60m -> 6.0s
      > 60m  -> 10.0s
    """
    env_override = os.getenv("VIDEO_ANALYSIS_SAMPLE_INTERVAL")
    if env_override:
        try:
            return max(1.0, float(env_override))
        except ValueError:
            pass

    if duration_seconds < 600.0:        # < 10 mins
        return 2.5
    elif duration_seconds < 1800.0:     # 10 to 30 mins
        return 4.0
    elif duration_seconds < 3600.0:     # 30 to 60 mins
        return 6.0
    else:                               # > 60 mins
        return 10.0


def detect_local_visual_signals(
    video_path: str | Path,
    duration: float,
    sample_interval: float = 3.0,
    max_samples: int = 400
) -> List[Dict[str, float]]:
    """
    Detect local visual scene changes and frame transitions using cheap FFmpeg scene filter.
    Extracts timestamps where significant visual activity or scene cuts occur.
    Returns:
        [{"timestamp": float, "visual_score": float, "motion_score": float}, ...]
    """
    vpath = str(video_path)
    if not os.path.exists(vpath) or duration <= 0:
        return []

    signals: List[Dict[str, float]] = []

    # 1. Probe scene score metadata via FFmpeg select='gt(scene,0.15)'
    # Downscale to 160x90 and limit framerate to fps=1/sample_interval for lightning speed
    fps_val = f"1/{max(1.0, sample_interval)}"
    cmd = [
        "ffmpeg", "-hide_banner", "-v", "error",
        "-i", vpath,
        "-vf", f"fps={fps_val},scale=160:90,select='gt(scene,0.15)',metadata=print:key=lavfi.scene_score:file=-",
        "-f", "null", "-"
    ]

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
        output = proc.stdout + proc.stderr

        # Pattern matches:
        # frame:0    pts:120000 pts_time:12.0
        # lavfi.scene_score=0.345
        pts_matches = re.finditer(r"pts_time:([0-9.]+)", output)
        score_matches = re.finditer(r"lavfi\.scene_score=([0-9.]+)", output)

        pts_list = [float(m.group(1)) for m in pts_matches]
        score_list = [float(m.group(1)) for m in score_matches]

        for idx in range(min(len(pts_list), len(score_list))):
            ts = pts_list[idx]
            sc = min(1.0, max(0.0, score_list[idx]))
            if 0.0 <= ts <= duration:
                # Scene score drives visual activity, with a synthetic motion estimate
                signals.append({
                    "timestamp": round(ts, 2),
                    "visual_score": round(sc, 3),
                    "motion_score": round(min(1.0, sc * 1.2), 3)
                })
    except Exception as e:
        print(f"[Multimodal] FFmpeg scene detection notice: {e}")

    # Fallback / Baseline distribution if scene detection returned few points
    if len(signals) < 4 and duration > 30.0:
        # Generate evenly spaced baseline inspection points
        step = max(sample_interval * 2, duration / 12)
        curr = step
        while curr < duration - 15.0:
            signals.append({
                "timestamp": round(curr, 2),
                "visual_score": 0.5,
                "motion_score": 0.5
            })
            curr += step

    signals.sort(key=lambda s: s["timestamp"])
    return signals[:max_samples]


def detect_local_audio_signals(
    audio_or_video_path: str | Path,
    duration: float,
    has_audio: bool = True
) -> List[Dict[str, float]]:
    """
    Detect local audio energy spikes (volume increases, action bursts, gunshots, screams)
    using FFmpeg astats / volumedetect filter without third-party heavy dependencies.
    Returns:
        [{"timestamp": float, "audio_score": float}, ...]
    """
    if not has_audio or duration <= 0:
        return []

    path_str = str(audio_or_video_path)
    if not os.path.exists(path_str):
        return []

    audio_signals: List[Dict[str, float]] = []

    # Use FFmpeg silencedetect / volumedetect to identify loud intervals and transitions
    # silencedetect finds where audio transitions from quiet to loud
    cmd = [
        "ffmpeg", "-hide_banner", "-vn",
        "-i", path_str,
        "-af", "silencedetect=noise=-28dB:d=1.5",
        "-f", "null", "-"
    ]

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        output = proc.stdout + proc.stderr

        # Matches: [silencedetect @ ...] silence_end: 125.4 | silence_duration: 3.2
        end_matches = re.finditer(r"silence_end:\s*([0-9.]+)", output)
        for m in end_matches:
            ts = float(m.group(1))
            if 0.0 <= ts <= duration:
                # End of silence indicates sudden burst of sound/action
                audio_signals.append({
                    "timestamp": round(ts, 2),
                    "audio_score": 0.85
                })

        # Also probe overall mean and max volume
        max_vol_match = re.search(r"max_volume:\s*(-?[0-9.]+)\s*dB", output)
        if max_vol_match:
            max_db = float(max_vol_match.group(1))
            # Normalized score based on peak dB
            base_score = min(1.0, max(0.2, (max_db + 40.0) / 40.0))
        else:
            base_score = 0.5
    except Exception as e:
        print(f"[Multimodal] FFmpeg audio detection notice: {e}")
        base_score = 0.5

    # If silencedetect didn't find transitions (e.g. continuous audio / game music),
    # sample periodic energy points
    if not audio_signals and duration > 30.0:
        step = max(30.0, duration / 10)
        curr = step
        while curr < duration - 15.0:
            audio_signals.append({
                "timestamp": round(curr, 2),
                "audio_score": base_score
            })
            curr += step

    audio_signals.sort(key=lambda s: s["timestamp"])
    return audio_signals


def calculate_candidate_score(
    visual_score: float,
    motion_score: float,
    audio_score: float,
    transcript_score: float = 0.0,
    has_transcript: bool = False
) -> float:
    """Compute normalized composite candidate score with configurable weights."""
    if not has_transcript:
        w_v = DEFAULT_WEIGHT_VISUAL
        w_m = DEFAULT_WEIGHT_MOTION
        w_a = DEFAULT_WEIGHT_AUDIO
        total_w = w_v + w_m + w_a
        score = (w_v * visual_score + w_m * motion_score + w_a * audio_score) / max(0.01, total_w)
    else:
        w_v = 0.35
        w_m = 0.25
        w_a = 0.20
        w_t = DEFAULT_WEIGHT_TRANSCRIPT
        total_w = w_v + w_m + w_a + w_t
        score = (w_v * visual_score + w_m * motion_score + w_a * audio_score + w_t * transcript_score) / max(0.01, total_w)

    return round(min(10.0, max(1.0, score * 10.0)), 2)


def generate_candidate_windows(
    visual_signals: List[Dict[str, float]],
    audio_signals: List[Dict[str, float]],
    video_duration: float,
    min_clip_duration: float = 30.0,
    max_clip_duration: float = 60.0,
    merge_distance: float = 20.0,
    max_candidates: int = MAX_LLM_CANDIDATES,
    has_transcript: bool = False
) -> List[Dict[str, Any]]:
    """
    Fuse visual and audio signals, intelligently merge nearby events (e.g. 10:20, 10:25, 10:30
    become a single candidate window), bound timestamps, and rank the top candidate windows.
    """
    if video_duration <= 0.0:
        return []

    # Map timestamps to unified event map
    events: List[Dict[str, Any]] = []

    # Add visual signals
    for v in visual_signals:
        events.append({
            "timestamp": v["timestamp"],
            "visual_score": v.get("visual_score", 0.5),
            "motion_score": v.get("motion_score", 0.5),
            "audio_score": 0.3,
            "type": "visual"
        })

    # Add audio signals or boost nearby visual events
    for a in audio_signals:
        matched = False
        for ev in events:
            if abs(ev["timestamp"] - a["timestamp"]) <= 5.0:
                ev["audio_score"] = max(ev["audio_score"], a.get("audio_score", 0.7))
                matched = True
                break
        if not matched:
            events.append({
                "timestamp": a["timestamp"],
                "visual_score": 0.4,
                "motion_score": 0.4,
                "audio_score": a.get("audio_score", 0.8),
                "type": "audio"
            })

    if not events:
        # Default safety window if video is completely static
        mid = max(0.0, video_duration / 2.0)
        c_start = max(0.0, mid - 20.0)
        c_end = min(video_duration, c_start + 45.0)
        return [{
            "id": 1,
            "start": round(c_start, 2),
            "end": round(c_end, 2),
            "peak_time": round(mid, 2),
            "duration": round(c_end - c_start, 2),
            "score": 7.5,
            "signals": {"visual_score": 0.5, "motion_score": 0.5, "audio_score": 0.5}
        }]

    # Sort events chronologically
    events.sort(key=lambda e: e["timestamp"])

    # Cluster nearby events within merge_distance
    clusters: List[List[Dict[str, Any]]] = []
    current_cluster: List[Dict[str, Any]] = [events[0]]

    for ev in events[1:]:
        last_ev = current_cluster[-1]
        if ev["timestamp"] - last_ev["timestamp"] <= merge_distance:
            current_cluster.append(ev)
        else:
            clusters.append(current_cluster)
            current_cluster = [ev]
    if current_cluster:
        clusters.append(current_cluster)

    candidates: List[Dict[str, Any]] = []
    target_dur = max(min_clip_duration, min(45.0, max_clip_duration))

    for c_idx, cluster in enumerate(clusters, start=1):
        # Calculate cluster peak and strongest signals
        best_ev = max(cluster, key=lambda e: (e["visual_score"] + e["motion_score"] + e["audio_score"]))
        peak_t = best_ev["timestamp"]

        max_v = max(e["visual_score"] for e in cluster)
        max_m = max(e["motion_score"] for e in cluster)
        max_a = max(e["audio_score"] for e in cluster)

        composite_score = calculate_candidate_score(
            visual_score=max_v,
            motion_score=max_m,
            audio_score=max_a,
            has_transcript=has_transcript
        )

        # Build context window around peak event
        first_t = cluster[0]["timestamp"]
        last_t = cluster[-1]["timestamp"]
        cluster_span = last_t - first_t

        lead_in = max(10.0, (target_dur - cluster_span) / 2.0)
        start_t = max(0.0, first_t - lead_in)
        end_t = min(video_duration, start_t + target_dur)

        # Adjust start if end hit video boundary
        if end_t - start_t < min_clip_duration and video_duration >= min_clip_duration:
            start_t = max(0.0, end_t - min_clip_duration)

        dur = end_t - start_t
        if dur >= min(20.0, min_clip_duration):
            candidates.append({
                "id": c_idx,
                "start": round(start_t, 2),
                "end": round(end_t, 2),
                "peak_time": round(peak_t, 2),
                "duration": round(dur, 2),
                "score": composite_score,
                "signals": {
                    "visual_score": round(max_v, 2),
                    "motion_score": round(max_m, 2),
                    "audio_score": round(max_a, 2)
                }
            })

    # Sort by composite score descending
    candidates.sort(key=lambda c: c["score"], reverse=True)

    # IoU / Time Overlap Deduplication
    deduped: List[Dict[str, Any]] = []
    for cand in candidates:
        overlap = False
        for kept in deduped:
            s_max = max(cand["start"], kept["start"])
            e_min = min(cand["end"], kept["end"])
            intersection = max(0.0, e_min - s_max)
            union = max(0.01, (cand["end"] - cand["start"]) + (kept["end"] - kept["start"]) - intersection)
            iou = intersection / union
            if iou > 0.35:
                overlap = True
                break
        if not overlap:
            deduped.append(cand)
        if len(deduped) >= max_candidates:
            break

    # Re-index IDs cleanly
    for idx, c in enumerate(deduped, start=1):
        c["id"] = idx

    return deduped


def extract_sparse_candidate_frames(
    video_path: str | Path,
    candidate: Dict[str, Any],
    output_dir: str | Path,
    frame_count: int = FRAMES_PER_CANDIDATE,
    max_width: int = MAX_FRAME_WIDTH
) -> List[Dict[str, Any]]:
    """
    Extract 3-5 small, low-resolution representative JPEG frames around candidate peak event.
    Returns:
        [
            {"timestamp": float, "frame_path": str, "relative_offset": float},
            ...
        ]
    """
    vpath = str(video_path)
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    c_start = candidate["start"]
    c_end = candidate["end"]
    peak_t = candidate.get("peak_time", (c_start + c_end) / 2.0)
    dur = max(1.0, c_end - c_start)

    # Select representative points: before peak, at peak, and after peak
    count = max(2, min(6, frame_count))
    if count == 3:
        timestamps = [
            c_start + dur * 0.25,
            peak_t,
            c_start + dur * 0.75
        ]
    elif count == 4:
        timestamps = [
            c_start + dur * 0.15,
            max(c_start, peak_t - 4.0),
            peak_t,
            min(c_end, peak_t + 6.0)
        ]
    else:
        step = dur / (count + 1)
        timestamps = [c_start + step * (i + 1) for i in range(count)]

    # Deduplicate and sort
    timestamps = sorted(list(set(round(max(c_start, min(c_end, t)), 2) for t in timestamps)))

    cand_id = candidate.get("id", 1)
    extracted_frames: List[Dict[str, Any]] = []

    for f_idx, ts in enumerate(timestamps, start=1):
        frame_name = f"cand_{cand_id}_frame_{f_idx}_{int(ts*100)}ms.jpg"
        frame_file = out_dir / frame_name

        # Fast FFmpeg seek to timestamp and extract 1 scaled frame
        cmd = [
            "ffmpeg", "-hide_banner", "-v", "error", "-y",
            "-ss", f"{ts:.2f}",
            "-i", vpath,
            "-vframes", "1",
            "-vf", f"scale='min({max_width},iw)':-2",
            "-q:v", "5",  # High compression JPEG
            str(frame_file)
        ]

        try:
            subprocess.run(cmd, capture_output=True, timeout=15)
            if frame_file.exists() and frame_file.stat().st_size > 500:
                extracted_frames.append({
                    "timestamp": ts,
                    "frame_path": str(frame_file),
                    "relative_offset": round(ts - c_start, 2)
                })
        except Exception as e:
            print(f"[Multimodal] Frame extraction error at {ts}s: {e}")

    return extracted_frames


class MultimodalAnalysisCache:
    """Disk cache for video metadata, signal probes, and candidate pools."""

    def __init__(self, cache_dir: str | Path = "temp_downloads/cache"):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.version = "v1"

    def _compute_key(self, video_path_or_url: str, config_dict: Optional[Dict[str, Any]] = None) -> str:
        s = f"{self.version}:{video_path_or_url}"
        if config_dict:
            s += ":" + json.dumps(config_dict, sort_keys=True)
        return hashlib.sha256(s.encode("utf-8")).hexdigest()[:24]

    def get(self, video_path_or_url: str, config_dict: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        key = self._compute_key(video_path_or_url, config_dict)
        cache_file = self.cache_dir / f"{key}.json"
        if cache_file.exists():
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                return None
        return None

    def set(self, video_path_or_url: str, data: Dict[str, Any], config_dict: Optional[Dict[str, Any]] = None):
        key = self._compute_key(video_path_or_url, config_dict)
        cache_file = self.cache_dir / f"{key}.json"
        try:
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(data, f)
        except Exception as e:
            print(f"[MultimodalCache] Warning writing cache: {e}")


# Global cache instance
analysis_cache = MultimodalAnalysisCache()

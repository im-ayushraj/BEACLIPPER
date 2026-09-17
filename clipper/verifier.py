"""Context verification and timestamp alignment for standalone clips."""
from __future__ import annotations

import re
from typing import Dict, Any, List, Optional

CONTINUATION_WORDS = {
    "and", "but", "so", "because", "then", "or", "which",
    "also", "like", "with", "that", "where", "who", "when", "however"
}

SENTENCE_END_PUNCTUATION = (".", "?", "!", '."', '?"', '!"')


def is_sentence_start(text: str, prev_text: Optional[str] = None) -> bool:
    """Check if the text is likely the start of a new sentence."""
    clean = text.strip()
    if not clean:
        return False
    first_word = re.sub(r"[^\w]", "", clean.split()[0]).lower()
    if first_word in CONTINUATION_WORDS:
        return False
    if prev_text:
        prev_clean = prev_text.strip()
        if any(prev_clean.endswith(p) for p in SENTENCE_END_PUNCTUATION):
            return True
    return clean[0].isupper()


def is_sentence_end(text: str) -> bool:
    """Check if the text is likely the end of a sentence."""
    clean = text.strip()
    return any(clean.endswith(p) for p in SENTENCE_END_PUNCTUATION)


def find_nearest_segment_index(segments: List[Dict[str, Any]], target_time: float, key: str = "start") -> int:
    """Find index of segment closest to target_time."""
    best_idx = 0
    best_diff = float("inf")
    for idx, seg in enumerate(segments):
        diff = abs(seg[key] - target_time)
        if diff < best_diff:
            best_diff = diff
            best_idx = idx
    return best_idx


def verify_and_adjust_clip(
    candidate: Dict[str, Any],
    segments: List[Dict[str, Any]],
    video_duration: Optional[float] = None
) -> Optional[Dict[str, Any]]:
    """
    Verify and adjust candidate clip timestamps:
    - Ensure it does not start mid-sentence
    - Ensure the thought is complete
    - Enforce duration strictly between 30.0 and 60.0 seconds (prefer 40-55s)
    """
    if not segments:
        return None

    raw_start = float(candidate.get("start", 0.0))
    raw_end = float(candidate.get("end", 0.0))
    score = float(candidate.get("score", 5.0))
    reason = str(candidate.get("reason", "Interesting clip"))
    title = str(candidate.get("title", f"Clip at {int(raw_start)}s"))
    tags = candidate.get("tags", ["#shorts", "#podcast", "#viral"])
    explanation = str(candidate.get("explanation", reason))

    if raw_end <= raw_start:
        raw_end = raw_start + 45.0

    start_idx = find_nearest_segment_index(segments, raw_start, "start")
    end_idx = find_nearest_segment_index(segments, raw_end, "end")

    if end_idx < start_idx:
        end_idx = start_idx

    # 1. Adjust start: avoid starting mid-sentence or on continuation words
    if start_idx > 0:
        curr_text = segments[start_idx]["text"]
        prev_text = segments[start_idx - 1]["text"]
        if not is_sentence_start(curr_text, prev_text):
            # Check if moving back 1-2 segments finds a clean sentence start
            for back_step in range(1, 3):
                test_idx = start_idx - back_step
                if test_idx >= 0:
                    t_curr = segments[test_idx]["text"]
                    t_prev = segments[test_idx - 1]["text"] if test_idx > 0 else None
                    if is_sentence_start(t_curr, t_prev):
                        start_idx = test_idx
                        break

    # 2. Adjust end: try to end on a complete thought
    if end_idx < len(segments) - 1:
        curr_text = segments[end_idx]["text"]
        if not is_sentence_end(curr_text):
            # Look ahead 1-2 segments for a sentence conclusion
            for fwd_step in range(1, 3):
                test_idx = end_idx + fwd_step
                if test_idx < len(segments):
                    if is_sentence_end(segments[test_idx]["text"]):
                        end_idx = test_idx
                        break

    # Calculate initial aligned times
    clip_start = segments[start_idx]["start"]
    clip_end = segments[end_idx]["end"]
    duration = clip_end - clip_start

    # 3. Enforce 30.0s to 60.0s duration constraints
    # If too short (< 30s), expand forward then backward
    while duration < 30.0 and (end_idx < len(segments) - 1 or start_idx > 0):
        if end_idx < len(segments) - 1:
            end_idx += 1
            clip_end = segments[end_idx]["end"]
        elif start_idx > 0:
            start_idx -= 1
            clip_start = segments[start_idx]["start"]
        duration = clip_end - clip_start

    # If still under 30s (e.g. video is short or few segments), adjust start/end if video permits
    if duration < 30.0:
        needed = 30.0 - duration
        if video_duration:
            expand_end = min(video_duration, clip_end + needed)
            clip_end = expand_end
            duration = clip_end - clip_start
            if duration < 30.0 and clip_start > 0:
                clip_start = max(0.0, clip_start - (30.0 - duration))
                duration = clip_end - clip_start
        else:
            clip_end = clip_start + 30.0
            duration = 30.0

    # If too long (> 60s), trim along segment boundaries
    while duration > 60.0 and end_idx > start_idx:
        # Prefer trimming from the end if end is far, or from start
        end_idx -= 1
        clip_end = segments[end_idx]["end"]
        duration = clip_end - clip_start

    # If still slightly over 60s due to a single long segment, hard cap to 60.0s
    if duration > 60.0:
        clip_end = clip_start + 60.0
        duration = 60.0

    # Ensure strictly within [30.0, 60.0]
    duration = round(clip_end - clip_start, 2)
    if duration < 30.0 or duration > 60.0:
        # Final precision clamp
        if duration < 30.0:
            clip_end = round(clip_start + 30.0, 2)
        elif duration > 60.0:
            clip_end = round(clip_start + 60.0, 2)
        duration = round(clip_end - clip_start, 2)

    return {
        "start": round(clip_start, 2),
        "end": round(clip_end, 2),
        "duration": duration,
        "score": round(score, 2),
        "title": title,
        "tags": tags,
        "explanation": explanation,
        "reason": reason,
    }


def verify_all_candidates(
    candidates: List[Dict[str, Any]],
    segments: List[Dict[str, Any]],
    video_duration: Optional[float] = None
) -> List[Dict[str, Any]]:
    """Verify and adjust all candidate clips."""
    verified = []
    for cand in candidates:
        v = verify_and_adjust_clip(cand, segments, video_duration)
        if v and 30.0 <= v["duration"] <= 60.0:
            verified.append(v)
    return verified

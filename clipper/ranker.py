"""Ranking and Deduplication Module to select diverse clips across the entire video timeline."""
from __future__ import annotations

from typing import Dict, Any, List


def calculate_overlap_seconds(start1: float, end1: float, start2: float, end2: float) -> float:
    """Calculate the overlap between two time intervals in seconds."""
    overlap_start = max(start1, start2)
    overlap_end = min(end1, end2)
    return max(0.0, overlap_end - overlap_start)


def is_overlapping(
    clip1: Dict[str, Any],
    clip2: Dict[str, Any],
    max_overlap_seconds: float = 10.0,
    max_overlap_ratio: float = 0.25
) -> bool:
    """
    Check if two clips overlap significantly.
    Overlap is considered significant if:
    1. Overlap duration exceeds max_overlap_seconds (e.g. 10s), OR
    2. Overlap ratio relative to the shorter clip exceeds max_overlap_ratio (e.g. 25%).
    """
    s1, e1 = clip1["start"], clip1["end"]
    s2, e2 = clip2["start"], clip2["end"]

    overlap = calculate_overlap_seconds(s1, e1, s2, e2)
    if overlap <= 0.0:
        return False

    if overlap >= max_overlap_seconds:
        return True

    dur1 = max(1.0, e1 - s1)
    dur2 = max(1.0, e2 - s2)
    ratio = overlap / min(dur1, dur2)
    return ratio >= max_overlap_ratio


def rank_and_deduplicate(
    candidates: List[Dict[str, Any]],
    target_count: int = 10,
    max_overlap_seconds: float = 10.0,
    ensure_timeline_diversity: bool = True
) -> List[Dict[str, Any]]:
    """
    Sort candidates by score and timeline distribution to select up to target_count diverse,
    non-overlapping clips across the full duration of the video.
    """
    if not candidates:
        return []

    # Sort all candidates by score descending
    sorted_by_score = sorted(
        candidates,
        key=lambda c: (float(c.get("score", 0.0)), float(c.get("duration", 0.0))),
        reverse=True
    )

    selected: List[Dict[str, Any]] = []

    # If candidates span more than 15 minutes, apply timeline bucket diversity pass first
    min_time = min(c["start"] for c in candidates)
    max_time = max(c["end"] for c in candidates)
    total_span = max_time - min_time

    if ensure_timeline_diversity and total_span > 900.0 and len(candidates) >= target_count:
        num_buckets = min(target_count, max(4, int(total_span / 600.0)))  # bucket per ~10 mins
        bucket_size = total_span / num_buckets

        # Bucket candidates
        buckets: List[List[Dict[str, Any]]] = [[] for _ in range(num_buckets)]
        for cand in sorted_by_score:
            b_idx = min(num_buckets - 1, int((cand["start"] - min_time) / bucket_size))
            buckets[b_idx].append(cand)

        # Pick best from each bucket first
        for b in buckets:
            for cand in b:
                conflict = any(is_overlapping(cand, chosen, max_overlap_seconds=max_overlap_seconds) for chosen in selected)
                if not conflict:
                    selected.append(cand)
                    break
            if len(selected) >= target_count:
                break

    # Fill remaining slots with the highest scoring non-overlapping candidates
    for cand in sorted_by_score:
        if len(selected) >= target_count:
            break
        if cand in selected:
            continue
        conflict = any(is_overlapping(cand, chosen, max_overlap_seconds=max_overlap_seconds) for chosen in selected)
        if not conflict:
            selected.append(cand)

    # Sort final clips by score descending (or keep primary rank)
    final_selected = sorted(selected, key=lambda c: float(c.get("score", 0.0)), reverse=True)
    return final_selected[:target_count]

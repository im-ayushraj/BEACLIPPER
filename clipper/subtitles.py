"""
Viral Subtitle Generator: Produces Alex Hormozi / TikTok style dynamic ASS captions
with bold uppercase typography, high-contrast outlines, and electric highlight colors.
"""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import List, Dict, Any, Optional


def format_ass_time(seconds: float) -> str:
    """Format seconds into ASS timestamp format: H:MM:SS.cs (centiseconds)."""
    seconds = max(0.0, float(seconds))
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    centis = int(round((seconds - int(seconds)) * 100))
    if centis >= 100:
        centis = 99
    return f"{hours}:{minutes:02d}:{secs:02d}.{centis:02d}"


def chunk_text_into_punchy_lines(
    text: str,
    start: float,
    end: float,
    words_per_line: int = 3
) -> List[Dict[str, Any]]:
    """
    Splits long transcript segments into short, punchy 2-4 word bursts
    with proportional timing, creating the fast-paced viral caption rhythm.
    """
    cleaned = re.sub(r"\[.*?\]|\(.*?\)", "", text).strip()
    words = cleaned.split()
    if not words:
        return []

    if len(words) <= words_per_line:
        return [{"start": start, "end": end, "text": " ".join(words).upper()}]

    duration = max(0.4, end - start)
    chunks: List[Dict[str, Any]] = []
    num_words = len(words)

    i = 0
    while i < num_words:
        chunk_words = words[i : i + words_per_line]
        c_len = len(chunk_words)
        c_start = start + (i / num_words) * duration
        c_end = start + ((i + c_len) / num_words) * duration

        upper_words = [w.upper() for w in chunk_words]
        if len(upper_words) > 1:
            formatted_text = r"{\c&H0000FFFF&}" + upper_words[0] + r" {\c&H00FFFFFF&}" + " ".join(upper_words[1:])
        else:
            formatted_text = r"{\c&H0000FFFF&}" + upper_words[0]

        chunks.append({
            "start": round(c_start, 2),
            "end": round(c_end, 2),
            "text": formatted_text
        })
        i += words_per_line

    return chunks


def generate_ass_subtitles(
    segments: List[Dict[str, Any]],
    clip_start: float,
    clip_end: float,
    output_ass_path: str | Path,
    is_vertical: bool = False
) -> Optional[str]:
    """
    Extracts relevant transcript segments for a clip, relativizes timestamps to 00:00,
    and writes a stylized ASS (Advanced SubStation Alpha) subtitle file.
    Returns the string path to the created ASS file, or None if no transcript text matches.
    """
    out_path = Path(output_ass_path).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    overlapping: List[Dict[str, Any]] = []
    for s in segments:
        s_start = float(s.get("start", 0.0))
        s_end = float(s.get("end", s_start + 1.0))
        if s_end > clip_start and s_start < clip_end:
            rel_start = max(0.0, s_start - clip_start)
            rel_end = min(clip_end - clip_start, s_end - clip_start)
            if rel_end > rel_start + 0.1:
                overlapping.append({
                    "start": rel_start,
                    "end": rel_end,
                    "text": s.get("text", "").strip()
                })

    if not overlapping:
        return None

    events: List[Dict[str, Any]] = []
    for seg in overlapping:
        chunks = chunk_text_into_punchy_lines(seg["text"], seg["start"], seg["end"], words_per_line=3)
        events.extend(chunks)

    if not events:
        return None

    play_res_x = 1080 if is_vertical else 1920
    play_res_y = 1920 if is_vertical else 1080
    font_size = 52 if is_vertical else 38
    margin_v = 360 if is_vertical else 90

    ass_header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {play_res_x}
PlayResY: {play_res_y}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hormozi,Arial,{font_size},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,1,0,1,4.5,2.0,2,40,40,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    event_lines = []
    for ev in events:
        start_str = format_ass_time(ev["start"])
        end_str = format_ass_time(ev["end"])
        text = ev["text"]
        event_lines.append(f"Dialogue: 0,{start_str},{end_str},Hormozi,,0,0,0,,{text}")

    content = ass_header + "\n".join(event_lines) + "\n"

    try:
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(content)
        return str(out_path)
    except Exception as e:
        print(f"[Subtitles] Error writing ASS subtitle file: {e}")
        return None

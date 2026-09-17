"""Timestamped Transcript Generator supporting YouTube Transcript API and Gemini Audio STT fallback."""
from __future__ import annotations

import json
import os
import re
import warnings
from pathlib import Path
from typing import Dict, Any, List, Optional

warnings.filterwarnings("ignore", category=FutureWarning)

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
    YouTubeTranscriptApiException,
)


class TranscriptionError(Exception):
    """Raised when transcription fails across all methods."""
    pass


def parse_json_safely(text: str) -> Any:
    """Extract and parse JSON from LLM output, handling markdown fences."""
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        raw_json = match.group(1).strip()
    else:
        raw_json = text
    return json.loads(raw_json)


def fetch_youtube_transcript(video_id: str) -> List[Dict[str, Any]]:
    """
    Fetch transcript using youtube-transcript-api.
    Returns list of {'start': float, 'end': float, 'text': str}.
    """
    api = YouTubeTranscriptApi()
    transcript_data = None

    # First attempt: direct fetch in English
    try:
        fetched = api.fetch(video_id, languages=["en", "en-US", "en-GB"])
        transcript_data = fetched.to_raw_data()
    except Exception:
        pass

    # Second attempt: inspect transcript list for auto-generated or translatable
    if not transcript_data:
        try:
            transcript_list = api.list(video_id)
            # Find any english transcript
            t = None
            try:
                t = transcript_list.find_transcript(["en", "en-US", "en-GB"])
            except Exception:
                pass

            if not t:
                # Find any generated transcript
                try:
                    t = transcript_list.find_generated_transcript(["en", "en-US", "en-GB"])
                except Exception:
                    pass

            if not t:
                # Take first available and translate to English if translatable
                for candidate in transcript_list:
                    if candidate.is_translatable:
                        t = candidate.translate("en")
                        break
                    else:
                        t = candidate
                        break

            if t:
                transcript_data = t.fetch().to_raw_data()
        except Exception as e:
            raise TranscriptionError(f"YouTube transcript API failed: {str(e)}") from e

    if not transcript_data:
        raise TranscriptionError("No transcript could be retrieved from YouTube")

    segments: List[Dict[str, Any]] = []
    for item in transcript_data:
        start = round(float(item.get("start", 0.0)), 2)
        duration = float(item.get("duration", 0.0))
        end = round(start + duration, 2)
        text = str(item.get("text", "")).replace("\n", " ").strip()
        if text and text != "[Music]":
            segments.append({
                "start": start,
                "end": max(end, round(start + 0.5, 2)),
                "text": text,
            })

    return segments


def transcribe_audio_gemini(audio_path: str, api_key: str) -> List[Dict[str, Any]]:
    """
    Fallback audio transcription using Gemini 2.5 Flash multimodal capabilities.
    """
    import google.generativeai as genai

    genai.configure(api_key=api_key)
    audio_file = genai.upload_file(audio_path)
    try:
        model = genai.GenerativeModel("gemini-3.5-flash")
        prompt = (
            "Transcribe this entire audio file with accurate timestamps for each spoken segment. "
            "Return a STRICT JSON object with no commentary:\n"
            "{\n"
            '  "segments": [\n'
            '    {"start": float, "end": float, "text": string}\n'
            "  ]\n"
            "}\n"
            "Ensure timestamps accurately align with spoken words."
        )
        response = model.generate_content([prompt, audio_file])
        parsed = parse_json_safely(response.text)
        raw_segments = parsed.get("segments", [])
        segments = []
        for s in raw_segments:
            start = round(float(s["start"]), 2)
            end = round(float(s["end"]), 2)
            text = str(s["text"]).strip()
            if text:
                segments.append({"start": start, "end": max(end, round(start + 0.5, 2)), "text": text})
        return segments
    finally:
        try:
            audio_file.delete()
        except Exception:
            pass


def get_transcript(
    video_id: str,
    audio_path: Optional[str] = None,
    gemini_api_key: Optional[str] = None,
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Retrieve timestamped transcript for a video.
    Returns:
        {
            "segments": [
                {"start": float, "end": float, "text": str}
            ]
        }
    """
    # 1. Try YouTube captions first (fast and free)
    try:
        segments = fetch_youtube_transcript(video_id)
        if segments:
            return {"segments": segments}
    except Exception as e:
        print(f"[Transcriber] YouTube caption fetch failed: {e}")

    # 2. Fallback to Gemini audio transcription if audio exists and key provided
    key = gemini_api_key or os.getenv("GEMINI_API_KEY")
    if audio_path and os.path.exists(audio_path) and key:
        print(f"[Transcriber] Falling back to Gemini audio speech-to-text for {audio_path}...")
        try:
            segments = transcribe_audio_gemini(audio_path, key)
            if segments:
                return {"segments": segments}
        except Exception as e:
            print(f"[Transcriber] Gemini audio transcription error: {e}")

    raise TranscriptionError(
        f"Unable to transcribe video {video_id}. YouTube captions were not available "
        "and audio transcription fallback could not complete."
    )

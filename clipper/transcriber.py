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


def fetch_youtube_transcript_ytdlp(video_id: str) -> List[Dict[str, Any]]:
    """
    Fallback YouTube caption extractor using yt-dlp.
    Extracts official or auto-generated subtitles directly from YouTube.
    Bypasses IP restrictions and rate limits that block youtube-transcript-api.
    """
    import yt_dlp
    import requests
    from clipper.downloader import get_base_ydl_opts

    url = f"https://www.youtube.com/watch?v={video_id}"
    ydl_opts = get_base_ydl_opts()
    ydl_opts.update({
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
    })

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if not info:
                return []

            captions = info.get("subtitles") or {}
            auto_captions = info.get("automatic_captions") or {}

            # Priority languages
            priority_langs = ["en", "en-US", "en-GB", "en-IN", "hi", "hi-Latn"]
            target_track = None

            # Look in official subtitles first
            for lang in priority_langs:
                if lang in captions and captions[lang]:
                    target_track = captions[lang]
                    break

            # Look in auto-generated captions
            if not target_track:
                for lang in priority_langs:
                    if lang in auto_captions and auto_captions[lang]:
                        target_track = auto_captions[lang]
                        break

            # Fallback to whatever first language track exists
            if not target_track:
                if captions:
                    target_track = next(iter(captions.values()), None)
                elif auto_captions:
                    target_track = next(iter(auto_captions.values()), None)

            if not target_track:
                return []

            # Prefer json3 format (has exact timestamps and words)
            json3_fmt = next((f for f in target_track if f.get("ext") == "json3"), target_track[0])
            sub_url = json3_fmt.get("url")
            if not sub_url:
                return []

            resp = requests.get(sub_url, timeout=10)
            if resp.status_code != 200:
                return []

            data = resp.json()
            events = data.get("events", [])
            segments: List[Dict[str, Any]] = []

            for ev in events:
                if "segs" not in ev:
                    continue
                start_ms = ev.get("tStartMs", 0)
                dur_ms = ev.get("dDurationMs", 0)
                start = round(start_ms / 1000.0, 2)
                end = round((start_ms + dur_ms) / 1000.0, 2)
                text = "".join(s.get("utf8", "") for s in ev.get("segs", [])).replace("\n", " ").strip()
                if text and text != "[Music]":
                    segments.append({
                        "start": start,
                        "end": max(end, round(start + 0.5, 2)),
                        "text": text,
                    })

            return segments
    except Exception as e:
        print(f"[Transcriber] yt-dlp subtitle extraction notice: {e}")
        return []


def transcribe_audio_groq(audio_path: str, api_key: str) -> List[Dict[str, Any]]:
    """
    Ultra-fast audio transcription using Groq Whisper Large V3 Turbo.
    Processes audio at ~200x realtime speed (20m audio transcribes in ~3 seconds).
    """
    from groq import Groq

    client = Groq(api_key=api_key)
    with open(audio_path, "rb") as f:
        res = client.audio.transcriptions.create(
            file=f,
            model="whisper-large-v3-turbo",
            response_format="verbose_json"
        )

    segments: List[Dict[str, Any]] = []
    raw_segs = getattr(res, "segments", []) or []
    for s in raw_segs:
        start = round(float(s.get("start", 0.0)), 2)
        end = round(float(s.get("end", start + 1.0)), 2)
        text = str(s.get("text", "")).strip()
        if text:
            segments.append({
                "start": start,
                "end": max(end, round(start + 0.5, 2)),
                "text": text,
            })

    return segments


def transcribe_audio_gemini(audio_path: str, api_key: str) -> List[Dict[str, Any]]:
    """
    Audio transcription using Gemini multimodal capabilities with model fallbacks.
    """
    import google.generativeai as genai

    genai.configure(api_key=api_key)
    audio_file = genai.upload_file(audio_path)
    
    models_to_try = [
        "gemini-2.5-flash",
        "gemini-1.5-flash",
        "gemini-flash-latest",
        "gemini-2.0-flash",
    ]
    
    prompt = (
        "Transcribe this entire audio file with accurate timestamps for each spoken segment. "
        "Return a STRICT JSON object with no commentary:\n"
        "{\n"
        '  "segments": [\n'
        '    {"start": float, "end": float, "text": string}\n'
        '  ]\n'
        "}\n"
        "Ensure timestamps accurately align with spoken words."
    )

    SAFETY_SETTINGS = [
        {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
    ]

    last_err = None
    try:
        for model_name in models_to_try:
            try:
                model = genai.GenerativeModel(model_name)
                response = model.generate_content([prompt, audio_file], safety_settings=SAFETY_SETTINGS)
                res_text = ""
                try:
                    if hasattr(response, "text") and response.text:
                        res_text = response.text
                except Exception:
                    pass
                if not res_text and hasattr(response, "candidates") and response.candidates:
                    for cand in response.candidates:
                        if hasattr(cand, "content") and cand.content and cand.content.parts:
                            res_text = "".join(getattr(p, "text", "") for p in cand.content.parts if hasattr(p, "text"))
                            if res_text:
                                break

                parsed = parse_json_safely(res_text)
                raw_segments = parsed.get("segments", [])
                segments = []
                for s in raw_segments:
                    start = round(float(s["start"]), 2)
                    end = round(float(s["end"]), 2)
                    text = str(s["text"]).strip()
                    if text:
                        segments.append({"start": start, "end": max(end, round(start + 0.5, 2)), "text": text})
                if segments:
                    return segments
            except Exception as e:
                last_err = e
                continue
        if last_err:
            raise last_err
        return []
    finally:
        try:
            audio_file.delete()
        except Exception:
            pass


def get_transcript(
    video_id: str,
    audio_path: Optional[str] = None,
    gemini_api_key: Optional[str] = None,
    groq_api_key: Optional[str] = None,
    is_local_file: bool = False,
    video_path: Optional[str] = None,
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Retrieve timestamped transcript for a video (YouTube or local file).
    Attempts instant caption retrieval first; lazily extracts audio and uses
    ultra-fast Groq Whisper or Gemini fallback if captions are unavailable.
    Returns:
        {
            "segments": [
                {"start": float, "end": float, "text": str}
            ]
        }
    """
    # 1. For YouTube videos, try instant captions (youtube-transcript-api first, then yt-dlp)
    if not is_local_file and video_id and not video_id.startswith("upload_"):
        # 1A. Try standard YouTube Transcript API
        try:
            segments = fetch_youtube_transcript(video_id)
            if segments:
                return {"segments": segments}
        except Exception as e:
            print(f"[Transcriber] YouTube transcript API unavailable ({e}). Trying yt-dlp subtitle extraction...")

        # 1B. Try yt-dlp subtitle/caption extraction (bypasses IP blocks)
        try:
            segments = fetch_youtube_transcript_ytdlp(video_id)
            if segments:
                print(f"[Transcriber] Successfully extracted {len(segments)} caption segments via yt-dlp.")
                return {"segments": segments}
        except Exception as yt_err:
            print(f"[Transcriber] yt-dlp subtitle extraction notice: {yt_err}")

    # 2. If audio file does not exist yet but video_path is provided, extract audio on demand now
    if audio_path and not os.path.exists(audio_path) and video_path and os.path.exists(video_path):
        from clipper.downloader import extract_audio
        print(f"[Transcriber] Extracting audio on demand from {video_path}...")
        try:
            extract_audio(video_path, audio_path)
        except Exception as ex_err:
            print(f"[Transcriber] Lazy audio extraction error: {ex_err}")

    # 3. Transcribe audio using Groq Whisper Large V3 Turbo (Ultra-fast, ~1-3s)
    groq_key = groq_api_key or os.getenv("GROQ_API_KEY")
    if audio_path and os.path.exists(audio_path) and groq_key:
        print(f"[Transcriber] Using Groq Whisper Large V3 Turbo STT for {audio_path}...")
        try:
            segments = transcribe_audio_groq(audio_path, groq_key)
            if segments:
                return {"segments": segments}
        except Exception as gr_err:
            print(f"[Transcriber] Groq Whisper error: {gr_err}. Falling back to Gemini STT...")

    # 4. Transcribe audio using Gemini multimodal STT
    key = gemini_api_key or os.getenv("GEMINI_API_KEY")
    if audio_path and os.path.exists(audio_path) and key:
        print(f"[Transcriber] Using Gemini audio speech-to-text for {audio_path}...")
        try:
            segments = transcribe_audio_gemini(audio_path, key)
            if segments:
                return {"segments": segments}
        except Exception as e:
            print(f"[Transcriber] Gemini audio transcription error: {e}")

    raise TranscriptionError(
        f"Unable to transcribe video {video_id}. Captions and audio transcription fallback could not complete."
    )

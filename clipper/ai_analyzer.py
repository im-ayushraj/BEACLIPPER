"""AI Clip Selection Module with Whole-Video Windowing and Rich Metadata (Title, Tags, Explanation)."""
from __future__ import annotations

import json
import os
import re
import time
import warnings
from typing import Dict, Any, List, Optional, Callable
from dotenv import load_dotenv

warnings.filterwarnings("ignore", category=FutureWarning)
load_dotenv()


class AIAnalysisError(Exception):
    """Raised when LLM analysis or JSON parsing fails."""
    pass


SYSTEM_PROMPT = """You are an elite viral video editor, podcast producer, and content strategist specializing in YouTube Shorts, TikTok, and Reels.
Your task is to analyze a timestamped video transcript and identify the most compelling 30 to 60 second standalone clips.

Prioritize moments with:
1. Strong Hook: Grabs attention immediately in the first 3-5 seconds.
2. High Value: Useful information, surprising insight, or actionable advice.
3. Engaging Story: An entertaining anecdote, drama, or emotional payoff.
4. Complete Thought: Clear beginning and conclusion without trailing off.
5. Standalone Context: Makes complete sense without seeing the rest of the video.
6. Shareability: Highly engaging, controversial/strong opinion, or relatable.

For EVERY clip, you MUST provide:
- title: A punchy, click-worthy, viral short title (under 10 words, capitalized like a headline).
- tags: A JSON array of 3 to 6 relevant hashtags (e.g. ["#startups", "#mindset", "#success"]).
- explanation: A detailed 2-3 sentence explanation of the context, key insight, and why this works as a standalone piece.
- score: Rating from 1.0 to 10.0 based on retention and engagement potential.
- reason: Brief hook or viral trigger summary.
- start: Start timestamp in seconds (float).
- end: End timestamp in seconds (float).

STRICT CONSTRAINTS:
- Duration MUST be between 30.0 and 60.0 seconds (prefer 40.0 to 55.0 seconds when natural).
- Start timestamp MUST begin at the start of a clear sentence/hook (do not start mid-sentence).
- End timestamp MUST conclude a complete thought (do not cut off mid-sentence).

You MUST respond ONLY with a STRICT JSON array matching this exact schema:
[
  {
    "start": 100.5,
    "end": 151.2,
    "title": "The Brutal Truth About Overnight Success",
    "tags": ["#mindset", "#success", "#discipline", "#entrepreneur"],
    "explanation": "The speaker explains how decade-long persistence looks like overnight success from the outside. It delivers an empowering mindset shift that resonates with anyone striving for mastery.",
    "score": 9.6,
    "reason": "High emotional payoff and relatable hook about unseen struggle"
  }
]
No extra text, no conversational preamble or postscript. Only valid JSON.
"""


def normalize_candidate(cand: Dict[str, Any], transcript_fallback: str = "") -> Dict[str, Any]:
    """Ensure candidate has all required metadata fields with clean fallbacks."""
    start = round(float(cand.get("start", 0.0)), 2)
    end = round(float(cand.get("end", start + 45.0)), 2)
    score = round(float(cand.get("score", 7.5)), 2)
    reason = str(cand.get("reason", "Compelling viral moment")).strip()

    title = cand.get("title")
    if not title or not isinstance(title, str) or not title.strip():
        title = f"Key Insight at {int(start)}s"
    title = title.strip().strip('"').strip("'")

    tags = cand.get("tags")
    if not isinstance(tags, list) or not tags:
        tags = ["#shorts", "#podcast", "#viral", "#highlights"]
    else:
        # Normalize tags to start with '#'
        clean_tags = []
        for t in tags:
            tag_str = str(t).strip().replace(" ", "")
            if tag_str:
                if not tag_str.startswith("#"):
                    tag_str = f"#{tag_str}"
                clean_tags.append(tag_str)
        tags = clean_tags if clean_tags else ["#shorts", "#viral", "#podcast"]

    explanation = cand.get("explanation")
    if not explanation or not isinstance(explanation, str) or not explanation.strip():
        explanation = f"{reason}. This segment delivers a focused takeaway that functions independently as a short."
    explanation = explanation.strip()

    return {
        "start": start,
        "end": end,
        "duration": round(end - start, 2),
        "score": score,
        "title": title,
        "tags": tags,
        "explanation": explanation,
        "reason": reason,
    }


def clean_and_parse_json(raw_text: str) -> List[Dict[str, Any]]:
    """Robustly parse JSON response from LLM with multi-tier recovery."""
    cleaned = raw_text.strip()

    # Strip markdown fences if present
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
    if match:
        cleaned = match.group(1).strip()

    parsed_list: List[Dict[str, Any]] = []

    # Helper to clean trailing commas
    def _sanitize_json(s: str) -> str:
        return re.sub(r",\s*([\]\}])", r"\1", s)

    # 1. Try direct parse
    try:
        data = json.loads(_sanitize_json(cleaned))
        if isinstance(data, list):
            parsed_list = data
        elif isinstance(data, dict):
            for val in data.values():
                if isinstance(val, list):
                    parsed_list = val
                    break
    except Exception:
        pass

    # 2. Fallback: extract array substring [...]
    if not parsed_list:
        array_match = re.search(r"\[\s*\{[\s\S]*\}\s*\]", cleaned)
        if array_match:
            try:
                data = json.loads(_sanitize_json(array_match.group(0)))
                if isinstance(data, list):
                    parsed_list = data
            except Exception:
                pass

    # 3. Fallback: Repair truncated array [ ... { ... }
    if not parsed_list and "[" in cleaned:
        start_idx = cleaned.find("[")
        sub = cleaned[start_idx:]
        last_brace = sub.rfind("}")
        if last_brace != -1:
            candidate = sub[:last_brace + 1] + "]"
            try:
                data = json.loads(_sanitize_json(candidate))
                if isinstance(data, list):
                    parsed_list = data
            except Exception:
                pass

    # 4. Fallback: Extract individual JSON candidate objects { ... }
    if not parsed_list:
        obj_matches = re.finditer(r"\{[^{}]*\"start\"\s*:[^{}]*\"end\"\s*:[^{}]*\}", cleaned)
        for m in obj_matches:
            try:
                obj = json.loads(_sanitize_json(m.group(0)))
                if isinstance(obj, dict) and "start" in obj and "end" in obj:
                    parsed_list.append(obj)
            except Exception:
                continue

    if not parsed_list:
        safe_preview = raw_text[:300].encode("ascii", errors="replace").decode("ascii")
        raise AIAnalysisError(f"Failed to parse LLM response as JSON: {safe_preview}...")

    # Normalize all items
    normalized = []
    for item in parsed_list:
        if isinstance(item, dict) and "start" in item and "end" in item:
            normalized.append(normalize_candidate(item))

    return normalized


def format_transcript_for_prompt(segments: List[Dict[str, Any]]) -> str:
    """Format segments into compact timestamped lines: [start - end] text"""
    lines = []
    for s in segments:
        lines.append(f"[{s['start']:.1f} - {s['end']:.1f}] {s['text']}")
    return "\n".join(lines)


GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash-lite",
]


def extract_heuristic_candidate_moments(
    segments: List[Dict[str, Any]],
    target_count: int = 10
) -> List[Dict[str, Any]]:
    """
    Intelligent algorithmic moment extractor used as a resilient fallback
    when all external AI API quotas are temporarily exhausted.
    
    Identifies high-density, standalone narrative sections between 35 and 55 seconds
    distributed evenly across the video duration.
    """
    if not segments:
        return []

    total_duration = segments[-1]["end"] - segments[0]["start"]
    step_duration = max(40.0, total_duration / (target_count + 1))
    
    candidates: List[Dict[str, Any]] = []
    current_target_time = segments[0]["start"] + 10.0

    for i in range(target_count):
        if current_target_time >= segments[-1]["end"] - 30.0:
            break

        # Find starting segment near target time
        start_seg_idx = 0
        best_diff = float("inf")
        for idx, seg in enumerate(segments):
            if abs(seg["start"] - current_target_time) < best_diff:
                best_diff = abs(seg["start"] - current_target_time)
                start_seg_idx = idx

        # Look around for a clean sentence boundary (capitalized word or after period)
        adjusted_start_idx = start_seg_idx
        for offset in range(-3, 4):
            check_idx = start_seg_idx + offset
            if 0 <= check_idx < len(segments):
                txt = segments[check_idx]["text"].strip()
                if txt and txt[0].isupper() and (check_idx == 0 or segments[check_idx - 1]["text"].strip().endswith((".", "!", "?"))):
                    adjusted_start_idx = check_idx
                    break

        clip_start = segments[adjusted_start_idx]["start"]
        accum_text_list = []
        clip_end = clip_start + 45.0

        for idx in range(adjusted_start_idx, len(segments)):
            seg = segments[idx]
            accum_text_list.append(seg["text"].strip())
            dur = seg["end"] - clip_start
            if dur >= 35.0:
                if seg["text"].strip().endswith((".", "!", "?")) or dur >= 55.0:
                    clip_end = seg["end"]
                    break
                clip_end = seg["end"]

        duration = clip_end - clip_start
        if duration < 25.0:
            duration = min(45.0, segments[-1]["end"] - clip_start)
            clip_end = clip_start + duration

        full_text = " ".join(accum_text_list)
        words = full_text.split()
        
        # Derive a clean, punchy headline title from opening words
        if len(words) >= 5:
            raw_title = " ".join(words[:7]).capitalize()
            raw_title = re.sub(r"[^\w\s]", "", raw_title).strip()
            title = f"{raw_title}..."
        else:
            title = f"Key Insight #{i + 1}"

        candidates.append({
            "title": title,
            "tags": ["#ViralMoments", "#Highlights", "#Trending", "#MustWatch"],
            "explanation": f"High-density speech segment covering {int(duration)}s of core insights and narrative flow.",
            "score": round(8.8 + (i % 3) * 0.3, 1),
            "reason": "Strong verbal pacing, natural sentence boundaries, and complete standalone thought.",
            "start": round(clip_start, 2),
            "end": round(clip_end, 2)
        })

        current_target_time += step_duration

    return candidates


SAFETY_SETTINGS = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
]


def soften_transcript_prompt(prompt_text: str) -> str:
    """Mask extreme slurs or explicit vulgarities that trip API input safety filters on raw creator podcasts."""
    return re.sub(
        r"\b(fuck|fucking|fucker|motherfucker|shit|bitch|asshole|cunt|dick|chutiya|bhosdike|gaand|madarchod|behenchod|randi|lodu|choot)\b",
        "[bleep]",
        prompt_text,
        flags=re.IGNORECASE
    )


def extract_gemini_response_text(response: Any) -> str:
    """Safely extract text from Gemini response without throwing accessor errors on partial filter."""
    try:
        if hasattr(response, "text") and response.text:
            return response.text
    except Exception:
        pass
    try:
        if hasattr(response, "candidates") and response.candidates:
            for cand in response.candidates:
                if hasattr(cand, "content") and cand.content and cand.content.parts:
                    t = "".join(getattr(p, "text", "") for p in cand.content.parts if hasattr(p, "text"))
                    if t.strip():
                        return t
    except Exception:
        pass
    return ""


GROQ_MODELS = [
    "openai/gpt-oss-120b",
    "llama-3.3-70b-versatile",
    "openai/gpt-oss-20b",
    "llama-3.1-8b-instant",
    "qwen/qwen3.8-27b",
    "groq/compound",
]


def query_llm(
    prompt: str,
    gemini_key: Optional[str] = None,
    openai_key: Optional[str] = None,
    groq_key: Optional[str] = None,
    metrics_collector: Optional[Dict[str, Any]] = None
) -> str:
    """Send prompt to available LLM provider with Groq high-speed priority, Gemini cascade, and rate-limit retry."""
    gr_key = groq_key or os.getenv("GROQ_API_KEY")
    g_key = gemini_key or os.getenv("GEMINI_API_KEY")
    o_key = openai_key or os.getenv("OPENAI_API_KEY")

    if metrics_collector is not None:
        metrics_collector["llm_calls"] = metrics_collector.get("llm_calls", 0) + 1

    # 1. Groq Ultra-fast LPU inference (sub-second response, podcast-friendly)
    if gr_key:
        try:
            from groq import Groq
            groq_client = Groq(api_key=gr_key)
            for model_name in GROQ_MODELS:
                try:
                    response = groq_client.chat.completions.create(
                        model=model_name,
                        messages=[
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {"role": "user", "content": prompt}
                        ],
                        temperature=0.3,
                    )
                    content = response.choices[0].message.content
                    if content and content.strip():
                        print(f"[AI Analyzer] Successfully analyzed transcript via Groq ({model_name}) in sub-second time.")
                        return content
                except Exception as gr_err:
                    print(f"[AI Analyzer] Groq ({model_name}) notice: {gr_err}")
                    continue
        except Exception as e:
            print(f"[AI Analyzer] Groq integration warning: {e}")

    # 2. Google Gemini with BLOCK_NONE safety settings & prompt softening
    if g_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=g_key)

            for model_name in GEMINI_MODELS:
                for attempt in range(2):
                    if attempt > 0 and metrics_collector is not None:
                        metrics_collector["retries"] = metrics_collector.get("retries", 0) + 1
                    try:
                        model = genai.GenerativeModel(
                            model_name=model_name,
                            system_instruction=SYSTEM_PROMPT
                        )
                        active_prompt = prompt if attempt == 0 else soften_transcript_prompt(prompt)
                        response = model.generate_content(
                            active_prompt,
                            generation_config={"temperature": 0.3},
                            safety_settings=SAFETY_SETTINGS
                        )
                        res_text = extract_gemini_response_text(response)
                        if res_text and res_text.strip():
                            return res_text
                        
                        # Check prompt feedback for blocked content
                        feedback = getattr(response, "prompt_feedback", None)
                        if feedback and getattr(feedback, "block_reason", None):
                            print(f"[AI Analyzer] Prompt blocked by Gemini safety ({feedback.block_reason}). Retrying with sanitized prompt...")
                            continue
                    except Exception as e:
                        err_str = str(e).lower()
                        if "prohibited_content" in err_str or "block_reason" in err_str or "empty" in err_str:
                            if attempt == 0:
                                print(f"[AI Analyzer] Model {model_name} filtered raw transcript. Retrying with softened prompt...")
                                continue
                            break
                        elif "429" in err_str or "quota" in err_str or "resourceexhausted" in err_str:
                            if attempt == 0:
                                time.sleep(2.0)
                                continue
                            print(f"[AI Analyzer] Model {model_name} quota/rate limit hit. Trying next model...")
                            break
                        elif "404" in err_str or "not found" in err_str or "no longer available" in err_str:
                            break
                        else:
                            print(f"[AI Analyzer] Error querying {model_name}: {e}")
                            break
        except Exception as e:
            print(f"[AI Analyzer] Gemini cascade warning: {e}")

    # 3. OpenAI GPT-4o-mini Fallback
    if o_key:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=o_key)
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3
            )
            return response.choices[0].message.content or "[]"
        except Exception as e:
            print(f"[AI Analyzer] OpenAI query error: {e}")

    raise AIAnalysisError("All LLM providers and models exhausted or unavailable.")


def analyze_transcript_window(
    window_segments: List[Dict[str, Any]],
    target_count: int = 3,
    gemini_key: Optional[str] = None,
    openai_key: Optional[str] = None,
    groq_key: Optional[str] = None,
    metrics_collector: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """Analyze a single segment window for top standalone moments."""
    if not window_segments:
        return []

    transcript_text = format_transcript_for_prompt(window_segments)
    prompt = (
        f"Here is the timestamped transcript of this section ({window_segments[0]['start']:.1f}s to {window_segments[-1]['end']:.1f}s):\n\n"
        f"{transcript_text}\n\n"
        f"Identify the top {target_count} best standalone viral moments (30 to 60 seconds each) from this section. "
        "Include title, tags, explanation, score, reason, start, and end. "
        "Return STRICT JSON array only."
    )
    raw_response = query_llm(prompt, gemini_key, openai_key, groq_key=groq_key, metrics_collector=metrics_collector)
    return clean_and_parse_json(raw_response)


def find_important_moments(
    segments: List[Dict[str, Any]],
    gemini_key: Optional[str] = None,
    openai_key: Optional[str] = None,
    groq_key: Optional[str] = None,
    target_clip_count: int = 10,
    progress_callback: Optional[Callable[[str], None]] = None,
    metrics_collector: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Analyze whole video transcript across the entire timeline.
    Supports ultra-fast Groq LPU inference, Gemini cascade, single-pass analysis for short videos,
    batch window scanning for longer videos, and automatic fallback to heuristic algorithmic extraction.
    """
    if not segments:
        raise AIAnalysisError("Cannot analyze empty transcript segments")

    total_start = segments[0]["start"]
    total_end = segments[-1]["end"]
    total_duration = total_end - total_start

    # If duration is 15 minutes or less, analyze directly in a single comprehensive pass
    if total_duration <= 900.0:
        if progress_callback:
            progress_callback("AI scanning full transcript for viral moments...")
        transcript_text = format_transcript_for_prompt(segments)
        max_possible_clips = max(1, int(total_duration / 30.0))
        requested_count = min(max_possible_clips, max(3, target_clip_count + 2))
        prompt = (
            "Here is the timestamped transcript of the video:\n\n"
            f"{transcript_text}\n\n"
            f"Identify the top {requested_count} best standalone moments (30 to 60 seconds each) "
            "spread across the entire video. "
            "For each clip provide title, tags, explanation, score, reason, start, and end. "
            "Return STRICT JSON array only."
        )
        try:
            raw_response = query_llm(prompt, gemini_key, openai_key, groq_key=groq_key, metrics_collector=metrics_collector)
            candidates = clean_and_parse_json(raw_response)
            if candidates:
                return candidates
        except Exception as e:
            safe_e = str(e).encode("ascii", errors="replace").decode("ascii")
            print(f"[AI Analyzer] Single-pass LLM query notice: {safe_e}. Falling back to Heuristic Extractor.")

        if progress_callback:
            progress_callback("Using intelligent transcript analysis to extract standalone moments...")
        return extract_heuristic_candidate_moments(segments, target_clip_count)

    # For videos between 15m and 35m, partition into 2-3 timeline windows
    window_size = 720.0   # 12 minutes per window
    overlap = 90.0        # 1.5 minutes overlap
    step = window_size - overlap

    windows: List[List[Dict[str, Any]]] = []
    curr_start = total_start
    while curr_start < total_end:
        curr_end = curr_start + window_size
        w_segs = [s for s in segments if s["end"] >= curr_start and s["start"] <= curr_end]
        if w_segs:
            windows.append(w_segs)
        curr_start += step

    if progress_callback:
        progress_callback(f"Divided {int(total_duration/60)}m video into {len(windows)} timeline windows for whole-video scanning...")

    all_candidates: List[Dict[str, Any]] = []
    cands_per_window = max(2, (target_clip_count + len(windows) - 1) // len(windows) + 1)

    for i, w_segs in enumerate(windows, start=1):
        w_start_min = int(w_segs[0]["start"] / 60)
        w_end_min = int(w_segs[-1]["end"] / 60)
        if progress_callback:
            progress_callback(f"Scanning window {i}/{len(windows)} [{w_start_min}m - {w_end_min}m] for viral moments...")

        try:
            window_candidates = analyze_transcript_window(
                window_segments=w_segs,
                target_count=cands_per_window,
                gemini_key=gemini_key,
                openai_key=openai_key,
                groq_key=groq_key,
                metrics_collector=metrics_collector
            )
            all_candidates.extend(window_candidates)
            # Brief pause between window queries to stay safely under RPM limits
            time.sleep(1.5)
        except Exception as e:
            print(f"[AI Analyzer] Window {i} analysis warning: {e}")

    # Ultimate Safety Net: If all AI queries failed or were rate-limited, use heuristic extraction
    if not all_candidates:
        print("[AI Analyzer] LLM returned no candidates or quota exhausted. Activating Heuristic Moment Extractor.")
        if progress_callback:
            progress_callback("AI quota limit reached — activating intelligent transcript heuristic extractor...")
        all_candidates = extract_heuristic_candidate_moments(segments, target_clip_count)

    if not all_candidates:
        raise AIAnalysisError("No candidate moments could be extracted from transcript")

    return all_candidates


# =========================================================================
# MULTIMODAL VIDEO INTELLIGENCE (NON-SPEECH / ACTION / GAMEPLAY / GUIDED)
# =========================================================================

from pydantic import BaseModel, Field


class VisualCandidateItem(BaseModel):
    """Pydantic validated visual candidate item returned by Gemini Vision."""
    id: int
    interesting: bool = True
    score: float = Field(default=8.0, ge=1.0, le=10.0)
    event_type: str = "highlight"
    title: str = "Key Action Moment"
    tags: List[str] = Field(default_factory=lambda: ["#shorts", "#highlights", "#viral"])
    reason: str = "Compelling visual activity and pacing"
    start_offset: float = Field(default=0.0, ge=0.0)
    end_offset: float = Field(default=45.0, ge=0.0)


class BatchedVisualCandidatesResponse(BaseModel):
    """Container for batched visual candidate responses."""
    candidates: List[VisualCandidateItem] = Field(default_factory=list)


def parse_guided_instruction_with_groq(
    instruction: Optional[str] = None,
    preset: Optional[str] = None,
    groq_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    Parse user natural-language instructions & presets into structured search criteria
    using Groq's ultra-fast LPU inference (sub-300ms).
    """
    preset_str = str(preset or "").strip().lower()
    clean_instr = str(instruction or "").strip()

    preset_rules = {
        "funny": "Prioritize comedy, unexpected fails, hilarious NPC reactions, and comedic timing.",
        "action": "Prioritize high-adrenaline combat, explosions, high-speed chases, and intense gameplay.",
        "unexpected": "Prioritize plot twists, rare events, bizarre occurrences, and surprising reactions.",
        "fails": "Prioritize catastrophic blunders, vehicle wipeouts, missed shots, and epic losses.",
        "wins": "Prioritize clutch victories, flawless plays, impossible shots, and legendary wins.",
        "explosions": "Prioritize massive detonations, chaotic destruction, and fireball impacts.",
        "car crashes": "Prioritize high-speed vehicle collisions, multi-car pileups, and flips.",
        "story": "Prioritize narrative turning points, dramatic cutscenes, and lore moments.",
        "viral": "Prioritize maximum curiosity gap, hook potential, and shareable highlights."
    }

    base_rule = preset_rules.get(preset_str, "Identify the most engaging and viral standalone moments.")
    combined_focus = f"{base_rule} {clean_instr}".strip()

    gr_key = groq_key or os.getenv("GROQ_API_KEY")
    if gr_key and (clean_instr or preset_str):
        try:
            from groq import Groq
            client = Groq(api_key=gr_key)
            prompt = (
                f"You are a short-form video creative director. Convert this clipping directive into structured JSON guidelines:\n"
                f"Preset: {preset or 'Custom'}\n"
                f"Instruction: {clean_instr or 'Auto'}\n\n"
                f"Output a JSON object with:\n"
                f"- 'summary': 1-sentence focus summary\n"
                f"- 'keywords': 3-5 visual keywords to look for\n"
                f"- 'tone': tone of the short (e.g. comedic, intense, epic)\n"
                f"Return JSON ONLY."
            )
            for m in ("llama-3.1-8b-instant", "llama-3.3-70b-versatile"):
                try:
                    resp = client.chat.completions.create(
                        model=m,
                        messages=[{"role": "user", "content": prompt}],
                        temperature=0.2,
                        max_tokens=200
                    )
                    txt = resp.choices[0].message.content or ""
                    match = re.search(r"\{[\s\S]*\}", txt)
                    if match:
                        data = json.loads(match.group(0))
                        data["preset"] = preset or "Custom"
                        data["combined_focus"] = combined_focus
                        return data
                except Exception:
                    continue
        except Exception as e:
            print(f"[AI Analyzer] Groq guided parsing notice: {e}")

    # Fallback structured guideline
    return {
        "preset": preset or "Custom",
        "summary": f"[{preset or 'Custom'}] {combined_focus}",
        "keywords": [preset_str or "highlights", "action", "viral"],
        "tone": preset_str or "engaging",
        "combined_focus": combined_focus
    }


def clamp_and_validate_candidate_boundaries(
    cand: Dict[str, Any],
    eval_item: Optional[VisualCandidateItem] = None,
    min_duration: float = 30.0,
    max_duration: float = 60.0,
    video_duration: Optional[float] = None
) -> Dict[str, Any]:
    """
    Strictly validate and clamp candidate boundaries.
    The LLM is mathematically prevented from inventing timestamps outside the candidate window:
    candidate_start <= clip_start < clip_end <= candidate_end.
    """
    cand_start = float(cand.get("start", 0.0))
    cand_end = float(cand.get("end", cand_start + 45.0))
    cand_dur = max(1.0, cand_end - cand_start)

    if eval_item is not None:
        start_off = float(eval_item.start_offset)
        end_off = float(eval_item.end_offset)

        # Clamping start within candidate
        c_start = cand_start + min(cand_dur - 15.0, max(0.0, start_off))
        # Clamping end within candidate
        c_end = cand_start + min(cand_dur, max(c_start - cand_start + 20.0, end_off))
    else:
        c_start = cand_start
        c_end = cand_end

    # Enforce minimum duration
    if c_end - c_start < min_duration:
        needed = min_duration - (c_end - c_start)
        # Expand left if possible
        room_left = c_start - cand_start
        exp_left = min(room_left, needed / 2.0)
        c_start -= exp_left
        needed -= exp_left
        # Expand right
        room_right = cand_end - c_end
        exp_right = min(room_right, needed)
        c_end += exp_right

        # If candidate window itself was shorter than min_duration, expand safely into video bounds
        if c_end - c_start < min_duration and video_duration:
            extra = min_duration - (c_end - c_start)
            c_start = max(0.0, c_start - extra / 2.0)
            c_end = min(video_duration, c_start + min_duration)

    # Enforce maximum duration
    if c_end - c_start > max_duration:
        c_end = c_start + max_duration

    if video_duration:
        c_start = max(0.0, min(video_duration - 10.0, c_start))
        c_end = min(video_duration, c_end)

    final_dur = round(max(5.0, c_end - c_start), 2)
    return {
        "start": round(c_start, 2),
        "end": round(c_end, 2),
        "duration": final_dur
    }


def generate_fallback_multimodal_candidates(
    candidates: List[Dict[str, Any]],
    preset: Optional[str] = None,
    target_count: int = 10,
    video_title: str = "Video"
) -> List[Dict[str, Any]]:
    """
    Resilient local fallback when Gemini vision quota is exhausted or unavailable.
    Synthesizes rich titles, tags, and reasons from local visual/audio signals.
    """
    preset_title_map = {
        "funny": "Hilarious Gameplay Moment",
        "action": "Insane Action Sequence",
        "unexpected": "Unbelievable Shocking Turn",
        "fails": "Massive Epic Fail",
        "wins": "Legendary Clutch Victory",
        "explosions": "Catastrophic Explosion",
        "car crashes": "High Speed Crash",
        "story": "Epic Narrative Highlight",
    }
    base_title = preset_title_map.get(str(preset or "").lower(), "Top Highlight Moment")

    results: List[Dict[str, Any]] = []
    for idx, cand in enumerate(candidates[:target_count], start=1):
        c_start = cand["start"]
        c_end = cand["end"]
        sig = cand.get("signals", {})
        v_score = sig.get("visual_score", 0.7)
        a_score = sig.get("audio_score", 0.7)

        title = f"{base_title} #{idx} at {int(c_start)}s"
        tags = ["#shorts", "#gaming", f"#{preset or 'highlights'}", "#viral", "#clips"]
        explanation = (
            f"High-intensity moment detected with {int(v_score * 100)}% visual change and "
            f"{int(a_score * 100)}% audio energy. Functions as a standalone high-retention short."
        )

        results.append({
            "start": round(c_start, 2),
            "end": round(c_end, 2),
            "duration": round(c_end - c_start, 2),
            "score": round(cand.get("score", 8.2), 2),
            "title": title,
            "tags": tags,
            "explanation": explanation,
            "reason": f"Detected peak visual and sound activity around {int(cand.get('peak_time', c_start))}s",
        })

    return results


def analyze_multimodal_candidates_batched(
    candidates: List[Dict[str, Any]],
    candidate_frames_map: Dict[int, List[Dict[str, Any]]],
    video_duration: float,
    guided_instruction: Optional[str] = None,
    preset: Optional[str] = None,
    target_count: int = 10,
    gemini_key: Optional[str] = None,
    groq_key: Optional[str] = None,
    min_duration: float = 30.0,
    max_duration: float = 60.0,
    progress_callback: Optional[Callable[[str], None]] = None,
    metrics_collector: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Single-batched Gemini Vision evaluation for candidate windows.
    Takes local candidate windows and their sparse JPEG frames (3-5 frames per candidate),
    sends ONE batched multimodal request to Gemini, validates strict JSON output with Pydantic,
    strictly clamps timestamps to candidate windows, and falls back gracefully to local ranking.
    """
    if not candidates:
        return []

    # 1. Parse guided instructions with Groq LPU engine (< 300ms)
    guided_info = parse_guided_instruction_with_groq(guided_instruction, preset, groq_key=groq_key)
    focus_directive = guided_info.get("combined_focus", "Find the most exciting standalone viral moments.")

    g_key = gemini_key or os.getenv("GEMINI_API_KEY")

    # If no Gemini API key is available, activate local fallback immediately
    if not g_key:
        print("[AI Analyzer] Gemini API key not set — activating local multimodal candidate ranking.")
        if progress_callback:
            progress_callback("Selecting top candidate moments using local visual & audio intelligence...")
        return generate_fallback_multimodal_candidates(candidates, preset, target_count)

    # 2. Batch candidates (max 10 candidates per batch, maximum 2 batches total)
    batch_size = 10
    batches = [candidates[i:i + batch_size] for i in range(0, min(len(candidates), 20), batch_size)]
    if not batches:
        batches = [candidates]

    evaluated_clips: List[Dict[str, Any]] = []

    try:
        import google.generativeai as genai
        from PIL import Image

        genai.configure(api_key=g_key)
        vision_models = GEMINI_MODELS

        for b_idx, batch_cands in enumerate(batches, start=1):
            if progress_callback:
                progress_callback(f"Gemini evaluating visual batch {b_idx}/{len(batches)} ({len(batch_cands)} candidate moments)...")

            if metrics_collector is not None:
                metrics_collector["llm_calls"] = metrics_collector.get("llm_calls", 0) + 1

            # Prepare structured prompt and image contents
            cand_summaries = []
            for c in batch_cands:
                sig = c.get("signals", {})
                cand_summaries.append(
                    f"- Candidate #{c['id']}: window [{c['start']}s to {c['end']}s] "
                    f"(visual_score={sig.get('visual_score', 0.5)}, audio_score={sig.get('audio_score', 0.5)})"
                )

            prompt_text = (
                f"You are an elite short-form video editor for YouTube Shorts, TikTok, and Reels.\n"
                f"Analyze the attached visual frames for {len(batch_cands)} candidate video moments.\n"
                f"Directives: {focus_directive}\n\n"
                f"Candidate Windows:\n" + "\n".join(cand_summaries) + "\n\n"
                f"STRICT SCHEMA REQUIREMENTS:\n"
                f"Return a STRICT JSON object matching this schema:\n"
                f"{{\n"
                f'  "candidates": [\n'
                f'    {{\n'
                f'      "id": int (must match candidate ID),\n'
                f'      "interesting": bool,\n'
                f'      "score": float (1.0 to 10.0),\n'
                f'      "event_type": string (e.g. "action", "funny", "fail", "win", "stunt"),\n'
                f'      "title": string (punchy viral headline title under 8 words),\n'
                f'      "tags": [string] (3-5 viral hashtags like "#shorts", "#gaming"),\n'
                f'      "reason": string (why this moment works as a short),\n'
                f'      "start_offset": float (seconds from candidate start to begin the clip),\n'
                f'      "end_offset": float (seconds from candidate start to end the clip)\n'
                f'    }}\n'
                f'  ]\n'
                f"}}\n"
                f"Strictly constrain clip duration (end_offset - start_offset) between {min_duration} and {max_duration} seconds.\n"
                f"Only valid JSON. No conversational preamble."
            )

            # Assemble content parts: prompt text followed by labeled PIL images
            content_parts: List[Any] = [prompt_text]
            total_frames_in_batch = 0

            for c in batch_cands:
                c_id = c["id"]
                frames = candidate_frames_map.get(c_id, [])
                if frames:
                    content_parts.append(f"\n--- Frames for Candidate #{c_id} ({c['start']}s - {c['end']}s) ---")
                    for fr in frames:
                        f_path = fr.get("frame_path")
                        if f_path and os.path.exists(f_path):
                            try:
                                pil_img = Image.open(f_path)
                                content_parts.append(pil_img)
                                total_frames_in_batch += 1
                            except Exception as img_err:
                                print(f"[AI Analyzer] Warning loading image {f_path}: {img_err}")

            if metrics_collector is not None:
                metrics_collector["frames_analyzed"] = metrics_collector.get("frames_analyzed", 0) + total_frames_in_batch

            # Query Gemini Vision with model cascade
            batch_success = False
            for model_name in vision_models:
                try:
                    model = genai.GenerativeModel(
                        model_name=model_name,
                        system_instruction="You are an expert AI video clipper analyzing visual gameplay and action frames."
                    )
                    resp = model.generate_content(
                        content_parts,
                        generation_config={"temperature": 0.25},
                        safety_settings=SAFETY_SETTINGS
                    )
                    res_text = extract_gemini_response_text(resp)
                    if not res_text or not res_text.strip():
                        continue

                    # Parse JSON
                    parsed_raw = clean_and_parse_json(res_text)
                    if not parsed_raw:
                        continue

                    # Validate with Pydantic
                    items_by_id = {}
                    for item_dict in parsed_raw:
                        try:
                            v_item = VisualCandidateItem(**item_dict)
                            items_by_id[v_item.id] = v_item
                        except Exception:
                            # Direct key extraction fallback
                            c_id = int(item_dict.get("id", item_dict.get("candidate_id", 0)))
                            if c_id > 0:
                                items_by_id[c_id] = VisualCandidateItem(
                                    id=c_id,
                                    title=str(item_dict.get("title", f"Moment #{c_id}")),
                                    score=float(item_dict.get("score", 8.0)),
                                    tags=list(item_dict.get("tags", ["#shorts", "#gaming"])),
                                    reason=str(item_dict.get("reason", "Engaging visual action")),
                                    start_offset=float(item_dict.get("start_offset", 0.0)),
                                    end_offset=float(item_dict.get("end_offset", 45.0)),
                                )

                    # Clamp timestamps and construct final candidate dictionaries
                    for c in batch_cands:
                        v_eval = items_by_id.get(c["id"])
                        clamped = clamp_and_validate_candidate_boundaries(
                            cand=c,
                            eval_item=v_eval,
                            min_duration=min_duration,
                            max_duration=max_duration,
                            video_duration=video_duration
                        )

                        if v_eval:
                            title = v_eval.title
                            tags = v_eval.tags
                            reason = v_eval.reason
                            score = v_eval.score
                        else:
                            title = f"Action Highlight at {int(clamped['start'])}s"
                            tags = ["#shorts", "#viral", "#gaming", f"#{preset or 'highlights'}"]
                            reason = "High visual activity and dynamic motion"
                            score = float(c.get("score", 8.0))

                        explanation = (
                            f"{reason}. This {int(clamped['duration'])}s visual segment delivers "
                            f"continuous pacing and high engagement as a standalone short."
                        )

                        evaluated_clips.append({
                            "start": clamped["start"],
                            "end": clamped["end"],
                            "duration": clamped["duration"],
                            "score": round(score, 2),
                            "title": title,
                            "tags": tags,
                            "explanation": explanation,
                            "reason": reason,
                            "signals": c.get("signals", {})
                        })

                    batch_success = True
                    break
                except Exception as m_err:
                    print(f"[AI Analyzer] Gemini Vision query notice for {model_name}: {m_err}")
                    continue

            if not batch_success:
                print(f"[AI Analyzer] Vision query for batch {b_idx} failed across models. Using local signal fallback for this batch.")
                fallback_batch = generate_fallback_multimodal_candidates(batch_cands, preset, len(batch_cands))
                evaluated_clips.extend(fallback_batch)

    except Exception as e:
        print(f"[AI Analyzer] Gemini Vision pipeline error: {e}. Falling back to local candidate ranking.")
        if progress_callback:
            progress_callback("AI vision limit reached — using local candidate intelligence fallback...")
        return generate_fallback_multimodal_candidates(candidates, preset, target_count)

    if not evaluated_clips:
        return generate_fallback_multimodal_candidates(candidates, preset, target_count)

    # Sort final clips by score descending
    evaluated_clips.sort(key=lambda x: x["score"], reverse=True)
    return evaluated_clips[:target_count]


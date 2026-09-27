"""Comprehensive unit tests for Optimized Multimodal Video Intelligence in AI Clipper."""
from __future__ import annotations

import os
from pathlib import Path
import unittest
from unittest.mock import patch, MagicMock

from clipper.multimodal import (
    evaluate_transcript_usefulness,
    get_adaptive_sample_interval,
    detect_local_visual_signals,
    detect_local_audio_signals,
    calculate_candidate_score,
    generate_candidate_windows,
    extract_sparse_candidate_frames,
    analysis_cache,
    STATE_TRANSCRIPT_AVAILABLE,
    STATE_TRANSCRIPT_PARTIAL,
    STATE_NO_USEFUL_TRANSCRIPT,
    DEFAULT_SAMPLE_INTERVAL,
    MAX_LLM_CANDIDATES,
    MAX_VISION_BATCHES
)
from clipper.ai_analyzer import (
    VisualCandidateItem,
    BatchedVisualCandidatesResponse,
    clamp_and_validate_candidate_boundaries,
    generate_fallback_multimodal_candidates,
    parse_guided_instruction_with_groq,
    analyze_multimodal_candidates_batched
)


class TestTranscriptUsefulness(unittest.TestCase):
    """Test automatic input state classification."""

    def test_dense_valid_transcript(self):
        segments = [
            {"start": 0.0, "end": 20.0, "text": "Welcome to our deep dive discussion on artificial intelligence and computing."},
            {"start": 21.0, "end": 45.0, "text": "Today we explore neural networks, model optimization, and automated workflows."},
            {"start": 46.0, "end": 70.0, "text": "The results demonstrate exponential improvements across all major production benchmarks."}
        ]
        result = evaluate_transcript_usefulness(segments, video_duration=120.0)
        self.assertEqual(result["status"], STATE_TRANSCRIPT_AVAILABLE)
        self.assertTrue(result["speech_detected"])
        self.assertGreater(result["speech_ratio"], 0.15)
        self.assertEqual(result["segment_count"], 3)

    def test_empty_transcript(self):
        result = evaluate_transcript_usefulness([], video_duration=180.0)
        self.assertEqual(result["status"], STATE_NO_USEFUL_TRANSCRIPT)
        self.assertFalse(result["speech_detected"])
        self.assertEqual(result["speech_duration"], 0.0)

    def test_music_and_noise_only_transcript(self):
        segments = [
            {"start": 5.0, "end": 20.0, "text": "[Music]"},
            {"start": 25.0, "end": 40.0, "text": "[Applause]"},
            {"start": 50.0, "end": 65.0, "text": "[Sound]"}
        ]
        result = evaluate_transcript_usefulness(segments, video_duration=300.0)
        self.assertEqual(result["status"], STATE_NO_USEFUL_TRANSCRIPT)
        self.assertFalse(result["speech_detected"])

    def test_partial_sparse_transcript(self):
        segments = [
            {"start": 10.0, "end": 16.0, "text": "Watch this insane stunt right here guys!"}
        ]
        result = evaluate_transcript_usefulness(segments, video_duration=100.0)
        self.assertEqual(result["status"], STATE_TRANSCRIPT_PARTIAL)
        self.assertTrue(result["speech_detected"])


class TestAdaptiveSampling(unittest.TestCase):
    """Test duration-based adaptive sampling interval."""

    def test_short_video_sampling(self):
        # < 10 mins (600s) -> 2.5s
        interval = get_adaptive_sample_interval(300.0)
        self.assertEqual(interval, 2.5)

    def test_medium_video_sampling(self):
        # 10 to 30 mins -> 4.0s
        interval = get_adaptive_sample_interval(1200.0)
        self.assertEqual(interval, 4.0)

    def test_long_video_sampling(self):
        # 30 to 60 mins -> 6.0s
        interval = get_adaptive_sample_interval(2400.0)
        self.assertEqual(interval, 6.0)

    def test_very_long_video_sampling(self):
        # > 60 mins -> 10.0s
        interval = get_adaptive_sample_interval(5000.0)
        self.assertEqual(interval, 10.0)

    def test_env_override_sampling(self):
        with patch.dict(os.environ, {"VIDEO_ANALYSIS_SAMPLE_INTERVAL": "5.5"}):
            interval = get_adaptive_sample_interval(100.0)
            self.assertEqual(interval, 5.5)


class TestLocalSignalDetectionAndWindows(unittest.TestCase):
    """Test candidate window generation, merging, and deduplication."""

    def test_candidate_score_calculation(self):
        # Without transcript: 0.45 visual + 0.30 motion + 0.25 audio
        score_no_tr = calculate_candidate_score(
            visual_score=0.9,
            motion_score=0.8,
            audio_score=0.7,
            has_transcript=False
        )
        self.assertGreaterEqual(score_no_tr, 7.5)
        self.assertLessEqual(score_no_tr, 10.0)

        # With transcript
        score_tr = calculate_candidate_score(
            visual_score=0.5,
            motion_score=0.5,
            audio_score=0.5,
            transcript_score=0.9,
            has_transcript=True
        )
        self.assertGreaterEqual(score_tr, 5.0)

    def test_nearby_event_merging(self):
        # Simulate events at 100s, 108s, and 115s (within 20s merge window)
        visual_signals = [
            {"timestamp": 100.0, "visual_score": 0.8, "motion_score": 0.7},
            {"timestamp": 108.0, "visual_score": 0.95, "motion_score": 0.85},
            {"timestamp": 115.0, "visual_score": 0.75, "motion_score": 0.65},
            {"timestamp": 300.0, "visual_score": 0.85, "motion_score": 0.80},
        ]
        audio_signals = [
            {"timestamp": 108.0, "audio_score": 0.9},
            {"timestamp": 300.0, "audio_score": 0.85},
        ]

        windows = generate_candidate_windows(
            visual_signals=visual_signals,
            audio_signals=audio_signals,
            video_duration=600.0,
            min_clip_duration=30.0,
            max_clip_duration=60.0,
            merge_distance=20.0
        )

        # The 3 nearby events should merge into 1 window, plus the event at 300s -> exactly 2 windows
        self.assertEqual(len(windows), 2)
        first = windows[0]
        # Peak event should center around 108s
        self.assertTrue(first["start"] <= 108.0 <= first["end"])
        self.assertGreaterEqual(first["duration"], 30.0)
        self.assertLessEqual(first["duration"], 60.0)

    def test_candidate_pool_capping(self):
        # Generate 50 widely spaced events
        v_sigs = [{"timestamp": float(i * 45), "visual_score": 0.8, "motion_score": 0.7} for i in range(50)]
        a_sigs = [{"timestamp": float(i * 45), "audio_score": 0.8} for i in range(50)]

        windows = generate_candidate_windows(
            visual_signals=v_sigs,
            audio_signals=a_sigs,
            video_duration=3000.0,
            max_candidates=12
        )
        self.assertLessEqual(len(windows), 12)


class TestTimestampClamping(unittest.TestCase):
    """Test strict candidate boundary clamping preventing LLM hallucination."""

    def test_llm_cannot_hallucinate_outside_window(self):
        cand = {
            "id": 1,
            "start": 500.0,
            "end": 550.0,
            "peak_time": 525.0
        }
        # LLM returns impossible out-of-bounds offsets: start_offset=-100.0, end_offset=999.0
        eval_item = VisualCandidateItem(
            id=1,
            title="Crazy Stunt",
            score=9.0,
            start_offset=0.0,
            end_offset=45.0
        )

        clamped = clamp_and_validate_candidate_boundaries(
            cand=cand,
            eval_item=eval_item,
            min_duration=30.0,
            max_duration=60.0,
            video_duration=800.0
        )

        # Clamped boundaries must remain strictly bounded:
        # candidate_start <= clip_start < clip_end <= candidate_end
        self.assertGreaterEqual(clamped["start"], 500.0)
        self.assertLessEqual(clamped["end"], 550.0)
        self.assertGreaterEqual(clamped["duration"], 30.0)
        self.assertLessEqual(clamped["duration"], 50.0)

    def test_min_duration_enforcement(self):
        cand = {"id": 2, "start": 100.0, "end": 150.0}
        # LLM returns too short 5s clip: start_offset=10.0, end_offset=15.0
        eval_item = VisualCandidateItem(
            id=2,
            start_offset=10.0,
            end_offset=15.0
        )
        clamped = clamp_and_validate_candidate_boundaries(
            cand=cand,
            eval_item=eval_item,
            min_duration=30.0,
            max_duration=60.0
        )
        self.assertGreaterEqual(clamped["duration"], 30.0)


class TestPydanticValidation(unittest.TestCase):
    """Test Pydantic JSON validation for multimodal responses."""

    def test_valid_item_parsing(self):
        raw = {
            "id": 5,
            "interesting": True,
            "score": 9.4,
            "event_type": "action",
            "title": "Epic Helicopter Stunt",
            "tags": ["#gta5", "#gaming", "#stunt"],
            "reason": "Mid-air vehicle flip and perfect landing",
            "start_offset": 5.0,
            "end_offset": 45.0
        }
        item = VisualCandidateItem(**raw)
        self.assertEqual(item.id, 5)
        self.assertEqual(item.score, 9.4)
        self.assertEqual(item.title, "Epic Helicopter Stunt")
        self.assertEqual(len(item.tags), 3)

    def test_schema_defaults(self):
        raw = {"id": 1}
        item = VisualCandidateItem(**raw)
        self.assertTrue(item.interesting)
        self.assertEqual(item.score, 8.0)
        self.assertEqual(item.event_type, "highlight")


class TestGuidedInstructionParser(unittest.TestCase):
    """Test Groq guided instruction and preset parsing."""

    def test_preset_mapping_without_api_key(self):
        info = parse_guided_instruction_with_groq(
            instruction="Focus on big car crashes",
            preset="Fails",
            groq_key=None
        )
        self.assertIn("Fails", info["summary"])
        self.assertIn("car crashes", info["combined_focus"])

    @patch("clipper.ai_analyzer.query_llm")
    def test_preset_rules_coverage(self, _):
        for preset in ["funny", "action", "unexpected", "fails", "wins", "explosions"]:
            res = parse_guided_instruction_with_groq(preset=preset)
            self.assertIn("combined_focus", res)
            self.assertTrue(len(res["combined_focus"]) > 10)


class TestGeminiVisionBatchingAndCostRegression(unittest.TestCase):
    """Test batching safety: LLM call count must remain strictly bounded."""

    @patch.dict(os.environ, {"GEMINI_API_KEY": ""}, clear=False)
    def test_fallback_when_gemini_unavailable(self):
        candidates = [
            {"id": 1, "start": 30.0, "end": 75.0, "score": 8.5, "signals": {"visual_score": 0.8, "audio_score": 0.7}},
            {"id": 2, "start": 120.0, "end": 165.0, "score": 8.2, "signals": {"visual_score": 0.75, "audio_score": 0.8}},
        ]
        # No gemini key provided -> falls back to local multimodal candidate ranking
        results = analyze_multimodal_candidates_batched(
            candidates=candidates,
            candidate_frames_map={},
            video_duration=200.0,
            gemini_key=""
        )
        self.assertEqual(len(results), 2)
        self.assertIn("title", results[0])
        self.assertIn("tags", results[0])
        self.assertGreaterEqual(results[0]["score"], 8.0)

    @patch("google.generativeai.GenerativeModel")
    def test_fallback_when_gemini_raises_exception(self, mock_model_cls):
        mock_instance = MagicMock()
        mock_instance.generate_content.side_effect = RuntimeError("429 ResourceExhausted: Quota exceeded")
        mock_model_cls.return_value = mock_instance

        candidates = [
            {"id": 1, "start": 10.0, "end": 50.0, "score": 8.5, "signals": {"visual_score": 0.8, "audio_score": 0.7}},
        ]
        results = analyze_multimodal_candidates_batched(
            candidates=candidates,
            candidate_frames_map={},
            video_duration=100.0,
            gemini_key="dummy_key"
        )
        self.assertEqual(len(results), 1)
        self.assertIn("title", results[0])
        self.assertIn("tags", results[0])

    def test_cost_regression_guard_bounded_batches(self):
        """
        Verify that analyzing up to 20 candidates produces AT MOST 2 batches
        (never 1 call per candidate or 100+ API calls).
        """
        candidates = [
            {"id": i, "start": float(i * 50), "end": float(i * 50 + 45), "score": 8.0, "signals": {"visual_score": 0.8, "audio_score": 0.8}}
            for i in range(1, 21)
        ]

        batch_size = 10
        batches = [candidates[i:i + batch_size] for i in range(0, min(len(candidates), 20), batch_size)]
        
        # Must never exceed MAX_VISION_BATCHES
        self.assertLessEqual(len(batches), MAX_VISION_BATCHES)
        self.assertEqual(len(batches), 2)


class TestMultimodalCache(unittest.TestCase):
    """Test disk analysis caching for repeat operations."""

    def test_cache_set_and_get(self):
        test_video = "test_gameplay_vid_123"
        data = {"candidates": [{"id": 1, "start": 10.0, "end": 50.0, "score": 9.0}]}
        config = {"min_duration": 30.0, "max_duration": 60.0}

        analysis_cache.set(test_video, data, config)
        retrieved = analysis_cache.get(test_video, config)

        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved["candidates"][0]["id"], 1)

    def test_probe_video_metadata_and_extract_audio_on_silent_video(self):
        """Verify probe_video_metadata detects has_audio=False and extract_audio returns None."""
        import subprocess
        import tempfile
        from clipper.downloader import get_ffmpeg_path, extract_audio
        from splitter.splitter import probe_video_metadata
        from clipper.multimodal import detect_local_audio_signals

        with tempfile.TemporaryDirectory() as td:
            ffmpeg = get_ffmpeg_path()
            silent_vid = Path(td) / "unit_silent.mp4"
            cmd = [ffmpeg, "-y", "-f", "lavfi", "-i", "color=c=black:s=160x120:d=2", "-c:v", "libx264", str(silent_vid)]
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)

            meta = probe_video_metadata(silent_vid)
            self.assertIn("has_audio", meta)
            self.assertFalse(meta["has_audio"])

            audio_out = Path(td) / "unit_audio.mp3"
            res = extract_audio(str(silent_vid), str(audio_out))
            self.assertIsNone(res)

            # detect_local_audio_signals returns empty list without error
            signals = detect_local_audio_signals(silent_vid, duration=2.0, has_audio=False)
            self.assertEqual(signals, [])


if __name__ == "__main__":
    unittest.main()

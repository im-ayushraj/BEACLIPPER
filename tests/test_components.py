"""Component tests for AI Video Clipper V1."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import unittest
from pathlib import Path

from clipper.downloader import extract_video_id, InvalidURLError, get_ffmpeg_path
from clipper.ai_analyzer import clean_and_parse_json, format_transcript_for_prompt
from clipper.verifier import verify_and_adjust_clip, is_sentence_start, is_sentence_end
from clipper.ranker import rank_and_deduplicate, calculate_overlap_seconds, is_overlapping
from clipper.cutter import generate_clips, cut_single_clip


class TestClipperComponents(unittest.TestCase):

    def test_invalid_url_handling(self):
        """Test URL validation and error handling."""
        valid_urls = [
            ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
            ("https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
            ("https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
            ("https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share", "dQw4w9WgXcQ"),
        ]
        for url, expected_id in valid_urls:
            self.assertEqual(extract_video_id(url), expected_id)

        invalid_urls = [
            "https://vimeo.com/123456",
            "not_a_url",
            "https://google.com",
            "",
            "https://youtube.com/watch",
        ]
        for bad_url in invalid_urls:
            with self.assertRaises(InvalidURLError):
                extract_video_id(bad_url)

    def test_transcript_timestamps_and_formatting(self):
        """Test transcript formatting for LLM prompt."""
        segments = [
            {"start": 0.0, "end": 4.5, "text": "Welcome to this AI tutorial."},
            {"start": 4.5, "end": 9.8, "text": "Today we are building video clippers."},
        ]
        formatted = format_transcript_for_prompt(segments)
        self.assertIn("[0.0 - 4.5] Welcome to this AI tutorial.", formatted)
        self.assertIn("[4.5 - 9.8] Today we are building video clippers.", formatted)

    def test_llm_json_parsing(self):
        """Test robust LLM JSON parsing with title, tags, and explanation."""
        # 1. Standard raw JSON with full metadata
        raw_json = json.dumps([{
            "start": 10.0,
            "end": 50.0,
            "score": 9.5,
            "title": "Why Startups Fail",
            "tags": ["#startups", "#business"],
            "explanation": "Great breakdown on founder mistakes.",
            "reason": "Great hook"
        }])
        parsed = clean_and_parse_json(raw_json)
        self.assertEqual(len(parsed), 1)
        self.assertEqual(parsed[0]["start"], 10.0)
        self.assertEqual(parsed[0]["title"], "Why Startups Fail")
        self.assertIn("#startups", parsed[0]["tags"])
        self.assertEqual(parsed[0]["explanation"], "Great breakdown on founder mistakes.")

        # 2. Markdown fenced JSON without tags (tests normalization fallback)
        fenced_json = """Here are the top moments:
```json
[
  {
    "start": 15.2,
    "end": 58.4,
    "score": 9.0,
    "reason": "Insightful breakdown"
  }
]
```"""
        parsed2 = clean_and_parse_json(fenced_json)
        self.assertEqual(len(parsed2), 1)
        self.assertEqual(parsed2[0]["start"], 15.2)
        self.assertIsNotNone(parsed2[0]["title"])
        self.assertGreater(len(parsed2[0]["tags"]), 0)

    def test_sentence_boundary_helpers(self):
        """Test sentence start and end detection."""
        self.assertTrue(is_sentence_start("This is the beginning."))
        self.assertFalse(is_sentence_start("and then we did this"))
        self.assertFalse(is_sentence_start("so basically that was it"))
        self.assertTrue(is_sentence_end("This completes the thought."))
        self.assertFalse(is_sentence_end("This thought continues"))

    def test_30_60_sec_validation_and_adjustment(self):
        """Test that clips under 30s expand and clips over 60s trim cleanly with metadata preserved."""
        segments = [
            {"start": 0.0, "end": 5.0, "text": "First intro segment."},
            {"start": 5.0, "end": 10.0, "text": "and continuing the thought."},
            {"start": 10.0, "end": 20.0, "text": "Here is the core lesson explained thoroughly."},
            {"start": 20.0, "end": 35.0, "text": "More in-depth details provided here."},
            {"start": 35.0, "end": 50.0, "text": "Wrapping up the second part."},
            {"start": 50.0, "end": 75.0, "text": "Extended discussion lasting longer."},
            {"start": 75.0, "end": 90.0, "text": "Final concluding words."},
        ]

        # Case A: Too short candidate with title & tags
        short_cand = {
            "start": 10.0,
            "end": 20.0,
            "score": 9.0,
            "title": "Core Lesson",
            "tags": ["#lesson", "#core"],
            "explanation": "Core lesson explained.",
            "reason": "Short insight"
        }
        adj_short = verify_and_adjust_clip(short_cand, segments, video_duration=90.0)
        self.assertIsNotNone(adj_short)
        self.assertGreaterEqual(adj_short["duration"], 30.0)
        self.assertLessEqual(adj_short["duration"], 60.0)
        self.assertEqual(adj_short["title"], "Core Lesson")
        self.assertIn("#lesson", adj_short["tags"])

        # Case B: Too long candidate (0.0 to 75.0 = 75s)
        long_cand = {"start": 0.0, "end": 75.0, "score": 9.0, "reason": "Long section"}
        adj_long = verify_and_adjust_clip(long_cand, segments, video_duration=90.0)
        self.assertIsNotNone(adj_long)
        self.assertGreaterEqual(adj_long["duration"], 30.0)
        self.assertLessEqual(adj_long["duration"], 60.0)

        # Case C: Starting on continuation word ("and continuing the thought" at start 5.0)
        cont_cand = {"start": 5.0, "end": 40.0, "score": 8.5, "reason": "Check start snap"}
        adj_cont = verify_and_adjust_clip(cont_cand, segments, video_duration=90.0)
        self.assertEqual(adj_cont["start"], 0.0)

    def test_overlapping_clip_filtering_and_10_clips(self):
        """Test overlap calculation, ranking, and selecting up to 10 diverse clips."""
        # Generate 15 candidates spanning a 2000s video
        candidates = []
        for i in range(15):
            start = float(i * 120)
            candidates.append({
                "start": start,
                "end": start + 45.0,
                "duration": 45.0,
                "score": round(8.0 + (i % 3) * 0.5, 1),
                "title": f"Viral Moment {i+1}",
                "tags": [f"#moment{i+1}", "#viral"],
                "explanation": f"Explanation for clip {i+1}",
                "reason": f"Reason {i+1}"
            })

        # Add some overlapping duplicate candidates
        candidates.append({
            "start": 10.0, "end": 50.0, "duration": 40.0, "score": 7.0, "reason": "Duplicate"
        })

        selected = rank_and_deduplicate(candidates, target_count=10, max_overlap_seconds=10.0)
        self.assertEqual(len(selected), 10)
        # Ensure no overlapping clips in selected
        for i in range(len(selected)):
            for j in range(i + 1, len(selected)):
                self.assertFalse(
                    is_overlapping(selected[i], selected[j], max_overlap_seconds=10.0),
                    f"Selected clips {i} and {j} should not overlap"
                )

    def test_ffmpeg_extraction(self):
        """Test creating a synthetic video and running FFmpeg cutting + clips.json generation."""
        test_dir = Path("test_scratch_cutter")
        test_dir.mkdir(parents=True, exist_ok=True)
        ffmpeg_bin = get_ffmpeg_path()

        synthetic_video = test_dir / "synthetic_test.mp4"
        out_dir = test_dir / "output"
        out_dir.mkdir(parents=True, exist_ok=True)

        try:
            # Generate 45 seconds of synthetic test video using lavfi
            cmd = [
                ffmpeg_bin,
                "-y",
                "-f", "lavfi",
                "-i", "testsrc=size=320x240:rate=25:duration=45",
                "-f", "lavfi",
                "-i", "sine=frequency=440:duration=45",
                "-c:v", "libx264",
                "-c:a", "aac",
                str(synthetic_video)
            ]
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            self.assertTrue(synthetic_video.exists())

            # Cut clips using generate_clips
            clips_to_cut = [
                {
                    "start": 5.0,
                    "end": 35.0,
                    "score": 9.2,
                    "title": "Mastering The Pipeline",
                    "tags": ["#pipeline", "#engineering", "#python"],
                    "explanation": "Clear walkthrough on building automated pipelines.",
                    "reason": "Synthetic highlight 1"
                }
            ]
            result = generate_clips(
                video_path=str(synthetic_video),
                clips_data=clips_to_cut,
                output_dir=out_dir,
                ffmpeg_bin=ffmpeg_bin
            )

            clip_file = out_dir / "clip_01.mp4"
            json_file = out_dir / "clips.json"

            self.assertTrue(clip_file.exists())
            self.assertGreater(clip_file.stat().st_size, 1000)
            self.assertTrue(json_file.exists())

            with open(json_file, "r", encoding="utf-8") as f:
                saved_json = json.load(f)
            self.assertEqual(len(saved_json["clips"]), 1)
            first_clip = saved_json["clips"][0]
            self.assertEqual(first_clip["file"], "clip_01.mp4")
            self.assertEqual(first_clip["duration"], 30.0)
            self.assertEqual(first_clip["title"], "Mastering The Pipeline")
            self.assertIn("#pipeline", first_clip["tags"])
            self.assertEqual(first_clip["explanation"], "Clear walkthrough on building automated pipelines.")

        finally:
            shutil.rmtree(test_dir, ignore_errors=True)

    def test_ass_subtitle_generation_and_formatting(self):
        """Test Alex Hormozi style ASS subtitle generation and formatting."""
        from clipper.subtitles import format_ass_time, chunk_text_into_punchy_lines, generate_ass_subtitles

        # Test timestamp formatting
        self.assertEqual(format_ass_time(0.0), "0:00:00.00")
        self.assertEqual(format_ass_time(65.42), "0:01:05.42")
        self.assertEqual(format_ass_time(3600.0), "1:00:00.00")

        # Test chunking into punchy 2-3 word lines with highlights
        chunks = chunk_text_into_punchy_lines("This is an incredible viral video clipping engine.", 0.0, 4.0, words_per_line=3)
        self.assertGreater(len(chunks), 1)
        self.assertIn(r"{\c&H0000FFFF&}", chunks[0]["text"])

        # Test ASS file generation
        segments = [
            {"start": 10.0, "end": 14.0, "text": "Nobody wants to build slowly anymore."},
            {"start": 14.5, "end": 19.0, "text": "They want fast results with AI."},
        ]
        test_ass = Path(__file__).resolve().parent / "temp_test_subs.ass"
        try:
            res = generate_ass_subtitles(segments, 10.0, 20.0, test_ass, is_vertical=True)
            self.assertIsNotNone(res)
            self.assertTrue(test_ass.exists())

            with open(test_ass, "r", encoding="utf-8") as f:
                content = f.read()

            self.assertIn("[Script Info]", content)
            self.assertIn("Hormozi", content)
            self.assertIn("NOBODY", content)
            self.assertIn(r"{\c&H0000FFFF&}", content)
        finally:
            if test_ass.exists():
                test_ass.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()

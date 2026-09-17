"""End-to-End Integration Tests for AI Video Clipper V1."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import unittest
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

from clipper.ai_analyzer import find_important_moments
from clipper.verifier import verify_all_candidates
from clipper.ranker import rank_and_deduplicate
from clipper.cutter import generate_clips
from clipper.downloader import get_ffmpeg_path


class TestEndToEndPipeline(unittest.TestCase):

    def setUp(self):
        self.test_dir = Path("test_scratch_e2e")
        self.test_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir = self.test_dir / "output"
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_ai_analysis_and_verification_flow(self):
        """Test sending realistic transcript to LLM, verifying 30-60s constraints and deduplication."""
        # Simulated realistic 4-minute lecture / podcast transcript
        sample_segments = [
            {"start": 0.0, "end": 4.5, "text": "Welcome everyone to today's tech briefing."},
            {"start": 4.5, "end": 10.0, "text": "Today we are looking at the huge shift in software engineering."},
            {"start": 10.0, "end": 18.2, "text": "If you are not using AI assistants, you are going to fall behind very quickly."},
            {"start": 18.2, "end": 28.5, "text": "Here is the number one mistake developers make when building autonomous agents."},
            {"start": 28.5, "end": 39.0, "text": "They try to build monolithic prompts instead of modular pipelines with verification."},
            {"start": 39.0, "end": 49.5, "text": "When you break a problem into download, transcription, ranking, and cutting, it becomes trivial."},
            {"start": 49.5, "end": 58.0, "text": "This modularity is the secret to 10x engineering in 2026."},
            {"start": 58.0, "end": 70.0, "text": "Let's move on to the second big point, which is data privacy and local execution."},
            {"start": 70.0, "end": 85.0, "text": "Local models running with tools like FFmpeg can process high definition video in seconds."},
            {"start": 85.0, "end": 98.0, "text": "You don't need expensive GPU clusters just to trim video and extract viral clips."},
            {"start": 98.0, "end": 115.0, "text": "In fact, with modern hardware, your laptop CPU can encode 1080p clips at 100 frames per second."},
            {"start": 115.0, "end": 130.0, "text": "That completely disrupts the cloud computing SaaS business model."},
            {"start": 130.0, "end": 145.0, "text": "Now let's talk about audience engagement on short form video platforms."},
            {"start": 145.0, "end": 160.0, "text": "The first three seconds dictate ninety percent of your retention curve on YouTube Shorts."},
            {"start": 160.0, "end": 175.0, "text": "If your hook doesn't present an open question or contradiction, the viewer simply swipes away."},
            {"start": 175.0, "end": 190.0, "text": "So always open with the punchline or the problem before delivering the technical solution."},
            {"start": 190.0, "end": 210.0, "text": "That concludes today's masterclass. Make sure to apply this in your next project."},
        ]

        # 1. Test LLM moment finding with Gemini
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            self.skipTest("GEMINI_API_KEY not set")

        candidates = find_important_moments(sample_segments, gemini_key=api_key)
        self.assertIsInstance(candidates, list)
        self.assertGreater(len(candidates), 0)

        # 2. Verify and adjust candidates (enforce 30-60s)
        verified = verify_all_candidates(candidates, sample_segments, video_duration=210.0)
        self.assertGreater(len(verified), 0)
        for c in verified:
            self.assertGreaterEqual(c["duration"], 30.0)
            self.assertLessEqual(c["duration"], 60.0)

        # 3. Rank and deduplicate to top 5
        top_clips = rank_and_deduplicate(verified, target_count=5)
        self.assertLessEqual(len(top_clips), 5)
        self.assertGreater(len(top_clips), 0)

        # 4. Generate synthetic 210s video and cut
        ffmpeg_bin = get_ffmpeg_path()
        synth_video = self.test_dir / "synth_podcast.mp4"
        cmd = [
            ffmpeg_bin, "-y",
            "-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=210",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=210",
            "-c:v", "libx264", "-c:a", "aac",
            str(synth_video)
        ]
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        self.assertTrue(synth_video.exists())

        # 5. FFmpeg cut
        result = generate_clips(
            video_path=str(synth_video),
            clips_data=top_clips,
            output_dir=self.output_dir,
            ffmpeg_bin=ffmpeg_bin
        )

        clips_json_path = self.output_dir / "clips.json"
        self.assertTrue(clips_json_path.exists())

        with open(clips_json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.assertIn("clips", data)
        self.assertEqual(len(data["clips"]), len(top_clips))

        for idx, clip_info in enumerate(data["clips"], start=1):
            clip_file = self.output_dir / clip_info["file"]
            self.assertTrue(clip_file.exists(), f"{clip_file} should exist")
            self.assertGreater(clip_file.stat().st_size, 5000)
            self.assertGreaterEqual(clip_info["duration"], 30.0)
            self.assertLessEqual(clip_info["duration"], 60.0)
            self.assertIn("score", clip_info)
            self.assertIn("reason", clip_info)
            self.assertIn("title", clip_info)
            self.assertTrue(len(clip_info["title"]) > 0)
            self.assertIn("tags", clip_info)
            self.assertIsInstance(clip_info["tags"], list)
            self.assertGreater(len(clip_info["tags"]), 0)
            self.assertIn("explanation", clip_info)
            self.assertTrue(len(clip_info["explanation"]) > 0)


if __name__ == "__main__":
    unittest.main()

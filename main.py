"""CLI Entrypoint for AI Video Clipper."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from dotenv import load_dotenv

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

load_dotenv()

from clipper.pipeline import ClipperPipeline
from clipper.downloader import InvalidURLError, VideoDownloadError
from clipper.transcriber import TranscriptionError
from clipper.ai_analyzer import AIAnalysisError


def status_printer(stage: str, msg: str):
    """Format and print real-time pipeline status."""
    icon_map = {
        "video": "[*] Downloading",
        "video_done": "[OK] Video ready",
        "transcript": "[*] Transcribing",
        "transcript_done": "[OK] Transcript ready",
        "analysis": "[*] AI Analyzing",
        "analysis_done": "[OK] Analysis complete",
        "clips": "[*] FFmpeg Cutting",
        "clips_done": "[OK] Clips saved",
    }
    prefix = icon_map.get(stage, "[*]")
    print(f"{prefix}: {msg}")


def main():
    parser = argparse.ArgumentParser(
        description="AI Video Clipper V1: Automatically extract the top 10+ viral 30-60s clips from any YouTube video."
    )
    parser.add_argument("url", help="YouTube video URL (e.g. https://www.youtube.com/watch?v=...)")
    parser.add_argument("--output", "-o", default="output", help="Directory to save generated clips (default: output)")
    parser.add_argument("--count", "-c", type=int, default=10, help="Number of clips to generate (default: 10)")
    parser.add_argument("--temp", default="temp_downloads", help="Directory for temporary video and audio downloads")

    args = parser.parse_args()

    print("=" * 60)
    print("               AI VIDEO CLIPPER V1               ")
    print("=" * 60)
    print(f"Target URL   : {args.url}")
    print(f"Output Dir   : {args.output}")
    print(f"Target Clips : {args.count}")
    print("-" * 60)

    try:
        pipeline = ClipperPipeline(
            working_dir=args.temp,
            output_dir=args.output
        )
        result = pipeline.run(
            youtube_url=args.url,
            target_clip_count=args.count,
            status_callback=status_printer
        )

        print("\n" + "=" * 60)
        print("PIPELINE COMPLETED SUCCESSFULLY")
        print("=" * 60)
        print(f"Video Title : {result['video']['title']}")
        print(f"Output Path : {result['output_dir']}")
        print("\nGenerated Clips:")
        print("-" * 60)
        for idx, clip in enumerate(result["clips"], start=1):
            title = clip.get("title", f"Clip {idx}")
            tags = " ".join(clip.get("tags", []))
            print(f"[{idx}] Title: {title}")
            print(f"    File       : {clip['file']}")
            print(f"    Timestamps : {clip['start']}s -> {clip['end']}s (Duration: {clip['duration']}s)")
            print(f"    Score      : {clip['score']} / 10")
            if tags:
                print(f"    Tags       : {tags}")
            if clip.get("explanation"):
                print(f"    Explanation: {clip['explanation']}")
            print(f"    Reason     : {clip['reason']}")
            print("-" * 60)

        print(f"\nMetadata saved to: {Path(args.output) / 'clips.json'}\n")

    except InvalidURLError as e:
        print(f"\n[ERROR] Invalid URL: {e}", file=sys.stderr)
        sys.exit(1)
    except VideoDownloadError as e:
        print(f"\n[ERROR] Download Error: {e}", file=sys.stderr)
        sys.exit(1)
    except TranscriptionError as e:
        print(f"\n[ERROR] Transcription Error: {e}", file=sys.stderr)
        sys.exit(1)
    except AIAnalysisError as e:
        print(f"\n[ERROR] AI Analysis Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"\n[UNEXPECTED ERROR] {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

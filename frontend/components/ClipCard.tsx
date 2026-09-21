"use client";

import { useState, useRef } from "react";
import { Download, Play, Pause, Share2, Check, Sparkles, Clock, Tag } from "lucide-react";
import { Clip } from "@/types";
import { formatTime } from "@/lib/utils";

interface ClipCardProps {
  clip: Clip;
  index: number;
}

export function ClipCard({ clip, index }: ClipCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Backend video URL path: cloud signed URL or local FastAPI mount
  const rawUrl = (clip as any).url || (clip as any).signed_url || (clip as any).download_url;
  const videoSrc = rawUrl || (clip.file ? `/output/${clip.file}` : "");

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleCopy = () => {
    const text = `${clip.title}\n${clip.explanation}\n${clip.tags.join(" ")}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const clipNumber = String(index + 1).padStart(2, "0");

  return (
    <div className="group rounded-xl border border-white/[0.08] bg-[#111319] overflow-hidden flex flex-col transition hover:border-white/[0.16]">
      {/* Video Container */}
      <div className="relative aspect-video w-full bg-black overflow-hidden flex items-center justify-center">
        <video
          ref={videoRef}
          src={videoSrc}
          controls
          preload="metadata"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          className="h-full w-full object-cover"
        />

        {/* Duration Badge */}
        <div className="pointer-events-none absolute bottom-2.5 right-2.5 rounded border border-white/10 bg-black/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-200">
          {formatTime(clip.duration)}
        </div>
      </div>

      {/* Content Body */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Header meta */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-zinc-400">CLIP {clipNumber}</span>
          </div>
          <div className="flex items-center gap-1 font-mono text-[11px] text-zinc-300 rounded border border-white/[0.08] bg-white/[0.03] px-2 py-0.5">
            <span>Score</span>
            <span className="text-white font-semibold">{clip.score}</span>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-white leading-snug tracking-tight line-clamp-2">
          {clip.title}
        </h3>

        {/* Timestamp */}
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-400">
          <Clock className="h-3 w-3 text-zinc-500" />
          <span>
            {formatTime(clip.start)} → {formatTime(clip.end)}
          </span>
          <span className="text-zinc-600">&bull;</span>
          <span>{clip.duration}s</span>
        </div>

        {/* Tags */}
        {clip.tags && clip.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {clip.tags.map((tag) => (
              <span
                key={tag}
                className="rounded border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-mono text-zinc-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Explanation Context */}
        {clip.explanation && (
          <div className="rounded-md border border-white/[0.06] bg-[#0c0e12] p-2.5 text-xs text-zinc-300 leading-relaxed">
            <span className="font-semibold text-zinc-400">Context: </span>
            {clip.explanation}
          </div>
        )}

        {/* Actions Row */}
        <div className="mt-auto pt-3 border-t border-white/[0.06] flex items-center gap-2">
          {/* Working Direct Download Button */}
          <a
            href={videoSrc}
            download={clip.file || `clip_${clipNumber}.mp4`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-xs font-semibold text-black transition hover:bg-zinc-200 active:scale-[0.98]"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download</span>
          </a>

          {/* Copy info button */}
          <button
            onClick={handleCopy}
            title="Copy title and tags"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-zinc-300 transition hover:bg-white/[0.08] hover:text-white"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Share2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const videoSrc = (clip as any).url || `/output/${clip.file}`;

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
    <div className="group rounded-2xl border border-white/[0.08] bg-[#11141d] overflow-hidden flex flex-col transition hover:border-white/20 hover:-translate-y-1 shadow-md">
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
        <div className="pointer-events-none absolute bottom-3 right-3 rounded-md border border-white/15 bg-black/80 backdrop-blur-md px-2 py-0.5 font-mono text-[11px] font-semibold text-white shadow">
          {formatTime(clip.duration)}
        </div>
      </div>

      {/* Content Body */}
      <div className="p-5 flex flex-col gap-3.5 flex-1">
        {/* Header meta */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-zinc-400">CLIP {clipNumber}</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
              <Clock className="h-2.5 w-2.5" />
              <span>24h Retention</span>
            </span>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-bold text-blue-400">
            <Sparkles className="h-3 w-3" />
            <span>{clip.score} / 10</span>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-white leading-snug tracking-tight line-clamp-2">
          {clip.title}
        </h3>

        {/* Timestamp */}
        <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-400">
          <Clock className="h-3.5 w-3.5 text-zinc-500" />
          <span>
            {formatTime(clip.start)} – {formatTime(clip.end)}
          </span>
          <span className="text-zinc-600">•</span>
          <span>{clip.duration}s</span>
        </div>

        {/* Tags */}
        {clip.tags && clip.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {clip.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/[0.06] bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-zinc-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Explanation Context */}
        {clip.explanation && (
          <div className="rounded-lg border-l-2 border-blue-500 bg-[#07080b] p-2.5 text-xs text-zinc-300 leading-relaxed">
            <span className="font-semibold text-zinc-400">Context: </span>
            {clip.explanation}
          </div>
        )}

        {/* Viral Reason */}
        {clip.reason && (
          <p className="text-xs italic text-zinc-500 line-clamp-2">
            <span className="font-semibold not-italic text-zinc-400">Hook: </span>
            {clip.reason}
          </p>
        )}

        {/* Actions Row */}
        <div className="mt-auto pt-3 border-t border-white/[0.06] flex items-center gap-2">
          {/* Working Direct Download Button */}
          <a
            href={videoSrc}
            download={clip.file}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-black transition hover:bg-zinc-200 active:scale-[0.98] shadow-sm"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download</span>
          </a>

          {/* Copy info button */}
          <button
            onClick={handleCopy}
            title="Copy title and tags"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-zinc-300 transition hover:bg-white/10 hover:text-white"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Share2 className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

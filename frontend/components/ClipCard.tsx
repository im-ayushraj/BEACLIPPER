"use client";

import { useState } from "react";
import { Download, Trash2, Loader2, Clock } from "lucide-react";
import { Clip } from "@/types";
import { formatTime } from "@/lib/utils";
import { VideoPlayer } from "./VideoPlayer";

interface ClipCardProps {
  clip: Clip;
  index: number;
  onDelete?: (clip: Clip) => void;
}

export function ClipCard({ clip, index, onDelete }: ClipCardProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Backend video URL path: cloud signed URL or local FastAPI mount
  const rawUrl = (clip as any).url || (clip as any).signed_url || (clip as any).download_url;
  const videoSrc = rawUrl || (clip.job_id && clip.file ? `/output/jobs/${clip.job_id}/${clip.file}` : (clip.file ? `/output/${clip.file}` : ""));

  const clipNumber = String(index + 1).padStart(2, "0");

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isDownloading) return;
    setIsDownloading(true);

    const filename = clip.file || `clip_${clipNumber}.mp4`;

    try {
      // 1. Fetch file as blob to force native browser download dialog without opening tab
      const res = await fetch(videoSrc);
      if (!res.ok) throw new Error("Fetch blob failed");
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(link);
    } catch (err) {
      // 2. Fallback to backend /api/download attachment proxy
      const downloadUrl = `/api/download?file=${encodeURIComponent(clip.file || "")}&url=${encodeURIComponent(videoSrc)}&name=${encodeURIComponent(filename)}`;
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDeleting) return;
    if (onDelete) {
      setIsDeleting(true);
      onDelete(clip);
    }
  };

  return (
    <div className="group rounded-xl border border-white/[0.08] bg-[#111319] overflow-hidden flex flex-col transition hover:border-white/[0.16] shadow-sm">
      {/* Custom Video Player Container */}
      <div className="relative aspect-video w-full bg-black overflow-hidden flex items-center justify-center">
        <VideoPlayer
          src={videoSrc}
          className="h-full w-full"
        />

        {/* Duration Badge */}
        <div className="pointer-events-none absolute top-2.5 right-2.5 rounded border border-white/10 bg-black/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-200 shadow">
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
            {clip.tags.map((tag, idx) => (
              <span
                key={`${tag}-${idx}`}
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
          {/* Direct Download Button */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-xs font-semibold text-black transition hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-75 cursor-pointer"
          >
            {isDownloading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-black" />
                <span>Downloading...</span>
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" />
                <span>Download</span>
              </>
            )}
          </button>

          {/* Delete clip button */}
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            title="Delete clip"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-zinc-400 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 active:scale-[0.96] disabled:opacity-50 cursor-pointer"
          >
            {isDeleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-red-400" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

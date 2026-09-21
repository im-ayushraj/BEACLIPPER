"use client";

import { useState, useEffect } from "react";
import { X, Download, Copy, Check, Scissors, Clock, Sparkles, Tag, Sliders } from "lucide-react";
import { Clip } from "@/types";
import { formatTime } from "@/lib/utils";
import { VideoPlayer } from "./VideoPlayer";

interface ClipTheaterModalProps {
  clip: Clip | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload?: (clip: Clip) => void;
}

export function ClipTheaterModal({
  clip,
  isOpen,
  onClose,
  onDownload,
}: ClipTheaterModalProps) {
  const [copiedText, setCopiedText] = useState(false);
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(0);
  const [previewingTrim, setPreviewingTrim] = useState(false);

  useEffect(() => {
    if (clip) {
      setTrimStart(clip.start || 0);
      setTrimEnd(clip.end || (clip.start + clip.duration) || 0);
      setPreviewingTrim(false);
    }
  }, [clip]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !clip) return null;

  const rawUrl = (clip as any).url || (clip as any).signed_url || (clip as any).download_url;
  const videoSrc = rawUrl || (clip.file ? `/output/${clip.file}` : "");

  const duration = Math.max(0, trimEnd - trimStart);

  const handleCopyCaption = () => {
    const tagsString = (clip.tags || []).map((t) => `#${t.replace(/\s+/g, "")}`).join(" ");
    const textToCopy = `${clip.title}\n\n${tagsString}\n#viral #shorts #beaclipper`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const adjustStart = (delta: number) => {
    setTrimStart((prev) => {
      const next = Math.max(0, Math.min(prev + delta, trimEnd - 1));
      return parseFloat(next.toFixed(1));
    });
  };

  const adjustEnd = (delta: number) => {
    setTrimEnd((prev) => {
      const next = Math.max(trimStart + 1, prev + delta);
      return parseFloat(next.toFixed(1));
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl rounded-2xl border border-white/10 bg-[#0f1117] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-[#141722]">
          <div className="flex items-center gap-3">
            <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-xs font-semibold text-indigo-400">
              Score {clip.score}
            </span>
            <h2 className="text-base font-semibold text-white truncate max-w-lg">
              {clip.title}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-y-auto flex-1">
          {/* Video Player Column */}
          <div className="lg:col-span-7 bg-black flex items-center justify-center p-4 border-b lg:border-b-0 lg:border-r border-white/10">
            <div className="w-full max-w-md rounded-xl overflow-hidden shadow-2xl border border-white/10">
              <VideoPlayer
                src={videoSrc}
                initialStart={previewingTrim ? trimStart : 0}
                initialEnd={previewingTrim ? trimEnd : undefined}
                showTrimControls={previewingTrim}
                className="w-full"
              />
            </div>
          </div>

          {/* Details & Controls Column */}
          <div className="lg:col-span-5 p-6 flex flex-col gap-5 bg-[#0f1117] overflow-y-auto">
            {/* Timestamp & Duration info */}
            <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-3 text-xs">
              <div className="flex items-center gap-2 text-zinc-400 font-mono">
                <Clock className="h-3.5 w-3.5 text-zinc-500" />
                <span>Original window:</span>
                <span className="text-zinc-200">{formatTime(clip.start)} → {formatTime(clip.end)}</span>
              </div>
              <span className="font-mono text-indigo-400 font-semibold">{clip.duration}s</span>
            </div>

            {/* Fine-tune Trim Adjuster */}
            <div className="rounded-xl border border-white/10 bg-[#141722] p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                  <Scissors className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Fine-Tune Trim Range</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewingTrim(!previewingTrim)}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition cursor-pointer ${
                    previewingTrim
                      ? "bg-indigo-600 text-white shadow"
                      : "bg-white/5 text-zinc-400 hover:text-white"
                  }`}
                >
                  {previewingTrim ? "Looping Trim Active" : "Preview Trim Range"}
                </button>
              </div>

              {/* Start Time Adjuster */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Start Time:</span>
                <div className="flex items-center gap-1.5 font-mono">
                  <button
                    onClick={() => adjustStart(-1)}
                    className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-zinc-300 transition"
                  >
                    -1s
                  </button>
                  <button
                    onClick={() => adjustStart(-0.2)}
                    className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-zinc-300 transition"
                  >
                    -0.2s
                  </button>
                  <span className="px-2 py-0.5 rounded bg-black/40 text-white min-w-[52px] text-center">
                    {trimStart.toFixed(1)}s
                  </span>
                  <button
                    onClick={() => adjustStart(0.2)}
                    className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-zinc-300 transition"
                  >
                    +0.2s
                  </button>
                  <button
                    onClick={() => adjustStart(1)}
                    className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-zinc-300 transition"
                  >
                    +1s
                  </button>
                </div>
              </div>

              {/* End Time Adjuster */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">End Time:</span>
                <div className="flex items-center gap-1.5 font-mono">
                  <button
                    onClick={() => adjustEnd(-1)}
                    className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-zinc-300 transition"
                  >
                    -1s
                  </button>
                  <button
                    onClick={() => adjustEnd(-0.2)}
                    className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-zinc-300 transition"
                  >
                    -0.2s
                  </button>
                  <span className="px-2 py-0.5 rounded bg-black/40 text-white min-w-[52px] text-center">
                    {trimEnd.toFixed(1)}s
                  </span>
                  <button
                    onClick={() => adjustEnd(0.2)}
                    className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-zinc-300 transition"
                  >
                    +0.2s
                  </button>
                  <button
                    onClick={() => adjustEnd(1)}
                    className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-zinc-300 transition"
                  >
                    +1s
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-zinc-400 pt-1 border-t border-white/5 flex justify-between font-mono">
                <span>Trimmed Length:</span>
                <span className="text-indigo-300 font-semibold">{duration.toFixed(1)}s</span>
              </div>
            </div>

            {/* AI Explanation / Context */}
            {clip.explanation && (
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs text-zinc-300 leading-relaxed">
                <div className="flex items-center gap-1.5 text-zinc-400 font-medium mb-1">
                  <Sparkles className="h-3 w-3 text-amber-400" />
                  <span>AI Virality Hook</span>
                </div>
                <p>{clip.explanation}</p>
              </div>
            )}

            {/* Tags */}
            {clip.tags && clip.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {clip.tags.map((t, idx) => (
                  <span
                    key={`${t}-${idx}`}
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-mono text-zinc-300"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {/* Actions: Copy Social Caption & Download */}
            <div className="mt-auto pt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={handleCopyCaption}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/10 hover:text-white active:scale-95 cursor-pointer"
              >
                {copiedText ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Caption</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => onDownload?.(clip)}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black transition hover:bg-zinc-200 active:scale-95 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Video</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

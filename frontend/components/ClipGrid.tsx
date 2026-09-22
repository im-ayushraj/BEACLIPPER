"use client";

import { useState } from "react";
import { Clip } from "@/types";
import { ClipCard } from "./ClipCard";
import { SlidersHorizontal, RefreshCw, CheckCircle2, Download, Loader2 } from "lucide-react";
import { getClipsZipDownloadUrl } from "@/lib/api/client";
import { useAppAuth } from "@/components/AuthComponents";
import { getClipKey } from "@/lib/utils";

interface ClipGridProps {
  clips: Clip[];
  videoTitle?: string;
  jobId?: string;
  onReset: () => void;
  onDeleteClip?: (clip: Clip) => void;
}

export function ClipGrid({ clips, videoTitle, jobId, onReset, onDeleteClip }: ClipGridProps) {
  const { getToken } = useAppAuth();
  const [sortBy, setSortBy] = useState<"score" | "duration-desc" | "duration-asc">("score");
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  const targetJobId = jobId || clips[0]?.job_id;

  const handleDownloadZip = async () => {
    if (!targetJobId || isDownloadingZip) return;
    setIsDownloadingZip(true);
    try {
      const token = await getToken();
      const zipUrl = getClipsZipDownloadUrl(targetJobId, token);
      const link = document.createElement("a");
      link.href = zipUrl;
      link.setAttribute("download", `clips_${targetJobId.substring(0, 8)}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      console.error("Failed to trigger zip download:", e);
    } finally {
      setTimeout(() => setIsDownloadingZip(false), 2000);
    }
  };

  const sortedClips = [...clips].sort((a, b) => {
    if (sortBy === "score") {
      return b.score - a.score;
    }
    if (sortBy === "duration-desc") {
      return b.duration - a.duration;
    }
    if (sortBy === "duration-asc") {
      return a.duration - b.duration;
    }
    return 0;
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Results Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div>
          <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium mb-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Processing complete</span>
          </div>
          <h2 className="text-xl font-semibold text-white tracking-tight">Your clips are ready</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {clips.length} clips generated {videoTitle ? `for "${videoTitle}"` : ""}
          </p>
        </div>

        {/* Actions & Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Download All as ZIP Button */}
          {targetJobId && clips.length > 0 && (
            <button
              onClick={handleDownloadZip}
              disabled={isDownloadingZip}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-1.5 text-xs font-semibold text-black transition hover:bg-zinc-200 cursor-pointer shadow-sm disabled:opacity-50"
            >
              {isDownloadingZip ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>{isDownloadingZip ? "Preparing ZIP..." : `Download All (${clips.length})`}</span>
            </button>
          )}

          <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#111319] px-2.5 py-1.5 text-xs text-zinc-300">
            <SlidersHorizontal className="h-3 w-3 text-zinc-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-white outline-none cursor-pointer text-xs"
            >
              <option value="score" className="bg-[#111319]">Highest score</option>
              <option value="duration-desc" className="bg-[#111319]">Longest</option>
              <option value="duration-asc" className="bg-[#111319]">Shortest</option>
            </select>
          </div>

          <button
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.08] hover:text-white"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Clip another video</span>
          </button>
        </div>
      </div>

      {/* Responsive Grid: 3 cols on desktop, 2 on tablet, 1 on mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedClips.map((clip, index) => (
          <ClipCard
            key={getClipKey(clip)}
            clip={clip}
            index={index}
            onDelete={onDeleteClip}
          />
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Clip } from "@/types";
import { ClipCard } from "./ClipCard";
import { SlidersHorizontal, RefreshCw, CheckCircle2 } from "lucide-react";

interface ClipGridProps {
  clips: Clip[];
  videoTitle?: string;
  onReset: () => void;
  onDeleteClip?: (clip: Clip) => void;
}

export function ClipGrid({ clips, videoTitle, onReset, onDeleteClip }: ClipGridProps) {
  const [sortBy, setSortBy] = useState<"score" | "duration-desc" | "duration-asc">("score");

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
        <div className="flex items-center gap-2.5">
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
            key={clip.id || `${clip.job_id || "job"}-${clip.file || "clip"}-${clip.start ?? index}-${index}`}
            clip={clip}
            index={index}
            onDelete={onDeleteClip}
          />
        ))}
      </div>
    </div>
  );
}

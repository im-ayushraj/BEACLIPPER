"use client";

import { useState } from "react";
import { Clip } from "@/types";
import { ClipGrid } from "./ClipGrid";
import { EmptyState } from "./EmptyState";
import { Search, Film } from "lucide-react";

interface MyClipsProps {
  clips: Clip[];
  onNewClip: () => void;
}

export function MyClips({ clips, onNewClip }: MyClipsProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredClips = clips.filter((clip) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const titleMatch = clip.title?.toLowerCase().includes(q);
    const tagMatch = clip.tags?.some((t) => t.toLowerCase().includes(q));
    const explanationMatch = clip.explanation?.toLowerCase().includes(q);
    return titleMatch || tagMatch || explanationMatch;
  });

  if (clips.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">My Clips</h2>
          <p className="text-sm text-zinc-400 mt-1">Your library of generated video clips.</p>
        </div>
        <EmptyState onStart={onNewClip} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">My Clips Library</h2>
          <p className="text-sm text-zinc-400 mt-1">
            {clips.length} previously generated shorts ready for export.
          </p>
        </div>

        {/* Search input */}
        <div className="relative flex items-center w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title or #tag..."
            className="h-10 w-full rounded-xl border border-white/10 bg-[#11141d] pl-9 pr-3 text-xs text-white placeholder-zinc-500 outline-none transition focus:border-blue-500"
          />
        </div>
      </div>

      {filteredClips.length === 0 ? (
        <div className="p-8 text-center text-sm text-zinc-400">
          No clips match your search query "{searchQuery}".
        </div>
      ) : (
        <ClipGrid clips={filteredClips} onReset={onNewClip} />
      )}
    </div>
  );
}

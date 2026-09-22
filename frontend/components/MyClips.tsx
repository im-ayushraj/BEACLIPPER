"use client";

import { useState } from "react";
import { Clip } from "@/types";
import { ClipGrid } from "./ClipGrid";
import { EmptyState } from "./EmptyState";
import { Search, Film } from "lucide-react";
import { getClipKey } from "@/lib/utils";

interface MyClipsProps {
  clips: Clip[];
  onNewClip: () => void;
  onDeleteClip?: (clip: Clip) => void;
}

export function MyClips({ clips, onNewClip, onDeleteClip }: MyClipsProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Deduplicate clips uniquely by id or job_id + file
  const uniqueClips: Clip[] = [];
  const seenKeys = new Set<string>();
  for (const c of clips) {
    const key = getClipKey(c);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueClips.push(c);
    }
  }

  const filteredClips = uniqueClips.filter((clip) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const titleMatch = clip.title?.toLowerCase().includes(q);
    const tagMatch = clip.tags?.some((t) => t.toLowerCase().includes(q));
    const explanationMatch = clip.explanation?.toLowerCase().includes(q);
    return titleMatch || tagMatch || explanationMatch;
  });

  if (uniqueClips.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-xl font-semibold text-white tracking-tight">Saved Clips</h2>
          <p className="text-xs text-zinc-400 mt-0.5">Your library of generated video clips.</p>
        </div>
        <EmptyState onStart={onNewClip} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div>
          <h2 className="text-xl font-semibold text-white tracking-tight">Saved Clips</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {uniqueClips.length} generated clips stored in cloud.
          </p>
        </div>

        {/* Search input */}
        <div className="relative flex items-center w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title or #tag..."
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-[#111319] pl-8 pr-3 text-xs text-white placeholder-zinc-500 outline-none transition focus:border-white/30"
          />
        </div>
      </div>

      {filteredClips.length === 0 ? (
        <div className="p-8 text-center text-xs text-zinc-400">
          No clips match your search "{searchQuery}".
        </div>
      ) : (
        <ClipGrid clips={filteredClips} onReset={onNewClip} onDeleteClip={onDeleteClip} />
      )}
    </div>
  );
}

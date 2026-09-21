import { Film } from "lucide-react";

interface EmptyStateProps {
  onStart?: () => void;
}

export function EmptyState({ onStart }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-white/[0.08] bg-[#101217]/50 p-10 text-center flex flex-col items-center justify-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/[0.03] border border-white/[0.06] text-zinc-400">
        <Film className="h-5 w-5 stroke-[1.8]" />
      </div>

      <div className="max-w-xs">
        <h3 className="text-sm font-semibold text-white">No clips generated yet</h3>
        <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
          Paste a YouTube URL or upload a video file above to generate your first set of clips.
        </p>
      </div>

      {onStart && (
        <button
          onClick={onStart}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.08] hover:text-white"
        >
          <span>Use Sample Video</span>
        </button>
      )}
    </div>
  );
}

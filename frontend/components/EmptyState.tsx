import { Video, Sparkles } from "lucide-react";

interface EmptyStateProps {
  onStart?: () => void;
}

export function EmptyState({ onStart }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-[#11141d]/50 p-12 text-center flex flex-col items-center justify-center gap-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/10 text-zinc-400">
        <Video className="h-6 w-6" />
      </div>

      <div className="max-w-sm">
        <h3 className="text-lg font-bold text-white">No clips yet</h3>
        <p className="mt-1.5 text-xs sm:text-sm text-zinc-400 leading-relaxed">
          Paste a YouTube video above and let the clipper find the strongest moments for you.
        </p>
      </div>

      {onStart && (
        <button
          onClick={onStart}
          className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/10 hover:text-white"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Select A Demo Video</span>
        </button>
      )}
    </div>
  );
}

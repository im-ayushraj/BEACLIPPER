import { AlertCircle, RefreshCw } from "lucide-react";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Couldn't process this video",
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-6 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="flex items-start gap-3.5">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-400 border border-red-500/20">
          <AlertCircle className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-red-200">{title}</h3>
          <p className="mt-1 text-xs sm:text-sm text-red-300/80 leading-relaxed max-w-lg">
            {message || "Check the YouTube URL and try again."}
          </p>
        </div>
      </div>

      {onRetry && (
        <button
          onClick={onRetry}
          className="flex-shrink-0 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold text-black transition hover:bg-zinc-200 active:scale-[0.98]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Try Again</span>
        </button>
      )}
    </div>
  );
}

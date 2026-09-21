import { AlertCircle, RefreshCw } from "lucide-react";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "We couldn't process this video",
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-950/20 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
          <AlertCircle className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-xs font-semibold text-red-200">{title}</h3>
          <p className="mt-0.5 text-xs text-red-300/80 leading-relaxed max-w-lg">
            {message || "Please verify the source video and try again."}
          </p>
        </div>
      </div>

      {onRetry && (
        <button
          onClick={onRetry}
          className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-md bg-white px-3.5 py-1.5 text-xs font-semibold text-black transition hover:bg-zinc-200 active:scale-[0.98]"
        >
          <RefreshCw className="h-3 w-3" />
          <span>Try again</span>
        </button>
      )}
    </div>
  );
}

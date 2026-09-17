"use client";

import { Check, Loader2, AlertCircle, Circle, Clock } from "lucide-react";
import { ProcessingJob, StepStatus } from "@/types";
import { cn } from "@/lib/utils";

interface ProcessingProgressProps {
  job: ProcessingJob;
}

export function ProcessingProgress({ job }: ProcessingProgressProps) {
  const isQueued = job.status === "queued";
  const stepsList = [
    { key: "video_received", defaultLabel: "Video received & downloading" },
    { key: "audio_extract", defaultLabel: "Extracting audio stream" },
    { key: "transcript", defaultLabel: "Generating timestamped transcript" },
    { key: "ai_moments", defaultLabel: "Finding the best moments with AI" },
    { key: "context_verify", defaultLabel: "Reviewing candidate clips & context" },
    { key: "ffmpeg_render", defaultLabel: "Rendering clips with FFmpeg" },
    { key: "finalizing", defaultLabel: "Finalizing metadata & previews" },
  ];

  const getStepStatus = (key: string): StepStatus => {
    if (job.steps && job.steps[key]) {
      return job.steps[key].status;
    }
    return "pending";
  };

  const getStepLabel = (key: string, defaultLabel: string): string => {
    if (job.steps && job.steps[key] && job.steps[key].label) {
      return job.steps[key].label;
    }
    return defaultLabel;
  };

  return (
    <div className="rounded-2xl border border-white/[0.1] bg-[#11141d] p-6 sm:p-8 shadow-sm">
      {/* Queued Banner if waiting in FIFO queue */}
      {isQueued && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
          <Clock className="h-5 w-5 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-amber-300">
                Waiting in Queue &bull; Position #{job.queue_position || 1}
              </span>
              <span className="text-[11px] font-mono rounded bg-amber-400/20 px-2 py-0.5 text-amber-300">
                Queue Active
              </span>
            </div>
            <p className="text-xs text-amber-300/80 mt-1">
              To ensure blazing-fast rendering and stability, a maximum of 2 jobs process concurrently. Your video will start automatically as soon as an active job slot completes.
            </p>
          </div>
        </div>
      )}

      {/* Header with Percent */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <span className={cn(
            "text-xs font-bold uppercase tracking-widest",
            isQueued ? "text-amber-400" : "text-blue-400"
          )}>
            {isQueued ? "Queued Job" : "Live Pipeline"}
          </span>
          <h3 className="text-xl font-bold text-white tracking-tight mt-0.5">
            {isQueued ? "Waiting for slot in queue" : "Analyzing your video"}
          </h3>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            {job.current_message || "Processing media pipeline..."}
          </p>
        </div>
        <div className="flex flex-col items-end">
          <span className="font-mono text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {isQueued ? `Pos #${job.queue_position || 1}` : `${job.progress_percent || 10}%`}
          </span>
          <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
            {isQueued ? "Queue status" : "Overall"}
          </span>
        </div>
      </div>

      {/* Progress Bar Track */}
      <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden mb-6">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500 ease-out"
          style={{ width: `${job.progress_percent || 10}%` }}
        />
      </div>

      {/* Step by Step Checklist */}
      <div className="flex flex-col gap-2">
        {stepsList.map((step) => {
          const status = getStepStatus(step.key);
          const label = getStepLabel(step.key, step.defaultLabel);

          return (
            <div
              key={step.key}
              className={cn(
                "flex items-center justify-between rounded-xl px-4 py-3 text-sm transition-all duration-200 border",
                status === "processing"
                  ? "bg-blue-500/10 border-blue-500/30 text-white font-semibold shadow-sm"
                  : status === "completed"
                  ? "bg-white/[0.02] border-white/5 text-zinc-300"
                  : status === "error"
                  ? "bg-red-500/10 border-red-500/30 text-red-300"
                  : "border-transparent text-zinc-500"
              )}
            >
              <div className="flex items-center gap-3">
                {/* Status Indicator Icon */}
                <div
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition",
                    status === "completed" && "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40",
                    status === "processing" && "bg-blue-500 text-white shadow-sm animate-pulse-ring",
                    status === "error" && "bg-red-500 text-white",
                    status === "pending" && "text-zinc-600 border border-white/5"
                  )}
                >
                  {status === "completed" && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
                  {status === "processing" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {status === "error" && <AlertCircle className="h-3.5 w-3.5" />}
                  {status === "pending" && <Circle className="h-2 w-2 fill-current" />}
                </div>

                <span>{label}</span>
              </div>

              {/* Status Badge */}
              <span
                className={cn(
                  "text-[11px] font-mono capitalize",
                  status === "completed" && "text-emerald-400",
                  status === "processing" && "text-blue-400 font-semibold",
                  status === "error" && "text-red-400 font-semibold",
                  status === "pending" && "text-zinc-600"
                )}
              >
                {status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

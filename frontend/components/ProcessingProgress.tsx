"use client";

import { Check, Loader2, AlertCircle, Circle, Clock } from "lucide-react";
import { ProcessingJob, StepStatus } from "@/types";
import { cn } from "@/lib/utils";

interface ProcessingProgressProps {
  job: ProcessingJob;
  onCancel?: () => void;
  isCanceling?: boolean;
}

export function ProcessingProgress({ job, onCancel, isCanceling = false }: ProcessingProgressProps) {
  const isQueued = job.status === "queued";
  const stepsList = [
    { key: "video_received", defaultLabel: "Video received & downloading" },
    { key: "audio_extract", defaultLabel: "Extracting audio stream" },
    { key: "transcript", defaultLabel: "Generating timestamped transcript" },
    { key: "ai_moments", defaultLabel: "Finding the best moments with AI" },
    { key: "context_verify", defaultLabel: "Reviewing candidate clips & context" },
    { key: "ffmpeg_render", defaultLabel: "Rendering & encoding viral clips" },
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
    <div className="rounded-xl border border-white/[0.08] bg-[#111319] p-5 sm:p-6">
      {/* Queued Banner if waiting in queue */}
      {isQueued && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3.5 text-amber-200">
          <Clock className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-amber-300">
                Waiting in queue &bull; Position #{job.queue_position || 1}
              </span>
              <span className="font-mono text-[10px] text-amber-400 border border-amber-500/20 rounded px-1.5 py-0.2">
                Queue Active
              </span>
            </div>
            <p className="text-amber-300/80 mt-0.5">
              Maximum 2 jobs process concurrently. Your video will start automatically when a processing slot opens.
            </p>
          </div>
        </div>
      )}

      {/* Header with Percent */}
      <div className="flex items-center justify-between gap-4 mb-3">
        <div>
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            {isQueued ? "Queued" : "Processing"}
          </span>
          <h3 className="text-base font-semibold text-white tracking-tight mt-0.5">
            {isQueued ? "Waiting for slot in queue" : "Processing video"}
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            {job.current_message || "Analyzing media..."}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="font-mono text-xl sm:text-2xl font-semibold text-white">
            {isQueued ? `Pos #${job.queue_position || 1}` : `${job.progress_percent || 10}%`}
          </span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isCanceling}
              className="text-[11px] font-medium text-zinc-400 hover:text-red-400 transition underline underline-offset-2 cursor-pointer disabled:opacity-50"
            >
              {isCanceling ? "Canceling..." : "Cancel Job"}
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar Track */}
      <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden mb-5">
        <div
          className="h-full rounded-full bg-white transition-all duration-300 ease-out"
          style={{ width: `${job.progress_percent || 10}%` }}
        />
      </div>

      {/* Step by Step Checklist */}
      <div className="flex flex-col divide-y divide-white/[0.04]">
        {stepsList.map((step) => {
          const status = getStepStatus(step.key);
          const label = getStepLabel(step.key, step.defaultLabel);

          return (
            <div
              key={step.key}
              className={cn(
                "flex items-center justify-between py-2.5 text-xs transition",
                status === "processing"
                  ? "text-white font-medium"
                  : status === "completed"
                  ? "text-zinc-300"
                  : status === "error"
                  ? "text-red-300 font-medium"
                  : "text-zinc-500"
              )}
            >
              <div className="flex items-center gap-2.5">
                {/* Status Indicator Icon */}
                <div className="flex h-4 w-4 items-center justify-center shrink-0">
                  {status === "completed" && <Check className="h-3.5 w-3.5 text-emerald-400 stroke-[2.2]" />}
                  {status === "processing" && <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />}
                  {status === "error" && <AlertCircle className="h-3.5 w-3.5 text-red-400" />}
                  {status === "pending" && <span className="h-1.5 w-1.5 rounded-full bg-zinc-700" />}
                </div>

                <span>{label}</span>
              </div>

              {/* Status Badge */}
              <span
                className={cn(
                  "font-mono text-[10px] capitalize",
                  status === "completed" && "text-emerald-400",
                  status === "processing" && "text-blue-400 font-medium",
                  status === "error" && "text-red-400",
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

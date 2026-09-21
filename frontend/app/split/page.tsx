"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Scissors,
  Upload,
  Clock,
  Download,
  FileVideo,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Archive,
  RotateCcw,
  ArrowLeft,
  Play,
  Film
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import {
  uploadAndStartSplit,
  getSplitJobStatus,
  getDownloadAllZipUrl,
  getIndividualClipDownloadUrl,
  SplitJobStatus,
  SplitClip,
} from "@/lib/api/video-splitter";
import { cn, formatTime } from "@/lib/utils";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "";
const DURATION_PRESETS = [5, 10, 15, 20, 25, 30, 45, 60];

export default function SplitVideoPage() {
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number>(25);
  const [customDurationStr, setCustomDurationStr] = useState<string>("25");
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [detectedDuration, setDetectedDuration] = useState<number | null>(null);
  const [detectedResolution, setDetectedResolution] = useState<string | null>(null);

  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [currentJob, setCurrentJob] = useState<SplitJobStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef<boolean>(false);

  // Clean up object URLs and polling on unmount or file change
  useEffect(() => {
    return () => {
      isPollingRef.current = false;
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
      }
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, [videoPreviewUrl]);

  // Extract video duration and resolution in-browser for immediate feedback
  const handleFileSelect = (selectedFile: File) => {
    if (!selectedFile) return;
    setErrorMessage(null);

    // Validate type
    if (!selectedFile.type.startsWith("video/") && !selectedFile.name.match(/\.(mp4|mov|mkv|webm|avi|flv)$/i)) {
      setErrorMessage("Please select a valid video file (.mp4, .mov, .mkv, .webm, .avi).");
      return;
    }

    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setVideoPreviewUrl(objectUrl);
    setFile(selectedFile);

    // Probe in-browser using HTML5 Video
    const videoEl = document.createElement("video");
    videoEl.preload = "metadata";
    videoEl.src = objectUrl;

    videoEl.onloadedmetadata = () => {
      setDetectedDuration(videoEl.duration);
      if (videoEl.videoWidth && videoEl.videoHeight) {
        setDetectedResolution(`${videoEl.videoWidth} × ${videoEl.videoHeight}`);
      } else {
        setDetectedResolution("HD (Detected)");
      }
    };

    videoEl.onerror = () => {
      // Fallback if browser can't decode codec (e.g. some mkv containers); backend will still probe
      setDetectedDuration(null);
      setDetectedResolution("Standard");
    };
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDurationChange = (val: number) => {
    if (isNaN(val) || val <= 0) {
      setCustomDurationStr("");
      return;
    }
    const sanitized = Math.min(Math.max(1, Math.round(val)), 3600);
    setDuration(sanitized);
    setCustomDurationStr(sanitized.toString());
  };

  // Estimated clips count
  const estimatedClips = detectedDuration && duration > 0 ? Math.ceil(detectedDuration / duration) : null;

  const handleStartSplit = async () => {
    if (!file) {
      setErrorMessage("Please select a video file first.");
      return;
    }
    if (!duration || duration <= 0) {
      setErrorMessage("Please enter a valid clip duration (at least 1 second).");
      return;
    }

    setErrorMessage(null);
    setIsProcessing(true);
    setUploadProgress(0);

    try {
      const initRes = await uploadAndStartSplit(file, duration, (pct) => {
        setUploadProgress(pct);
      });

      const jobId = initRes.job_id;

      // Start non-overlapping polling with 2.5s interval
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
      isPollingRef.current = true;

      const pollStatus = async () => {
        if (!isPollingRef.current) return;

        try {
          const status = await getSplitJobStatus(jobId);
          if (!isPollingRef.current) return;

          setCurrentJob(status);

          if (status.status === "completed") {
            isPollingRef.current = false;
            setIsProcessing(false);
            return;
          } else if (status.status === "error") {
            isPollingRef.current = false;
            setIsProcessing(false);
            setErrorMessage(status.error || "Video splitting encountered an error.");
            return;
          }
        } catch (err: any) {
          console.error("Polling error:", err);
        }

        // Only schedule next poll if still active
        if (isPollingRef.current) {
          pollTimeoutRef.current = setTimeout(pollStatus, 2500);
        }
      };

      // Initial status poll after 1.5s
      pollTimeoutRef.current = setTimeout(pollStatus, 1500);
    } catch (err: any) {
      isPollingRef.current = false;
      setIsProcessing(false);
      setErrorMessage(err.message || "Failed to upload and start video splitting.");
    }
  };

  const handleReset = () => {
    isPollingRef.current = false;
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setFile(null);
    setVideoPreviewUrl(null);
    setDetectedDuration(null);
    setDetectedResolution(null);
    setCurrentJob(null);
    setIsProcessing(false);
    setErrorMessage(null);
    setUploadProgress(0);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="min-h-screen bg-[#090a0e] text-white flex flex-col selection:bg-white/20">
      <Navbar />

      <main className="flex-1 py-10 px-4 sm:px-6 lg:px-8 max-w-5xl w-full mx-auto flex flex-col gap-8">
        {/* Top Header & Mode Indicator */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono uppercase tracking-wider bg-white/[0.04] text-zinc-300 border border-white/10">
                <Scissors className="h-3 w-3 text-zinc-400" />
                <span>Deterministic Splitter</span>
              </span>
              <span className="text-xs text-zinc-500 font-mono">• Sequential Equal Cuts</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Split Video
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Split your long video into equal-length segments with precise keyframe cuts. No AI, zero transcription overhead.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.08] hover:text-white"
            >
              <Sparkles className="h-3.5 w-3.5 text-zinc-400" />
              <span>Switch to AI Clipper</span>
            </Link>
          </div>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-200 text-sm">
            <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-red-300 text-xs">Splitting Error</p>
              <p className="text-xs text-red-200/90 mt-0.5">{errorMessage}</p>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-xs font-medium text-red-400 hover:text-red-200 transition"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* STATE 1: UPLOAD & CONFIGURATION (Before starting split) */}
        {!isProcessing && (!currentJob || currentJob.status !== "completed") && (
          <div className="flex flex-col gap-6">
            {/* Upload Area */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "relative flex flex-col items-center justify-center rounded-xl border border-dashed p-8 sm:p-12 transition cursor-pointer text-center group",
                isDragOver
                  ? "border-white/40 bg-white/[0.03]"
                  : "border-white/15 bg-[#111318]/50 hover:border-white/25 hover:bg-[#111318]"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,.mkv,.mp4,.mov,.webm,.avi"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.04] text-zinc-300 border border-white/[0.08] mb-3.5 transition group-hover:text-white group-hover:border-white/20">
                <Upload className="h-5 w-5" />
              </div>

              <h3 className="text-sm sm:text-base font-semibold text-white tracking-tight">
                {file ? "Change selected video" : "Upload video to split"}
              </h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-sm">
                Drag and drop your video file here, or click to browse. Supports MP4, MOV, MKV, WebM, and AVI.
              </p>

              <button
                type="button"
                className="mt-4 rounded-lg bg-white/[0.05] px-3.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.1] border border-white/10"
              >
                Choose Video
              </button>
            </div>

            {/* Video Details Card (Appears once video selected) */}
            {file && (
              <div className="rounded-xl border border-white/[0.08] bg-[#111318] p-6 flex flex-col gap-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] text-zinc-300 border border-white/[0.08]">
                      <FileVideo className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white truncate max-w-sm sm:max-w-md">
                        {file.name}
                      </h4>
                      <p className="text-xs text-zinc-400 font-mono mt-0.5">
                        {formatFileSize(file.size)} &bull; {detectedResolution || "Analyzing resolution..."}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs font-mono">
                    <div className="rounded-lg bg-black/40 border border-white/[0.08] px-3 py-1.5 text-zinc-300">
                      <span className="text-zinc-500 mr-1.5">Source Length:</span>
                      <span className="font-semibold text-white">
                        {detectedDuration ? formatTime(detectedDuration) : "Detecting..."}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Duration Control Section */}
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <label className="text-sm font-semibold text-white flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-zinc-400" />
                        <span>Target Clip Duration</span>
                      </label>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        All segments will be created with this exact duration (last segment keeps remainder).
                      </p>
                    </div>

                    {/* Number Input */}
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <input
                        type="number"
                        min="1"
                        max="3600"
                        value={customDurationStr}
                        onChange={(e) => {
                          setCustomDurationStr(e.target.value);
                          const parsed = parseFloat(e.target.value);
                          if (!isNaN(parsed) && parsed > 0) {
                            setDuration(parsed);
                          }
                        }}
                        className="h-9 w-24 rounded-lg border border-white/10 bg-black/40 px-3 text-center text-sm font-mono font-medium text-white outline-none transition focus:border-white/30"
                      />
                      <span className="text-xs font-medium text-zinc-400">seconds</span>
                    </div>
                  </div>

                  {/* Quick Select Preset Buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-zinc-500 font-mono mr-1">Presets:</span>
                    {DURATION_PRESETS.map((presetSec) => (
                      <button
                        key={presetSec}
                        type="button"
                        onClick={() => handleDurationChange(presetSec)}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-xs font-mono font-medium transition border",
                          duration === presetSec
                            ? "bg-white text-black border-white"
                            : "bg-white/[0.03] text-zinc-400 border-white/[0.08] hover:border-white/20 hover:text-white"
                        )}
                      >
                        {presetSec}s
                      </button>
                    ))}
                  </div>

                  {/* Estimated Output Preview Banner */}
                  <div className="rounded-lg bg-black/30 border border-white/[0.06] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-zinc-300">
                    <div className="flex items-center gap-2">
                      <Film className="h-4 w-4 text-zinc-400 shrink-0" />
                      <span>
                        Estimated output:{" "}
                        <strong className="text-white font-semibold font-mono">
                          {estimatedClips !== null ? `${estimatedClips} clips` : "Calculating..."}
                        </strong>{" "}
                        (sequential {duration}s segments)
                      </span>
                    </div>
                    {detectedDuration && (
                      <span className="text-[11px] text-zinc-500 font-mono">
                        Formula: ceil({detectedDuration.toFixed(1)}s / {duration}s)
                      </span>
                    )}
                  </div>
                </div>

                {/* Primary Action Button */}
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleStartSplit}
                    className="flex h-10 w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-white px-6 text-xs font-semibold text-black transition hover:bg-zinc-200 active:scale-[0.98]"
                  >
                    <Scissors className="h-3.5 w-3.5" />
                    <span>Split Video ({duration}s segments)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STATE 2: DEDICATED PROCESSING SCREEN */}
        {isProcessing && (
          <div className="rounded-xl border border-white/[0.08] bg-[#111318] p-6 sm:p-8 flex flex-col gap-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                  Video Split Engine
                </span>
                <h3 className="text-xl font-bold text-white tracking-tight mt-0.5">
                  Splitting Video
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  {currentJob?.current_message || (uploadProgress < 100 ? `Uploading video (${uploadProgress}%)...` : "Cutting sequential segments via stream-copy...")}
                </p>
              </div>

              <div className="flex flex-col sm:items-end">
                <span className="font-mono text-2xl font-bold text-white tracking-tight">
                  {currentJob?.progress_percent || uploadProgress || 5}%
                </span>
                <span className="text-xs text-zinc-400 font-mono mt-0.5">
                  {currentJob?.clips_created || 0} / {currentJob?.total_clips || estimatedClips || "?"} clips cut
                </span>
              </div>
            </div>

            {/* Progress Bar Track */}
            <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-white transition-all duration-300 ease-out"
                style={{ width: `${currentJob?.progress_percent || (uploadProgress > 0 ? Math.round(uploadProgress * 0.2) : 5)}%` }}
              />
            </div>

            {/* Non-AI Simple Stage Checklist */}
            <div className="flex flex-col gap-2 pt-1 border-t border-white/[0.06]">
              <div className="flex items-center gap-2.5 text-xs text-emerald-400 font-mono">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>Video uploaded ({file ? formatFileSize(file.size) : "100%"})</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-emerald-400 font-mono">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>Video container analyzed ({detectedResolution || "Source Resolution"})</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-white font-mono">
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-400" />
                <span>
                  Cutting {duration}s segments ({currentJob?.clips_created || 0} completed)...
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-zinc-500 font-mono">
                <div className="h-3.5 w-3.5 rounded-full border border-zinc-700 flex items-center justify-center shrink-0">
                  <span className="h-1 w-1 rounded-full bg-zinc-700"></span>
                </div>
                <span>Packaging ZIP archive</span>
              </div>
            </div>
          </div>
        )}

        {/* STATE 3: RESULTS SCREEN (Completed) */}
        {!isProcessing && currentJob && currentJob.status === "completed" && (
          <div className="flex flex-col gap-6">
            {/* Completion Header Banner */}
            <div className="rounded-xl border border-white/[0.08] bg-[#111318] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-emerald-400 mb-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Splitting Complete</span>
                </span>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Your clips are ready
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Generated {currentJob.clips.length} equal-length {currentJob.clip_duration}s clips with zero quality loss.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Split Another</span>
                </button>

                {currentJob.zip_url && (
                  <a
                    href={getDownloadAllZipUrl(currentJob.job_id)}
                    download="split-clips.zip"
                    className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-zinc-200 active:scale-[0.98]"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    <span>Download All (ZIP)</span>
                  </a>
                )}
              </div>
            </div>

            {/* Clips Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentJob.clips.map((clip, index) => (
                <div
                  key={`${clip.filename}-${index}`}
                  className="rounded-xl border border-white/[0.08] bg-[#111318] overflow-hidden flex flex-col transition hover:border-white/20 shadow-sm"
                >
                  {/* Video Player */}
                  <div className="relative aspect-video bg-black/80 flex items-center justify-center">
                    <video
                      src={
                        clip.url
                          ? clip.url.startsWith("http")
                            ? clip.url
                            : `${BACKEND_URL}${clip.url}`
                          : `${BACKEND_URL}/output/split/${currentJob.job_id}/${clip.filename}`
                      }
                      controls
                      preload="metadata"
                      className="h-full w-full object-contain"
                    />
                  </div>

                  {/* Clip Details */}
                  <div className="p-3.5 flex-1 flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white font-mono">
                          Clip #{clip.index.toString().padStart(3, "0")}
                        </span>
                        <span className="text-[11px] font-mono text-zinc-400 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.08]">
                          {clip.duration}s
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 font-mono mt-1">
                        {clip.start_formatted} &rarr; {clip.end_formatted}
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
                      <span className="text-[11px] text-zinc-500 font-mono">
                        {clip.size_formatted || "MP4 Video"}
                      </span>
                      <a
                        href={getIndividualClipDownloadUrl(currentJob.job_id, clip.filename)}
                        download={clip.filename}
                        className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/10 hover:text-white"
                      >
                        <Download className="h-3 w-3" />
                        <span>Download</span>
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

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
    <div className="min-h-screen bg-[#090a0f] text-white flex flex-col selection:bg-purple-500/30">
      <Navbar />

      <main className="flex-1 py-10 px-4 sm:px-6 lg:px-8 max-w-5xl w-full mx-auto flex flex-col gap-8">
        {/* Top Header & Mode Indicator */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Scissors className="h-3 w-3" />
                <span>Deterministic Splitter</span>
              </span>
              <span className="text-xs text-zinc-500">• Sequential Equal Cuts</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Split Video
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Split your long video into equal-length clips with exact timestamps. No AI, no transcripts.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
            >
              <Sparkles className="h-3.5 w-3.5 text-blue-400" />
              <span>Switch to AI Clipper</span>
            </Link>
          </div>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200 text-sm">
            <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-red-300">Splitting Error</p>
              <p className="text-xs text-red-200/90 mt-0.5">{errorMessage}</p>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-xs font-semibold text-red-400 hover:text-red-200 transition"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* STATE 1: UPLOAD & CONFIGURATION (Before starting split) */}
        {!isProcessing && (!currentJob || currentJob.status !== "completed") && (
          <div className="flex flex-col gap-8">
            {/* Upload Area */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 sm:p-12 transition cursor-pointer text-center group",
                isDragOver
                  ? "border-purple-500 bg-purple-500/[0.05]"
                  : "border-white/15 bg-[#11141d]/70 hover:border-white/30 hover:bg-[#11141d]"
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

              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] text-white border border-white/10 mb-4 transition group-hover:scale-105 group-hover:bg-purple-500/20 group-hover:text-purple-300 group-hover:border-purple-500/30">
                <Upload className="h-6 w-6" />
              </div>

              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                {file ? "Change selected video" : "Upload your video to split"}
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-md">
                Drag and drop your file here, or click to browse. Supports MP4, MOV, MKV, WebM, and AVI.
              </p>

              <button
                type="button"
                className="mt-5 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20 border border-white/10"
              >
                Choose Video
              </button>
            </div>

            {/* Video Details Card (Appears once video selected) */}
            {file && (
              <div className="rounded-2xl border border-white/10 bg-[#11141d] p-6 sm:p-8 flex flex-col gap-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                      <FileVideo className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm sm:text-base font-bold text-white truncate max-w-sm sm:max-w-md">
                        {file.name}
                      </h4>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {formatFileSize(file.size)} &bull; {detectedResolution || "Analyzing..."}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs font-mono">
                    <div className="rounded-lg bg-black/40 border border-white/10 px-3 py-1.5 text-zinc-300">
                      <span className="text-zinc-500 mr-1">Duration:</span>
                      <span className="font-bold text-white">
                        {detectedDuration ? formatTime(detectedDuration) : "Detecting..."}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Duration Control Section */}
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <label className="text-sm font-bold text-white flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-purple-400" />
                        <span>Clip Duration</span>
                      </label>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Every resulting segment will be exactly this length (last clip keeps remainder).
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
                        className="h-10 w-24 rounded-lg border border-white/15 bg-black/50 px-3 text-center text-sm font-bold font-mono text-white outline-none transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                      />
                      <span className="text-xs font-semibold text-zinc-400">seconds</span>
                    </div>
                  </div>

                  {/* Quick Select Preset Buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-zinc-500 mr-1">Quick select:</span>
                    {DURATION_PRESETS.map((presetSec) => (
                      <button
                        key={presetSec}
                        type="button"
                        onClick={() => handleDurationChange(presetSec)}
                        className={cn(
                          "rounded-lg px-3 py-1 text-xs font-semibold transition border",
                          duration === presetSec
                            ? "bg-purple-500 text-white border-purple-400 shadow-sm"
                            : "bg-white/[0.04] text-zinc-300 border-white/10 hover:border-white/25 hover:text-white"
                        )}
                      >
                        {presetSec}s
                      </button>
                    ))}
                  </div>

                  {/* Estimated Output Preview Banner */}
                  <div className="mt-2 rounded-xl bg-purple-500/[0.06] border border-purple-500/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-zinc-300">
                    <div className="flex items-center gap-2">
                      <Film className="h-4 w-4 text-purple-400 shrink-0" />
                      <span>
                        Estimated output:{" "}
                        <strong className="text-white font-bold">
                          {estimatedClips !== null ? `${estimatedClips} clips` : "Calculating..."}
                        </strong>{" "}
                        (sequential {duration}s cuts)
                      </span>
                    </div>
                    {detectedDuration && (
                      <span className="text-[11px] text-zinc-400 font-mono">
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
                    className="flex h-12 w-full sm:w-auto items-center justify-center gap-2.5 rounded-xl bg-purple-600 px-8 text-sm font-bold text-white transition hover:bg-purple-500 active:scale-[0.98] shadow-lg shadow-purple-600/20"
                  >
                    <Scissors className="h-4 w-4" />
                    <span>Split Video ({duration}s clips)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STATE 2: DEDICATED PROCESSING SCREEN */}
        {isProcessing && (
          <div className="rounded-2xl border border-white/10 bg-[#11141d] p-6 sm:p-10 shadow-sm flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-purple-400">
                  Video Split Engine
                </span>
                <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-0.5">
                  Splitting your video
                </h3>
                <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                  {currentJob?.current_message || (uploadProgress < 100 ? `Uploading video (${uploadProgress}%)...` : "Creating fixed-length clips...")}
                </p>
              </div>

              <div className="flex flex-col items-end">
                <span className="font-mono text-3xl font-bold text-white tracking-tight">
                  {currentJob?.progress_percent || uploadProgress || 5}%
                </span>
                <span className="text-xs text-zinc-400 font-mono mt-0.5">
                  {currentJob?.clips_created || 0} / {currentJob?.total_clips || estimatedClips || "?"} clips created
                </span>
              </div>
            </div>

            {/* Progress Bar Track */}
            <div className="h-2.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 transition-all duration-300 ease-out"
                style={{ width: `${currentJob?.progress_percent || (uploadProgress > 0 ? Math.round(uploadProgress * 0.2) : 5)}%` }}
              />
            </div>

            {/* Non-AI Simple Stage Checklist */}
            <div className="flex flex-col gap-2.5 pt-2">
              <div className="flex items-center gap-3 text-xs sm:text-sm text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Video uploaded ({file ? formatFileSize(file.size) : "100%"})</span>
              </div>
              <div className="flex items-center gap-3 text-xs sm:text-sm text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Video analyzed ({detectedResolution || "Full resolution"})</span>
              </div>
              <div className="flex items-center gap-3 text-xs sm:text-sm text-purple-300 font-semibold">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-purple-400" />
                <span>
                  Splitting video into {duration}-second segments ({currentJob?.clips_created || 0} clips rendered so far)...
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs sm:text-sm text-zinc-500">
                <div className="h-4 w-4 rounded-full border border-zinc-700 flex items-center justify-center shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-700"></span>
                </div>
                <span>Finalizing files & generating bulk ZIP package</span>
              </div>
            </div>
          </div>
        )}

        {/* STATE 3: RESULTS SCREEN (Completed) */}
        {!isProcessing && currentJob && currentJob.status === "completed" && (
          <div className="flex flex-col gap-6">
            {/* Completion Header Banner */}
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
                  Splitting Complete
                </span>
                <h2 className="text-2xl font-bold text-white tracking-tight mt-0.5">
                  Your clips are ready
                </h2>
                <p className="text-xs sm:text-sm text-emerald-200/80 mt-1">
                  Successfully created {currentJob.clips.length} equal-length {currentJob.clip_duration}s segments.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Split Another</span>
                </button>

                {currentJob.zip_url && (
                  <a
                    href={getDownloadAllZipUrl(currentJob.job_id)}
                    download="split-clips.zip"
                    className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-xs font-bold text-black transition hover:bg-zinc-200 active:scale-[0.98] shadow-md shadow-white/5"
                  >
                    <Archive className="h-4 w-4" />
                    <span>Download All (ZIP)</span>
                  </a>
                )}
              </div>
            </div>

            {/* Clips Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {currentJob.clips.map((clip) => (
                <div
                  key={clip.filename}
                  className="rounded-2xl border border-white/10 bg-[#11141d] overflow-hidden flex flex-col transition hover:border-white/20 shadow-sm"
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
                  <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-white">
                          Clip {clip.index.toString().padStart(3, "0")}
                        </span>
                        <span className="text-[11px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                          {clip.duration}s
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 font-mono mt-1">
                        {clip.start_formatted} &rarr; {clip.end_formatted}
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-t border-white/[0.08] pt-3">
                      <span className="text-[11px] text-zinc-500 font-mono">
                        {clip.size_formatted || "MP4 Video"}
                      </span>
                      <a
                        href={getIndividualClipDownloadUrl(currentJob.job_id, clip.filename)}
                        download={clip.filename}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
                      >
                        <Download className="h-3.5 w-3.5" />
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

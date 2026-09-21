"use client";

import { useState, useRef } from "react";
import { Sparkles, Loader2, Zap, Upload, Film, FileVideo, X, CheckCircle2 } from "lucide-react";
import { cn, formatTime } from "@/lib/utils";

interface UrlInputProps {
  onSubmit: (url: string, count: number) => void;
  onUploadSubmit?: (file: File, count: number) => void;
  isLoading: boolean;
  uploadProgress?: number;
  disabled?: boolean;
}

export function UrlInput({
  onSubmit,
  onUploadSubmit,
  isLoading,
  uploadProgress = 0,
  disabled = false,
}: UrlInputProps) {
  const [activeTab, setActiveTab] = useState<"url" | "upload">("url");
  const [url, setUrl] = useState("");
  const [clipCount, setClipCount] = useState<number>(10);
  const [inputError, setInputError] = useState<string | null>(null);

  // Upload tab state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [detectedDuration, setDetectedDuration] = useState<number | null>(null);
  const [detectedResolution, setDetectedResolution] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const presets = [
    {
      label: "Steve Jobs Stanford Speech",
      url: "https://www.youtube.com/watch?v=UF8uR6Z6KLc",
    },
    {
      label: "Veritasium - First Video",
      url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    },
  ];

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      setInputError("Please enter a YouTube video URL.");
      return;
    }

    if (!cleanUrl.includes("youtube.com") && !cleanUrl.includes("youtu.be")) {
      setInputError("Invalid YouTube URL. Please use https://www.youtube.com/... or https://youtu.be/...");
      return;
    }

    setInputError(null);
    onSubmit(cleanUrl, clipCount);
  };

  const handleFileSelect = (file: File) => {
    if (!file) return;
    setInputError(null);

    if (!file.type.startsWith("video/") && !file.name.match(/\.(mp4|mov|mkv|webm|avi|flv)$/i)) {
      setInputError("Please select a valid video file (.mp4, .mov, .mkv, .webm, .avi).");
      return;
    }

    setSelectedFile(file);

    // In-browser probe for duration and resolution
    try {
      const objectUrl = URL.createObjectURL(file);
      const videoEl = document.createElement("video");
      videoEl.preload = "metadata";
      videoEl.src = objectUrl;

      videoEl.onloadedmetadata = () => {
        setDetectedDuration(videoEl.duration);
        if (videoEl.videoWidth && videoEl.videoHeight) {
          setDetectedResolution(`${videoEl.videoWidth} × ${videoEl.videoHeight}`);
        } else {
          setDetectedResolution("HD");
        }
        URL.revokeObjectURL(objectUrl);
      };

      videoEl.onerror = () => {
        setDetectedDuration(null);
        setDetectedResolution(null);
        URL.revokeObjectURL(objectUrl);
      };
    } catch {
      setDetectedDuration(null);
      setDetectedResolution(null);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setInputError("Please select or drop a video file first.");
      return;
    }
    if (detectedDuration && detectedDuration > 35 * 60) {
      setInputError("Video exceeds the 35-minute duration limit. Please select a shorter video.");
      return;
    }

    setInputError(null);
    if (onUploadSubmit) {
      onUploadSubmit(selectedFile, clipCount);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#111319] p-5 sm:p-6">
      {/* Top Header & Mode Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-white tracking-tight">AI Clipper Studio</h2>
            <span className="font-mono text-[11px] text-zinc-500">2.0 credits/min</span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Submit a video link or upload a file to detect and extract key moments.
          </p>
        </div>

        {/* Source Toggle: YouTube vs Direct Upload */}
        <div className="flex items-center gap-1 self-start sm:self-auto rounded-lg border border-white/[0.08] bg-[#0c0e12] p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => {
              setActiveTab("url");
              setInputError(null);
            }}
            disabled={disabled || isLoading}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 transition",
              activeTab === "url"
                ? "bg-white text-black font-semibold shadow-sm"
                : "text-zinc-400 hover:text-white"
            )}
          >
            <span>YouTube Link</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("upload");
              setInputError(null);
            }}
            disabled={disabled || isLoading}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 transition",
              activeTab === "upload"
                ? "bg-white text-black font-semibold shadow-sm"
                : "text-zinc-400 hover:text-white"
            )}
          >
            <Upload className="h-3 w-3" />
            <span>Upload File</span>
          </button>
        </div>
      </div>

      {/* Target Clip Count Selector */}
      <div className="flex items-center justify-between gap-4 mb-4 pb-3.5 border-b border-white/[0.06]">
        <span className="text-xs text-zinc-400">Target clips:</span>
        <div className="flex items-center gap-1 rounded-md border border-white/[0.08] bg-[#0c0e12] p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setClipCount(5)}
            disabled={disabled || isLoading}
            className={cn(
              "rounded px-2.5 py-1 font-medium transition",
              clipCount === 5 ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"
            )}
          >
            5 clips
          </button>
          <button
            type="button"
            onClick={() => setClipCount(10)}
            disabled={disabled || isLoading}
            className={cn(
              "rounded px-2.5 py-1 font-medium transition",
              clipCount === 10 ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"
            )}
          >
            10 clips
          </button>
        </div>
      </div>

      {/* TAB 1: YOUTUBE URL INPUT */}
      {activeTab === "url" && (
        <form onSubmit={handleUrlSubmit} className="flex flex-col gap-3.5">
          <div className="relative flex items-center">
            <input
              type="text"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (inputError) setInputError(null);
              }}
              disabled={disabled || isLoading}
              placeholder="Paste YouTube link (e.g. https://www.youtube.com/watch?v=...)"
              className={cn(
                "h-11 w-full rounded-lg border bg-[#0c0e12] px-3.5 text-xs text-white placeholder-zinc-500 outline-none transition focus:border-white/30",
                inputError ? "border-red-500/50" : "border-white/[0.08]"
              )}
            />
          </div>

          {inputError && (
            <p className="text-xs text-red-400">{inputError}</p>
          )}

          {/* Demo Presets & Submit Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="text-zinc-500">Sample:</span>
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setUrl(p.url);
                    setInputError(null);
                  }}
                  disabled={disabled || isLoading}
                  className="rounded border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-[11px] text-zinc-400 transition hover:border-white/20 hover:text-white"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={disabled || isLoading || !url.trim()}
              className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-white px-5 text-xs font-semibold text-black transition hover:bg-zinc-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>Generate Clips</span>
              )}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: DIRECT VIDEO FILE UPLOAD */}
      {activeTab === "upload" && (
        <form onSubmit={handleUploadSubmit} className="flex flex-col gap-3.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,.mp4,.mov,.mkv,.webm,.avi"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelect(e.target.files[0]);
              }
            }}
          />

          {!selectedFile ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "flex flex-col items-center justify-center p-8 border border-dashed rounded-lg cursor-pointer transition text-center",
                isDragOver
                  ? "border-blue-500 bg-blue-500/5"
                  : "border-white/[0.1] bg-[#0c0e12] hover:border-white/20"
              )}
            >
              <div className="p-2.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-zinc-400 mb-2.5">
                <Upload className="h-5 w-5 stroke-[1.8]" />
              </div>
              <p className="text-xs font-medium text-white">
                Drag and drop video file, or <span className="text-blue-400 underline underline-offset-2">browse</span>
              </p>
              <p className="text-[11px] text-zinc-500 mt-1 font-mono">
                MP4, MOV, MKV, WebM, AVI (up to 35 minutes)
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-white/[0.08] bg-[#0c0e12] p-3.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded bg-white/[0.04] text-zinc-400 shrink-0">
                    <FileVideo className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{selectedFile.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-400 font-mono">
                      <span>{formatFileSize(selectedFile.size)}</span>
                      {detectedDuration && (
                        <>
                          <span>&bull;</span>
                          <span>{formatTime(detectedDuration)}</span>
                        </>
                      )}
                      {detectedResolution && (
                        <>
                          <span>&bull;</span>
                          <span>{detectedResolution}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {!isLoading && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setDetectedDuration(null);
                      setDetectedResolution(null);
                    }}
                    className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/5 transition"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Upload Progress Bar */}
              {isLoading && uploadProgress > 0 && uploadProgress < 100 && (
                <div className="flex flex-col gap-1 pt-1">
                  <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
                    <span>Uploading...</span>
                    <span className="text-white">{uploadProgress}%</span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-white transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {inputError && (
            <p className="text-xs text-red-400">{inputError}</p>
          )}

          {/* Submit Row for Upload */}
          <div className="flex items-center justify-between pt-1">
            <p className="text-[11px] text-zinc-500 font-mono">
              {detectedDuration
                ? `Estimated usage: ~${Math.ceil((detectedDuration / 60) * 2.0)} credits`
                : "Direct upload with audio transcription"}
            </p>

            <button
              type="submit"
              disabled={disabled || isLoading || !selectedFile}
              className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-white text-black px-5 text-xs font-semibold transition hover:bg-zinc-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>
                    {uploadProgress < 100 && uploadProgress > 0 ? `Uploading (${uploadProgress}%)...` : "Processing..."}
                  </span>
                </>
              ) : (
                <span>Generate Clips</span>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

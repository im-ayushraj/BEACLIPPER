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
    <div className="rounded-2xl border border-white/[0.1] bg-[#11141d] p-6 sm:p-8 shadow-sm">
      {/* Top Header & Mode Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl font-bold text-white tracking-tight">AI Clipper Studio</h2>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Max 35 min
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Zap className="h-3 w-3 fill-amber-400" /> 2.0 Credits / min
            </span>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Submit a YouTube link or upload your own video file to discover and render top viral moments.
          </p>
        </div>

        {/* Source Toggle: YouTube vs Direct Upload */}
        <div className="flex items-center gap-1 self-start sm:self-auto rounded-xl border border-white/10 bg-[#07080b] p-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab("url");
              setInputError(null);
            }}
            disabled={disabled || isLoading}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              activeTab === "url"
                ? "bg-white/15 text-white shadow-sm"
                : "text-zinc-400 hover:text-white"
            )}
          >
            <svg className="h-3.5 w-3.5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
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
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              activeTab === "upload"
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-sm"
                : "text-zinc-400 hover:text-white"
            )}
          >
            <Upload className="h-3.5 w-3.5 text-purple-400" />
            <span>Upload Video</span>
          </button>
        </div>
      </div>

      {/* Clip Count Selector */}
      <div className="flex items-center justify-between gap-4 mb-5 pb-4 border-b border-white/5">
        <span className="text-xs font-medium text-zinc-400">Target Viral Clips:</span>
        <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#07080b] p-1">
          <button
            type="button"
            onClick={() => setClipCount(5)}
            disabled={disabled || isLoading}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-semibold transition",
              clipCount === 5 ? "bg-white/15 text-white" : "text-zinc-400 hover:text-white"
            )}
          >
            5 Clips
          </button>
          <button
            type="button"
            onClick={() => setClipCount(10)}
            disabled={disabled || isLoading}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-semibold transition",
              clipCount === 10 ? "bg-white/15 text-white" : "text-zinc-400 hover:text-white"
            )}
          >
            10 Clips (Recommended)
          </button>
        </div>
      </div>

      {/* TAB 1: YOUTUBE URL INPUT */}
      {activeTab === "url" && (
        <form onSubmit={handleUrlSubmit} className="flex flex-col gap-4">
          <div className="relative flex items-center">
            <div className="pointer-events-none absolute left-4 flex items-center text-zinc-500">
              <svg className="h-5 w-5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
            </div>
            <input
              type="text"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (inputError) setInputError(null);
              }}
              disabled={disabled || isLoading}
              placeholder="https://www.youtube.com/watch?v=... (up to 35 min)"
              className={cn(
                "h-14 w-full rounded-xl border bg-[#07080b] pl-12 pr-4 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
                inputError ? "border-red-500/50" : "border-white/10"
              )}
            />
          </div>

          {inputError && (
            <p className="text-xs text-red-400">{inputError}</p>
          )}

          {/* Demo Presets & Submit Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-zinc-500">Try demo:</span>
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setUrl(p.url);
                    setInputError(null);
                  }}
                  disabled={disabled || isLoading}
                  className="rounded-full border border-white/5 bg-white/[0.03] px-3 py-1 text-xs text-zinc-400 transition hover:border-white/20 hover:text-white"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={disabled || isLoading || !url.trim()}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-7 text-sm font-bold text-black transition hover:bg-zinc-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 shadow-sm"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing Video...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 fill-black" />
                  <span>Start AI Clipping</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: DIRECT VIDEO FILE UPLOAD */}
      {activeTab === "upload" && (
        <form onSubmit={handleUploadSubmit} className="flex flex-col gap-4">
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
                "flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl cursor-pointer transition text-center",
                isDragOver
                  ? "border-purple-500 bg-purple-500/10"
                  : "border-white/10 bg-[#07080b]/50 hover:border-purple-500/50 hover:bg-purple-500/[0.03]"
              )}
            >
              <div className="p-3.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 mb-3">
                <Upload className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-semibold text-white">
                Drag and drop your video file here, or <span className="text-purple-400 underline">browse</span>
              </h4>
              <p className="text-xs text-zinc-400 mt-1">
                Supports MP4, MOV, MKV, WebM, AVI (up to 35 minutes)
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-[#07080b] p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 shrink-0">
                    <FileVideo className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{selectedFile.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-400">
                      <span>{formatFileSize(selectedFile.size)}</span>
                      {detectedDuration && (
                        <>
                          <span>•</span>
                          <span>{formatTime(detectedDuration)}</span>
                        </>
                      )}
                      {detectedResolution && (
                        <>
                          <span>•</span>
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
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Upload Progress Bar (if actively uploading) */}
              {isLoading && uploadProgress > 0 && uploadProgress < 100 && (
                <div className="flex flex-col gap-1 pt-1">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Uploading video to processing engine...</span>
                    <span className="font-semibold text-purple-400">{uploadProgress}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-300"
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
            <p className="text-xs text-zinc-500">
              {detectedDuration
                ? `Estimated credits: ~${Math.ceil((detectedDuration / 60) * 2.0)} credits`
                : "Direct file clipping with AI transcription"}
            </p>

            <button
              type="submit"
              disabled={disabled || isLoading || !selectedFile}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white px-7 text-sm font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 shadow-sm"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>
                    {uploadProgress < 100 && uploadProgress > 0 ? `Uploading (${uploadProgress}%)...` : "Processing Video..."}
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 fill-white" />
                  <span>Start AI Clipping</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

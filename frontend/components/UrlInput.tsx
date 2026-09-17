"use client";

import { useState } from "react";
import { Sparkles, Loader2, Video, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface UrlInputProps {
  onSubmit: (url: string, count: number) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export function UrlInput({ onSubmit, isLoading, disabled = false }: UrlInputProps) {
  const [url, setUrl] = useState("");
  const [clipCount, setClipCount] = useState<number>(10);
  const [inputError, setInputError] = useState<string | null>(null);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      setInputError("Please enter a YouTube video URL.");
      return;
    }

    // Validation for youtube.com or youtu.be
    if (!cleanUrl.includes("youtube.com") && !cleanUrl.includes("youtu.be")) {
      setInputError("Invalid YouTube URL. Please use https://www.youtube.com/... or https://youtu.be/...");
      return;
    }

    setInputError(null);
    onSubmit(cleanUrl, clipCount);
  };

  return (
    <div className="rounded-2xl border border-white/[0.1] bg-[#11141d] p-6 sm:p-8 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl font-bold text-white tracking-tight">Start Clipping</h2>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Max 35 min
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Zap className="h-3 w-3 fill-amber-400" /> 2.0 Credits / min
            </span>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Paste any YouTube video link (up to 35 mins) to discover and render top viral standalone moments.
          </p>
        </div>

        {/* Clip Count Selector */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-white/10 bg-[#07080b] p-1">
          <button
            type="button"
            onClick={() => setClipCount(5)}
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
            className={cn(
              "rounded px-2.5 py-1 text-xs font-semibold transition",
              clipCount === 10 ? "bg-white/15 text-white" : "text-zinc-400 hover:text-white"
            )}
          >
            10 Clips (Recommended)
          </button>
        </div>
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
                <span>Start Clipping</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

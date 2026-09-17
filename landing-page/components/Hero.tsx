"use client";

import { ArrowRight, Sparkles, Scissors, Play, Download, CheckCircle2, Clock } from "lucide-react";
import { analytics } from "@/lib/analytics";

export function Hero() {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28">
      {/* Background subtle glow */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-blue-500/10 blur-[120px] rounded-full" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center">
        {/* Top badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1 text-xs font-medium text-zinc-300 backdrop-blur-sm mb-6">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Accepting Early Access Creator Applications</span>
        </div>

        {/* Main Headline */}
        <h1 className="max-w-4xl text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-[1.15]">
          Turn Long Videos Into <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400">Short-Form Content.</span>
        </h1>

        {/* Supporting Copy */}
        <p className="mt-6 max-w-2xl text-base sm:text-lg text-zinc-400 leading-relaxed">
          Automatically find the most important moments in your videos, turn them into short clips, or split videos into fixed durations — all from one simple workspace.
        </p>

        {/* CTA Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <button
            onClick={() => {
              analytics.heroCtaClicked();
              scrollTo("waitlist");
            }}
            className="w-full sm:w-auto group flex items-center justify-center gap-2.5 rounded-xl bg-white px-8 py-3.5 text-sm font-bold text-black transition hover:bg-zinc-200 active:scale-[0.98] shadow-lg shadow-white/10"
          >
            <span>Join the Waitlist</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          <button
            onClick={() => {
              analytics.howItWorksViewed();
              scrollTo("how-it-works");
            }}
            className="w-full sm:w-auto rounded-xl border border-white/10 bg-white/5 px-7 py-3.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
          >
            See How It Works
          </button>
        </div>

        {/* Metric indicators */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>Semantic Hook & Retention Ranking</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>30–60s Automated Verification</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>Zero-Credit Fast FFmpeg Splitter</span>
          </div>
        </div>

        {/* Realistic Product UI Preview */}
        <div className="mt-14 w-full max-w-5xl rounded-2xl border border-white/10 bg-[#0f1118] p-3 sm:p-5 shadow-2xl shadow-black/80">
          {/* Mockup Window Bar */}
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4 px-2">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-500/80" />
              <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
              <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
              <span className="ml-2 text-xs font-mono text-zinc-500 hidden sm:inline">clipper.so/dashboard</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-0.5 text-[11px] font-medium">
                <Sparkles className="h-3 w-3" /> AI Moment Discovery
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2.5 py-0.5 text-[11px] font-medium">
                <Scissors className="h-3 w-3" /> Sequential Splitter
              </span>
            </div>
          </div>

          {/* Inner UI: Video, Transcripts, and Generated Moments */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-left">
            {/* Left: Video & Timestamps (5 cols) */}
            <div className="lg:col-span-5 flex flex-col gap-3 rounded-xl border border-white/5 bg-[#090a0f] p-4">
              <div className="relative aspect-video w-full rounded-lg bg-zinc-900 border border-white/10 overflow-hidden flex items-center justify-center group">
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white">
                  <Play className="h-4 w-4 fill-white ml-0.5" />
                </div>
                <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[11px] text-zinc-300 font-mono">
                  <span>How to Build 10x Software in 2026.mp4</span>
                  <span>18:42</span>
                </div>
              </div>

              {/* Timestamped Transcript Feed */}
              <div className="flex flex-col gap-2 mt-1">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-400 pb-1 border-b border-white/5">
                  <span>Timestamped Transcript</span>
                  <span className="text-emerald-400 text-[10px]">99.4% Confidence</span>
                </div>
                <div className="text-xs font-mono space-y-1.5 text-zinc-400">
                  <div className="p-1.5 rounded bg-white/[0.02]">
                    <span className="text-blue-400 font-semibold">[00:10 - 00:35]</span> &quot;If you are not using AI assistants, you are going to fall behind very quickly.&quot;
                  </div>
                  <div className="p-1.5 rounded bg-blue-500/10 border border-blue-500/20 text-zinc-200">
                    <span className="text-amber-400 font-semibold">[03:45 - 04:30]</span> &quot;The number one mistake developers make is monolithic prompts instead of modular pipelines.&quot;
                  </div>
                  <div className="p-1.5 rounded bg-white/[0.02]">
                    <span className="text-blue-400 font-semibold">[08:15 - 09:00]</span> &quot;Your laptop CPU can now encode high definition clips at 100 frames per second.&quot;
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Detected Viral Moments (7 cols) */}
            <div className="lg:col-span-7 flex flex-col gap-3 rounded-xl border border-white/5 bg-[#090a0f] p-4">
              <div className="flex items-center justify-between pb-1 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">Detected Standalone Moments</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.2 text-[10px] text-zinc-300">3 Clips</span>
                </div>
                <span className="text-xs text-zinc-400 font-mono flex items-center gap-1">
                  <Clock className="h-3 w-3 text-blue-400" /> 30s - 60s
                </span>
              </div>

              {/* Clip Cards */}
              <div className="space-y-2.5">
                {/* Clip 1 */}
                <div className="rounded-lg border border-white/10 bg-[#11141d] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-bold">
                        Viral Score: 94/100
                      </span>
                      <span className="text-xs font-semibold text-white">The Number One AI Prompting Mistake</span>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Strong hook addressing developer architecture misconceptions with clear actionable payoff.
                    </p>
                    <div className="text-[10px] font-mono text-zinc-500">03:45 → 04:30 • 45s • 1080p MP4</div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <button className="flex items-center gap-1 rounded-md bg-white px-3 py-1.5 text-xs font-bold text-black hover:bg-zinc-200">
                      <Download className="h-3 w-3" /> Clip
                    </button>
                  </div>
                </div>

                {/* Clip 2 */}
                <div className="rounded-lg border border-white/10 bg-[#11141d] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-bold">
                        Viral Score: 91/100
                      </span>
                      <span className="text-xs font-semibold text-white">Why Local Hardware Outperforms Cloud GPUs</span>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Surprising data comparison demonstrating high speed local FFmpeg video processing.
                    </p>
                    <div className="text-[10px] font-mono text-zinc-500">08:15 → 09:00 • 45s • 1080p MP4</div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <button className="flex items-center gap-1 rounded-md bg-white px-3 py-1.5 text-xs font-bold text-black hover:bg-zinc-200">
                      <Download className="h-3 w-3" /> Clip
                    </button>
                  </div>
                </div>

                {/* Clip 3 */}
                <div className="rounded-lg border border-white/10 bg-[#11141d] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 text-[10px] font-bold">
                        Viral Score: 87/100
                      </span>
                      <span className="text-xs font-semibold text-white">The Reality of Engineering in 2026</span>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Urgent industry warning opening with a compelling career thesis.
                    </p>
                    <div className="text-[10px] font-mono text-zinc-500">00:10 → 00:48 • 38s • 1080p MP4</div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <button className="flex items-center gap-1 rounded-md bg-white px-3 py-1.5 text-xs font-bold text-black hover:bg-zinc-200">
                      <Download className="h-3 w-3" /> Clip
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

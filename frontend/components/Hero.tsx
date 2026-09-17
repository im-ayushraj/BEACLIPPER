import Link from "next/link";
import { ArrowRight, Sparkles, Play, Flame, Clock, CheckCircle2, Scissors } from "lucide-react";

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-20 pb-24 md:pt-28 md:pb-32">
      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
        {/* Subtle Pill Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1 text-xs font-medium text-zinc-300 backdrop-blur-sm">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
          <span>Two Powerful Tools • AI Clipper & Video Splitter</span>
        </div>

        {/* Hero Title */}
        <h1 className="mt-8 text-4xl font-extrabold tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
          Transform long videos into <br className="hidden sm:inline" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400">
            perfect short clips.
          </span>
        </h1>

        {/* Supporting Text */}
        <p className="mx-auto mt-6 max-w-2xl text-base text-zinc-400 sm:text-lg md:text-xl">
          Choose between intelligent AI-driven viral moment extraction or fast, frame-accurate sequential video splitting. Built for creators and editors.
        </p>

        {/* Dual Workflow Selection Cards */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6 text-left max-w-4xl mx-auto">
          {/* Card 1: AI Clipper */}
          <div className="group relative rounded-2xl border border-blue-500/20 bg-gradient-to-b from-[#111624] to-[#0c0f18] p-7 transition hover:border-blue-500/40 hover:shadow-xl hover:shadow-blue-950/30 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <Sparkles className="h-6 w-6" />
                </div>
                <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
                  AI-Powered
                </span>
              </div>
              <h3 className="mt-5 text-xl font-bold text-white">AI Video Clipper</h3>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                Paste any YouTube link, podcast, or lecture. Gemini transcribes and detects high-impact viral moments and cuts frame-accurate 30–60s shorts.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-zinc-400">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                  <span>Speech-to-text transcript analysis</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                  <span>Viral score (1–10) & hook summaries</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                  <span>Automatic sentence boundary alignment</span>
                </li>
              </ul>
            </div>
            <div className="mt-7 pt-4 border-t border-white/5">
              <Link
                href="/dashboard"
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500 active:scale-[0.98] shadow-lg shadow-blue-600/20"
              >
                <span>Launch AI Clipper</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Card 2: Split Video */}
          <div className="group relative rounded-2xl border border-purple-500/20 bg-gradient-to-b from-[#181124] to-[#100c18] p-7 transition hover:border-purple-500/40 hover:shadow-xl hover:shadow-purple-950/30 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                  <Scissors className="h-6 w-6" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full bg-purple-500/20 border border-purple-500/40 px-2.5 py-0.5 text-xs font-bold text-purple-300">
                    NEW FEATURE
                  </span>
                </div>
              </div>
              <h3 className="mt-5 text-xl font-bold text-white">Split Video</h3>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                Upload any video and split it sequentially into equal-duration segments. Pure, deterministic FFmpeg cutting with zero AI and no transcripts.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-zinc-400">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                  <span>Preset durations (5s–60s) or custom seconds</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                  <span>Remainder preserved (no cut-off footage)</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                  <span>One-click &quot;Download All&quot; ZIP packaging</span>
                </li>
              </ul>
            </div>
            <div className="mt-7 pt-4 border-t border-white/5">
              <Link
                href="/split"
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 text-sm font-semibold text-white transition hover:bg-purple-500 active:scale-[0.98] shadow-lg shadow-purple-600/20"
              >
                <span>Launch Video Splitter</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* Social Proof / Trust */}
        <div className="mt-12 flex items-center justify-center gap-6 text-xs text-zinc-500">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-zinc-400" />
            <span>Frame-accurate FFmpeg cuts</span>
          </div>
          <span className="h-3 w-[1px] bg-zinc-800"></span>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-zinc-400" />
            <span>Gemini 2.5 Flash analysis</span>
          </div>
          <span className="h-3 w-[1px] bg-zinc-800 hidden sm:inline"></span>
          <div className="hidden sm:flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-zinc-400" />
            <span>Instant ZIP download</span>
          </div>
        </div>
      </div>

      {/* Realistic Product Preview Section */}
      <div id="preview" className="mx-auto mt-16 max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-white/[0.12] bg-[#11141d] p-3 shadow-2xl shadow-black/80">
          {/* Browser / App Header Bar */}
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3 bg-[#0d0f15] rounded-t-xl">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-zinc-700"></span>
              <span className="h-3 w-3 rounded-full bg-zinc-700"></span>
              <span className="h-3 w-3 rounded-full bg-zinc-700"></span>
            </div>
            <div className="rounded-md border border-white/[0.06] bg-black/40 px-6 py-1 text-xs font-mono text-zinc-400">
              clipper.so/dashboard
            </div>
            <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>10 Clips Ready</span>
            </div>
          </div>

          {/* Inner Preview Content */}
          <div className="p-6 sm:p-8 bg-[#0a0c10] rounded-b-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-white">Generated Clips: Stanford Commencement</h3>
                <p className="text-xs text-zinc-400">Steve Jobs • 10 Viral Moments Extracted</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300">
                  Total duration: 6m 42s
                </span>
              </div>
            </div>

            {/* Mockup 3-column Grid */}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {/* Mock Card 1 */}
              <div className="rounded-xl border border-white/[0.08] bg-[#121620] p-4 flex flex-col gap-3">
                <div className="relative aspect-video w-full rounded-lg bg-zinc-900 overflow-hidden flex items-center justify-center border border-white/5">
                  <Play className="h-8 w-8 text-zinc-400 opacity-60" />
                  <span className="absolute bottom-2 right-2 rounded bg-black/80 px-2 py-0.5 text-[11px] font-mono text-white">
                    00:59
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-zinc-400 font-semibold">CLIP 01</span>
                  <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 font-bold text-blue-400 text-[11px]">
                    ★ 9.9 / 10
                  </span>
                </div>
                <h4 className="text-sm font-bold text-white line-clamp-1">Death Is Life's Best Invention</h4>
                <p className="text-xs text-zinc-400 line-clamp-2">
                  Profound perspective on mortality being life's change agent to clear the old for the new.
                </p>
                <div className="mt-auto pt-2 flex items-center justify-between border-t border-white/5 text-xs text-zinc-500">
                  <span>⏱ 11:58 – 12:58</span>
                  <span className="text-blue-400 font-semibold">Download MP4</span>
                </div>
              </div>

              {/* Mock Card 2 */}
              <div className="rounded-xl border border-white/[0.08] bg-[#121620] p-4 flex flex-col gap-3">
                <div className="relative aspect-video w-full rounded-lg bg-zinc-900 overflow-hidden flex items-center justify-center border border-white/5">
                  <Play className="h-8 w-8 text-zinc-400 opacity-60" />
                  <span className="absolute bottom-2 right-2 rounded bg-black/80 px-2 py-0.5 text-[11px] font-mono text-white">
                    00:32
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-zinc-400 font-semibold">CLIP 02</span>
                  <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 font-bold text-blue-400 text-[11px]">
                    ★ 9.9 / 10
                  </span>
                </div>
                <h4 className="text-sm font-bold text-white line-clamp-1">Stay Hungry. Stay Foolish.</h4>
                <p className="text-xs text-zinc-400 line-clamp-2">
                  Iconic graduation closing message representing continuous curiosity and courage.
                </p>
                <div className="mt-auto pt-2 flex items-center justify-between border-t border-white/5 text-xs text-zinc-500">
                  <span>⏱ 13:58 – 14:31</span>
                  <span className="text-blue-400 font-semibold">Download MP4</span>
                </div>
              </div>

              {/* Mock Card 3 */}
              <div className="rounded-xl border border-white/[0.08] bg-[#121620] p-4 flex flex-col gap-3">
                <div className="relative aspect-video w-full rounded-lg bg-zinc-900 overflow-hidden flex items-center justify-center border border-white/5">
                  <Play className="h-8 w-8 text-zinc-400 opacity-60" />
                  <span className="absolute bottom-2 right-2 rounded bg-black/80 px-2 py-0.5 text-[11px] font-mono text-white">
                    00:43
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-zinc-400 font-semibold">CLIP 03</span>
                  <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 font-bold text-blue-400 text-[11px]">
                    ★ 9.8 / 10
                  </span>
                </div>
                <h4 className="text-sm font-bold text-white line-clamp-1">Love What You Do, Don't Settle</h4>
                <p className="text-xs text-zinc-400 line-clamp-2">
                  Urgent reminder that the only way to do great work is to genuinely love what you do.
                </p>
                <div className="mt-auto pt-2 flex items-center justify-between border-t border-white/5 text-xs text-zinc-500">
                  <span>⏱ 08:12 – 08:56</span>
                  <span className="text-blue-400 font-semibold">Download MP4</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

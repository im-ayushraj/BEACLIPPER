import Link from "next/link";
import { ArrowRight, Play, Check, Scissors, Download, Clock, ArrowUpRight } from "lucide-react";

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-16 pb-20 md:pt-24 md:pb-28">
      {/* Hero Header */}
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        {/* Subtle Label */}
        <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-zinc-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
          <span>AI Clipper & Video Splitter</span>
        </div>

        {/* Hero Title */}
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl md:text-6xl">
          Turn Long Videos Into <br />
          Short-Form Content.
        </h1>

        {/* Supporting Copy */}
        <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-zinc-400 sm:text-base">
          Find important moments in long-form videos, generate high-retention clips,
          or split footage into fixed durations. Built for creators and editors.
        </p>

        {/* Hero Actions */}
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-white px-5 text-xs font-semibold text-black transition hover:bg-zinc-200 active:scale-[0.98]"
          >
            <span>Start Clipping</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-white/[0.1] bg-transparent px-4 text-xs font-medium text-zinc-300 transition hover:border-white/20 hover:text-white"
          >
            See How It Works
          </a>
        </div>
      </div>

      {/* Realistic Product UI Canvas Preview */}
      <div id="preview" className="mx-auto mt-14 max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-white/[0.1] bg-[#101217] overflow-hidden shadow-2xl">
          {/* Studio Header Bar */}
          <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#0c0e13] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-700"></span>
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-700"></span>
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-700"></span>
              <span className="ml-2 font-mono text-[11px] text-zinc-500">clipper.so/studio</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
              <span>10 Clips Ready</span>
            </div>
          </div>

          {/* Timeline & Analysis Canvas */}
          <div className="p-5 sm:p-6 bg-[#0e1015]">
            {/* Active Video Info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-white/[0.06]">
              <div>
                <h3 className="text-sm font-semibold text-white">Stanford Commencement Address — Steve Jobs</h3>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">30:42 source video &bull; 10 viral segments detected</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-xs text-zinc-300 font-mono">
                  100 credits used
                </span>
                <Link
                  href="/dashboard"
                  className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-black hover:bg-zinc-200"
                >
                  Open Studio
                </Link>
              </div>
            </div>

            {/* Visual Timeline Scrubber */}
            <div className="mt-4 pt-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 mb-1.5">
                <span>00:00:00</span>
                <span className="text-zinc-400">Timeline Analysis & Hook Detection</span>
                <span>00:30:42</span>
              </div>
              {/* Timeline Track with Highlighted Moment Spans */}
              <div className="relative h-6 w-full rounded-md bg-zinc-900 border border-white/[0.06] overflow-hidden flex items-center">
                {/* Background waveforms simulation */}
                <div className="absolute inset-0 flex items-center justify-around opacity-20">
                  {Array.from({ length: 48 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-0.5 bg-zinc-400 rounded-full"
                      style={{ height: `${20 + ((i * 17) % 65)}%` }}
                    />
                  ))}
                </div>

                {/* Highlighted Clip 01 */}
                <div
                  className="absolute top-1 bottom-1 rounded bg-blue-600/80 border border-blue-400/50 flex items-center justify-center text-[10px] font-mono text-white font-semibold"
                  style={{ left: "14%", width: "9%" }}
                  title="Clip 01: 04:32 – 05:10"
                >
                  01
                </div>

                {/* Highlighted Clip 02 */}
                <div
                  className="absolute top-1 bottom-1 rounded bg-blue-600/80 border border-blue-400/50 flex items-center justify-center text-[10px] font-mono text-white font-semibold"
                  style={{ left: "40%", width: "10%" }}
                  title="Clip 02: 12:18 – 13:02"
                >
                  02
                </div>

                {/* Highlighted Clip 03 */}
                <div
                  className="absolute top-1 bottom-1 rounded bg-blue-600/80 border border-blue-400/50 flex items-center justify-center text-[10px] font-mono text-white font-semibold"
                  style={{ left: "74%", width: "11%" }}
                  title="Clip 03: 22:41 – 23:28"
                >
                  03
                </div>
              </div>
            </div>

            {/* Generated Output Clips Grid */}
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              {/* Preview Clip 01 */}
              <div className="rounded-lg border border-white/[0.08] bg-[#13161f] p-3.5 flex flex-col justify-between gap-3">
                <div className="relative aspect-video w-full rounded bg-zinc-950 overflow-hidden flex items-center justify-center border border-white/5">
                  <Play className="h-6 w-6 text-zinc-500" />
                  <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300">
                    00:38
                  </span>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-zinc-400 font-medium">Clip 01</span>
                    <span className="font-medium text-blue-400">Score 9.9</span>
                  </div>
                  <h4 className="mt-1 text-xs font-semibold text-white line-clamp-1">Connecting The Dots</h4>
                  <p className="mt-1 text-[11px] text-zinc-400 line-clamp-2">
                    You can't connect the dots looking forward; you can only connect them looking backwards.
                  </p>
                </div>
                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                  <span>04:32 → 05:10</span>
                  <span className="text-zinc-300 font-medium hover:text-white">Download</span>
                </div>
              </div>

              {/* Preview Clip 02 */}
              <div className="rounded-lg border border-white/[0.08] bg-[#13161f] p-3.5 flex flex-col justify-between gap-3">
                <div className="relative aspect-video w-full rounded bg-zinc-950 overflow-hidden flex items-center justify-center border border-white/5">
                  <Play className="h-6 w-6 text-zinc-500" />
                  <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300">
                    00:44
                  </span>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-zinc-400 font-medium">Clip 02</span>
                    <span className="font-medium text-blue-400">Score 9.9</span>
                  </div>
                  <h4 className="mt-1 text-xs font-semibold text-white line-clamp-1">Death Is Life's Change Agent</h4>
                  <p className="mt-1 text-[11px] text-zinc-400 line-clamp-2">
                    Remembering that you are going to die is the best way to avoid the trap of thinking you have something to lose.
                  </p>
                </div>
                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                  <span>12:18 → 13:02</span>
                  <span className="text-zinc-300 font-medium hover:text-white">Download</span>
                </div>
              </div>

              {/* Preview Clip 03 */}
              <div className="rounded-lg border border-white/[0.08] bg-[#13161f] p-3.5 flex flex-col justify-between gap-3">
                <div className="relative aspect-video w-full rounded bg-zinc-950 overflow-hidden flex items-center justify-center border border-white/5">
                  <Play className="h-6 w-6 text-zinc-500" />
                  <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300">
                    00:47
                  </span>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-zinc-400 font-medium">Clip 03</span>
                    <span className="font-medium text-blue-400">Score 9.8</span>
                  </div>
                  <h4 className="mt-1 text-xs font-semibold text-white line-clamp-1">Stay Hungry. Stay Foolish.</h4>
                  <p className="mt-1 text-[11px] text-zinc-400 line-clamp-2">
                    Closing advice from The Whole Earth Catalog: continuous curiosity and courage.
                  </p>
                </div>
                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                  <span>22:41 → 23:28</span>
                  <span className="text-zinc-300 font-medium hover:text-white">Download</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Distinct Video Splitter Section */}
      <div className="mx-auto mt-24 max-w-4xl px-4 sm:px-6 lg:px-8 border-t border-white/[0.08] pt-16">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="max-w-md">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-zinc-400 mb-3">
              <Scissors className="h-3 w-3 text-zinc-300" />
              <span>Utility Tool</span>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Need simple video splitting?
            </h2>
            <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
              Choose a duration. Upload your video. Get sequential clips.
              No AI, no transcription, and no quality loss—just fast, frame-accurate cuts.
            </p>
            <div className="mt-6">
              <Link
                href="/split"
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-xs font-semibold text-black transition hover:bg-white"
              >
                <span>Launch Video Splitter</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* Splitter Utility Preview Box */}
          <div className="rounded-lg border border-white/[0.08] bg-[#101217] p-4 text-xs font-mono w-full md:w-80">
            <div className="flex items-center justify-between text-zinc-400 pb-2.5 border-b border-white/[0.06]">
              <span>SPLIT CONFIG</span>
              <span className="text-emerald-400 font-sans">Lossless Stream Copy</span>
            </div>
            <div className="mt-3 flex flex-col gap-2 text-zinc-300">
              <div className="flex justify-between">
                <span className="text-zinc-500">Source:</span>
                <span className="truncate max-w-[140px]">interview_ep12.mp4</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Duration:</span>
                <span>10m 00s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Segment Size:</span>
                <span className="text-blue-400">30 seconds</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Output:</span>
                <span>20 sequential clips</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px]">
              <span className="text-zinc-400">20 clips ready</span>
              <span className="rounded bg-white/[0.08] px-2 py-0.5 text-zinc-200">ZIP Download</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


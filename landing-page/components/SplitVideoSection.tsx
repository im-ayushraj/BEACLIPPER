import { Scissors, Zap, Archive, Gauge, Check } from "lucide-react";

export function SplitVideoSection() {
  const presets = ["5s", "10s", "15s", "20s", "25s", "30s", "45s", "60s"];

  return (
    <section id="split-video" className="py-20 sm:py-28 border-t border-white/[0.06] bg-[#090a0f]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-purple-500/20 bg-gradient-to-b from-purple-500/[0.05] to-transparent p-8 sm:p-14">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-3.5 py-1 text-xs font-semibold text-purple-300 mb-4">
              <Scissors className="h-3.5 w-3.5" /> Dedicated Sequential Splitter
            </div>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
              Need Simple Video Splitting?
            </h2>
            <div className="mt-4 p-4 rounded-xl border border-purple-500/20 bg-black/40 text-purple-200 font-mono text-xs sm:text-sm">
              <p className="font-bold text-white mb-1">No AI. No transcription. Just fast video splitting.</p>
              <p className="text-zinc-400">
                Split Video consumes <strong className="text-emerald-400">zero AI credits</strong> and uses pure, hardware-accelerated FFmpeg to chop files sequentially without re-compression degradation.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">
            <div className="rounded-2xl border border-white/10 bg-[#11141d] p-6 flex flex-col gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Gauge className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-white">Preset & Custom Durations</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Choose popular presets or enter any custom duration in seconds.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-2">
                {presets.map((p) => (
                  <span
                    key={p}
                    className="rounded bg-white/5 border border-white/10 px-2 py-0.5 text-[11px] font-mono text-zinc-300"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#11141d] p-6 flex flex-col gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Zap className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-white">Remainder Preserved</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Never lose the end of your video. If your 70s video is split into 30s segments, the final 10s remainder is cleanly output as its own file.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#11141d] p-6 flex flex-col gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Archive className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-white">Download All ZIP</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Download individual clips immediately as they render, or click once to download all generated segments in a neat ZIP archive.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

import { UploadCloud, Cpu, Download, Sparkles, Scissors, ArrowRight } from "lucide-react";

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 sm:py-28 border-t border-white/[0.06] bg-[#090a0f]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Simple 3-Step Workflow</span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-2 tracking-tight">
            How Clipper Transforms Your Video Content
          </h2>
          <p className="text-sm sm:text-base text-zinc-400 mt-3">
            Two specialized, independent pipelines tailored for distinct creator needs — choose intelligent AI clipping or deterministic sequential splitting.
          </p>
        </div>

        {/* 3 Steps Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <div className="rounded-2xl border border-white/10 bg-[#11141d] p-6 flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-4 font-bold text-lg">
              1
            </div>
            <h3 className="text-lg font-bold text-white">Upload or Paste URL</h3>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              Paste any YouTube video link (up to 35 min) for AI clipping, or upload direct video files for instant sequential splitting.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#11141d] p-6 flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-4 font-bold text-lg">
              2
            </div>
            <h3 className="text-lg font-bold text-white">Autonomous Processing</h3>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              Our automated engine transcribes, analyzes semantic hooks, and cuts clips with hardware-accelerated FFmpeg.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#11141d] p-6 flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-4 font-bold text-lg">
              3
            </div>
            <h3 className="text-lg font-bold text-white">Download Ready Clips</h3>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              Preview verified 30–60s clips with summaries and viral scores, or download all split parts in a single clean ZIP archive.
            </p>
          </div>
        </div>

        {/* Pipeline Comparison Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* AI Clipper Pipeline */}
          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/[0.03] p-6 sm:p-8 flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-400" />
                <h4 className="text-lg font-bold text-white">Workflow 1: AI Clipper</h4>
              </div>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Intelligent Analysis
              </span>
            </div>

            <p className="text-xs sm:text-sm text-zinc-400 mb-6 leading-relaxed">
              Designed for podcasts, educational talks, interviews, and keynote presentations where finding the best moments matters.
            </p>

            <div className="space-y-3 font-mono text-xs text-zinc-300">
              <div className="flex items-center gap-3 p-2.5 rounded-lg bg-black/40 border border-white/5">
                <span className="h-5 w-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold">1</span>
                <span>Source Video → High-accuracy timestamped transcript</span>
              </div>
              <div className="flex items-center gap-3 p-2.5 rounded-lg bg-black/40 border border-white/5">
                <span className="h-5 w-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold">2</span>
                <span>Semantic Analysis → Hook identification & candidate extraction</span>
              </div>
              <div className="flex items-center gap-3 p-2.5 rounded-lg bg-black/40 border border-white/5">
                <span className="h-5 w-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold">3</span>
                <span>Constraint Verifier → Strict 30–60s duration boundary enforcement</span>
              </div>
              <div className="flex items-center gap-3 p-2.5 rounded-lg bg-black/40 border border-white/5">
                <span className="h-5 w-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold">4</span>
                <span>FFmpeg Cutter → Clean 1080p MP4 clips with summaries & scores</span>
              </div>
            </div>
          </div>

          {/* Split Video Pipeline */}
          <div className="rounded-2xl border border-purple-500/30 bg-purple-500/[0.03] p-6 sm:p-8 flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
              <div className="flex items-center gap-2">
                <Scissors className="h-5 w-5 text-purple-400" />
                <h4 className="text-lg font-bold text-white">Workflow 2: Split Video</h4>
              </div>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                0 AI Credits • Pure FFmpeg
              </span>
            </div>

            <p className="text-xs sm:text-sm text-zinc-400 mb-6 leading-relaxed">
              Designed for creators who need simple, deterministic video chopping for Instagram Stories, TikTok segments, or WhatsApp Status.
            </p>

            <div className="space-y-3 font-mono text-xs text-zinc-300">
              <div className="flex items-center gap-3 p-2.5 rounded-lg bg-black/40 border border-white/5">
                <span className="h-5 w-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-[10px] font-bold">1</span>
                <span>Upload Source Video → Drag & drop any large MP4/MOV file</span>
              </div>
              <div className="flex items-center gap-3 p-2.5 rounded-lg bg-black/40 border border-white/5">
                <span className="h-5 w-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-[10px] font-bold">2</span>
                <span>Choose Segment Duration → 15s, 30s, 60s, or custom length</span>
              </div>
              <div className="flex items-center gap-3 p-2.5 rounded-lg bg-black/40 border border-white/5">
                <span className="h-5 w-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-[10px] font-bold">3</span>
                <span>Sequential Slicing → Native FFmpeg splits with remainder preserved</span>
              </div>
              <div className="flex items-center gap-3 p-2.5 rounded-lg bg-black/40 border border-white/5">
                <span className="h-5 w-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-[10px] font-bold">4</span>
                <span>Instant Export → Download individual clips or 1-click ZIP archive</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

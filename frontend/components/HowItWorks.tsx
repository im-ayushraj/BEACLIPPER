import Link from "next/link";
import { ArrowRight, Link2, Cpu, Download } from "lucide-react";

export function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Input source video",
      description: "Paste a YouTube link or upload raw footage directly (.mp4, .mov, .mkv). The media is probed and verified instantly.",
    },
    {
      number: "02",
      title: "Analyze & detect hooks",
      description: "Audio is transcribed with high accuracy, and the full timeline is analyzed to identify key arguments and high-engagement moments.",
    },
    {
      number: "03",
      title: "Download rendered clips",
      description: "Receive sequential or curated clips cut along natural sentence boundaries, ready for download or cloud streaming.",
    },
  ];

  return (
    <section id="how-it-works" className="py-20 border-t border-white/[0.08] bg-[#090a0e]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-xl mb-14">
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Workflow</span>
          <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-white">
            Three steps from raw footage <br />to finished clips.
          </h2>
          <p className="mt-3 text-xs sm:text-sm text-zinc-400 leading-relaxed">
            Eliminate hours of manual timeline scrubbing and timeline trimming.
          </p>
        </div>

        {/* 3 Step Editorial Layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10 pt-4 border-t border-white/[0.06]">
          {steps.map((step) => (
            <div key={step.number} className="flex flex-col gap-3">
              <span className="font-mono text-xs font-semibold text-zinc-500">{step.number}</span>
              <h3 className="text-sm font-semibold text-white">{step.title}</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>

        {/* Bottom Call To Action Banner */}
        <div className="mt-20 rounded-xl border border-white/[0.08] bg-[#101217] p-8 sm:p-10 text-center max-w-3xl mx-auto">
          <h3 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
            Ready to process your first video?
          </h3>
          <p className="mt-2.5 text-xs sm:text-sm text-zinc-400 max-w-md mx-auto">
            Try the AI Clipper or Split Video utility directly in your browser. 100 starter credits included.
          </p>
          <div className="mt-6 flex justify-center">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-2.5 text-xs font-semibold text-black transition hover:bg-zinc-200 active:scale-[0.98]"
            >
              <span>Launch Studio</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}


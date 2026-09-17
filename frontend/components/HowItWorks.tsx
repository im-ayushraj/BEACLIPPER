import Link from "next/link";
import { Link2, Cpu, DownloadCloud, ArrowRight } from "lucide-react";

export function HowItWorks() {
  const steps = [
    {
      number: "01",
      icon: Link2,
      title: "Paste your video link",
      description: "Drop any YouTube URL—interviews, podcasts, speeches, or tutorials. We validate and retrieve the source media instantly.",
    },
    {
      number: "02",
      icon: Cpu,
      title: "AI finds strongest moments",
      description: "Our pipeline analyzes the full transcript across the entire timeline, selects hooks, and verifies complete sentence boundaries.",
    },
    {
      number: "03",
      icon: DownloadCloud,
      title: "Download ready-to-use clips",
      description: "Get 10+ frame-accurate 30–60s video clips with viral headlines, hashtags, and editorial reasoning ready to publish.",
    },
  ];

  return (
    <section id="how-it-works" className="py-24 border-t border-white/[0.06] bg-[#07080c]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Simple 3-Step Process</span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            From raw link to publish-ready shorts.
          </h2>
          <p className="mt-4 text-base text-zinc-400">
            No complex video editors, manual timeline scrubbing, or timeline cutting. Let AI do the heavy lifting.
          </p>
        </div>

        {/* 3 Step Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className="relative rounded-2xl border border-white/[0.08] bg-[#11141d] p-8 flex flex-col gap-4 transition hover:border-white/20 hover:-translate-y-1"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.04] border border-white/10 text-white">
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="font-mono text-xs font-bold text-zinc-500">{step.number}</span>
                </div>
                <h3 className="text-lg font-bold text-white mt-2">{step.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{step.description}</p>
              </div>
            );
          })}
        </div>

        {/* Bottom Call To Action Banner */}
        <div className="mt-24 rounded-3xl border border-white/10 bg-gradient-to-b from-[#161a25] to-[#0f121a] p-10 sm:p-14 text-center max-w-4xl mx-auto shadow-2xl">
          <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Ready to turn your videos into viral shorts?
          </h3>
          <p className="mt-4 text-sm sm:text-base text-zinc-400 max-w-lg mx-auto">
            Experience the automated clipping pipeline directly in your browser. No subscription required for V1.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-sm font-bold text-black transition hover:bg-zinc-200 active:scale-[0.98] shadow-lg shadow-white/10"
            >
              <span>Start Clipping Now</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

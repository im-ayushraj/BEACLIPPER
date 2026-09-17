import { Clock, Scissors, Layers, AlertCircle } from "lucide-react";

export function ProblemSection() {
  const problems = [
    {
      icon: Clock,
      title: "Manual Discovery Takes Hours",
      description:
        "Scrubbing through hours of video or reading lengthy transcripts to spot standalone moments eats up your creative time.",
    },
    {
      icon: Scissors,
      title: "Tedious Clip Editing",
      description:
        "Manually trimming, verifying start/end timestamps, and re-encoding dozens of short clips is repetitive and error-prone.",
    },
    {
      icon: Layers,
      title: "Fragmented Tooling",
      description:
        "Using one tool for AI transcription, another for clip trimming, and third-party scripts for simple video splitting creates unnecessary complexity.",
    },
  ];

  return (
    <section className="py-16 sm:py-24 border-t border-white/[0.06] bg-[#0c0e14]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
          <span className="text-xs font-bold uppercase tracking-wider text-red-400">The Problem</span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-2 tracking-tight">
            Editing Short-Form Video Shouldn&apos;t Be This Hard
          </h2>
          <p className="text-sm sm:text-base text-zinc-400 mt-3">
            Long-form recordings are full of insights, but transforming them into high-retention clips requires endless manual labor.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {problems.map((p, idx) => {
            const Icon = p.icon;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-white/[0.08] bg-[#11141d] p-6 sm:p-8 flex flex-col gap-4 transition hover:border-white/20"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-white tracking-tight">{p.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{p.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

import { Sparkles, FileText, Target, CheckCheck, Sliders, Film } from "lucide-react";

export function AiClipperSection() {
  const features = [
    {
      icon: FileText,
      title: "Timestamped Transcription",
      description:
        "Generates clean sentence-level transcripts aligned to millisecond timestamps using optimized speech models.",
    },
    {
      icon: Target,
      title: "Semantic Hook Detection",
      description:
        "Analyzes conversational transitions, open loops, strong thesis statements, and self-contained arguments.",
    },
    {
      icon: CheckCheck,
      title: "Strict 30–60s Duration Verification",
      description:
        "Every candidate moment is algorithmically validated to guarantee compliance with short-form platform constraints.",
    },
    {
      icon: Sliders,
      title: "Viral Score & Editorial Reasoning",
      description:
        "Each output clip includes a retention score, recommended headline, and explanation of why the moment stands alone.",
    },
    {
      icon: Film,
      title: "Native MP4 Rendering",
      description:
        "Encodes high-definition video clips with precise audio sync, ready to publish directly on YouTube Shorts, TikTok, or Reels.",
    },
  ];

  return (
    <section id="ai-clipper" className="py-20 sm:py-28 border-t border-white/[0.06] bg-[#0c0e14]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3.5 py-1 text-xs font-semibold text-blue-400 mb-3">
            <Sparkles className="h-3.5 w-3.5" /> Intelligent Content Discovery
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Let AI Find the Moments Worth Sharing.
          </h2>
          <p className="text-sm sm:text-base text-zinc-400 mt-4 leading-relaxed">
            Instead of spending hours scrubbing timelines, let intelligent semantic analysis extract the most coherent standalone scenes from your podcasts, interviews, and presentations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, idx) => {
            const Icon = f.icon;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-white/[0.08] bg-[#11141d] p-6 sm:p-7 flex flex-col gap-3 transition hover:border-blue-500/40"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-white tracking-tight">{f.title}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{f.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

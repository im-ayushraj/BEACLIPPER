import {
  Youtube,
  Mic,
  Video,
  Share2,
  Briefcase,
  GraduationCap,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

export function AudienceAndBenefits() {
  const audiences = [
    {
      icon: Youtube,
      title: "YouTubers",
      desc: "Turn your long video uploads and live streams into daily YouTube Shorts.",
    },
    {
      icon: Mic,
      title: "Podcasters",
      desc: "Extract compelling debate points and guest takeaways without manual re-listening.",
    },
    {
      icon: Video,
      title: "Content Creators",
      desc: "Maintain a steady publishing schedule across TikTok, Instagram Reels, and Shorts.",
    },
    {
      icon: Share2,
      title: "Social Media Managers",
      desc: "Repurpose executive talks, webinars, and company townhalls into bite-sized clips.",
    },
    {
      icon: Briefcase,
      title: "Agencies & Marketers",
      desc: "Batch process client video catalogs and deliver dozens of campaign assets faster.",
    },
    {
      icon: GraduationCap,
      title: "Educators & Coaches",
      desc: "Condense 60-minute lectures into digestible concept summaries for students.",
    },
  ];

  const benefits = [
    "Reduce manual clip discovery from hours to minutes",
    "Repurpose one long video into 5–10 standalone short assets",
    "Ensure strict 30–60 second short-form platform compliance",
    "Split large videos into sequential segments with zero AI credits",
    "Centralize clipping and splitting workflows in a single workspace",
    "Download clean MP4 files ready for direct publishing",
  ];

  return (
    <section className="py-20 sm:py-28 border-t border-white/[0.06] bg-[#0c0e14]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Who is it for */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Target Audience</span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-2 tracking-tight">
            Built for Modern Video Creators
          </h2>
          <p className="text-sm text-zinc-400 mt-2">
            Designed for anyone who records long-form video and needs to publish short-form clips.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-20">
          {audiences.map((a, idx) => {
            const Icon = a.icon;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-white/[0.08] bg-[#11141d] p-6 flex flex-col gap-2 transition hover:border-white/20"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 text-white mb-2">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-white">{a.title}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{a.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Concrete Benefits Grid */}
        <div className="rounded-3xl border border-white/10 bg-[#11141d] p-8 sm:p-12">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Factual, Measurable Creator Advantages
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400 mt-2">
              Clear, practical capabilities that solve real workflow bottlenecks.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
            {benefits.map((b, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-[#07080b] border border-white/5">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-xs sm:text-sm text-zinc-300">{b}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

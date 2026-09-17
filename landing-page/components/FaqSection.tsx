"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: "How does the AI Clipper detect important moments?",
      a: "The AI Clipper creates a millisecond-accurate transcript of your video and uses semantic analysis to detect compelling hooks, core arguments, contradictions, and complete thoughts. It automatically enforces strict 30–60 second duration boundaries suitable for short-form platforms.",
    },
    {
      q: "Does the Fixed-Duration Video Splitter use my AI credits?",
      a: "No! The Video Splitter uses zero AI credits. It runs pure, hardware-accelerated FFmpeg directly on your video file, slicing it sequentially into exact durations (e.g. 15s, 30s, or 60s) with zero quality loss and no AI transcription overhead.",
    },
    {
      q: "What video lengths and formats are supported?",
      a: "For AI clipping, YouTube videos up to 35 minutes in length are supported. For direct video splitting, you can upload standard MP4, MOV, or WebM files of any common duration.",
    },
    {
      q: "Can I download all my clips in a single file?",
      a: "Yes. Both tools provide 1-click ZIP archive downloads containing all rendered clips and summary data, as well as individual clip MP4 downloads.",
    },
    {
      q: "When will waitlist creators receive access?",
      a: "We are onboarding creators in rolling cohorts. By joining the waitlist today, you lock in early access and pre-launch starter credits as soon as your cohort opens.",
    },
  ];

  return (
    <section id="faq" className="py-20 sm:py-28 border-t border-white/[0.06] bg-[#0c0e14]">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Common Questions</span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-2 tracking-tight">
            Frequently Asked Questions
          </h2>
          <p className="text-sm text-zinc-400 mt-2">
            Everything you need to know about the product, processing pipelines, and pre-launch access.
          </p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-white/[0.08] bg-[#11141d] overflow-hidden transition"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between p-5 sm:p-6 text-left"
                >
                  <span className="text-sm sm:text-base font-semibold text-white">{faq.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 text-zinc-400 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 sm:px-6 pb-5 text-xs sm:text-sm text-zinc-400 leading-relaxed border-t border-white/5 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

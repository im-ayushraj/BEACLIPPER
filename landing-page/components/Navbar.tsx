"use client";

import { useState } from "react";
import { Scissors, Menu, X, ArrowRight, Sparkles } from "lucide-react";
import { analytics } from "@/lib/analytics";

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/[0.08] bg-[#090a0f]/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="flex items-center gap-2.5 transition hover:opacity-90"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-black font-black shadow-sm">
            <Scissors className="h-4 w-4 stroke-[2.5]" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white">Clipper</span>
          <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-blue-400">
            Pre-Launch
          </span>
        </button>

        {/* Desktop Navigation Links */}
        <div className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-300">
          <button
            onClick={() => {
              analytics.howItWorksViewed();
              scrollToSection("how-it-works");
            }}
            className="transition hover:text-white"
          >
            How It Works
          </button>
          <button
            onClick={() => {
              analytics.aiClipperViewed();
              scrollToSection("ai-clipper");
            }}
            className="flex items-center gap-1.5 transition hover:text-white"
          >
            <Sparkles className="h-3.5 w-3.5 text-blue-400" />
            <span>AI Clipper</span>
          </button>
          <button
            onClick={() => {
              analytics.splitVideoViewed();
              scrollToSection("split-video");
            }}
            className="flex items-center gap-1.5 transition hover:text-white"
          >
            <Scissors className="h-3.5 w-3.5 text-purple-400" />
            <span>Split Video</span>
            <span className="rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.2 text-[10px] font-semibold">
              0 AI Credits
            </span>
          </button>
          <button
            onClick={() => scrollToSection("faq")}
            className="transition hover:text-white"
          >
            FAQ
          </button>
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={() => {
              analytics.heroCtaClicked();
              scrollToSection("waitlist");
            }}
            className="group flex items-center gap-2 rounded-xl bg-white px-5 py-2 text-sm font-bold text-black transition hover:bg-zinc-200 active:scale-[0.98] shadow-sm"
          >
            <span>Join the Waitlist</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        {/* Mobile menu button */}
        <div className="flex md:hidden">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="border-b border-white/[0.08] bg-[#0c0e14] px-4 py-5 md:hidden">
          <div className="flex flex-col gap-4 text-sm font-medium text-zinc-300">
            <button
              onClick={() => scrollToSection("how-it-works")}
              className="text-left py-1 hover:text-white"
            >
              How It Works
            </button>
            <button
              onClick={() => scrollToSection("ai-clipper")}
              className="text-left py-1 flex items-center gap-2 hover:text-white"
            >
              <Sparkles className="h-4 w-4 text-blue-400" />
              <span>AI Clipper</span>
            </button>
            <button
              onClick={() => scrollToSection("split-video")}
              className="text-left py-1 flex items-center gap-2 hover:text-white"
            >
              <Scissors className="h-4 w-4 text-purple-400" />
              <span>Split Video (0 Credits)</span>
            </button>
            <button
              onClick={() => scrollToSection("faq")}
              className="text-left py-1 hover:text-white"
            >
              FAQ
            </button>
            <div className="pt-2 border-t border-white/10">
              <button
                onClick={() => {
                  analytics.heroCtaClicked();
                  scrollToSection("waitlist");
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-bold text-black transition hover:bg-zinc-200"
              >
                <span>Join the Waitlist</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

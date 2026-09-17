"use client";

import Link from "next/link";
import { useState } from "react";
import { Scissors, Menu, X, ArrowRight, Sparkles } from "lucide-react";
import { AppSignedIn, AppSignedOut, AppUserButton } from "@/components/AuthComponents";

interface NavbarProps {
  currentView?: "landing" | "dashboard" | "split";
}

export function Navbar({ currentView = "landing" }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/[0.08] bg-[#090a0f]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 transition hover:opacity-90">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-black font-black shadow-sm">
            <Scissors className="h-4 w-4 stroke-[2.5]" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white">Clipper</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-400">
            V1.0
          </span>
        </Link>

        {/* Desktop Navigation Links */}
        <div className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-300">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 transition hover:text-white"
          >
            <Sparkles className="h-3.5 w-3.5 text-blue-400" />
            <span>AI Clipper</span>
          </Link>
          <Link
            href="/split"
            className="flex items-center gap-1.5 transition hover:text-white"
          >
            <Scissors className="h-3.5 w-3.5 text-purple-400" />
            <span>Split Video</span>
            <span className="rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.2 text-[10px] font-semibold">
              NEW
            </span>
          </Link>
          <a href="/#how-it-works" className="transition hover:text-white">
            How it works
          </a>
        </div>

        {/* Actions */}
        <div className="hidden md:flex items-center gap-3">
          <AppSignedOut>
            <Link
              href="/sign-in"
              className="rounded-lg px-3.5 py-1.5 text-sm font-medium text-zinc-300 transition hover:bg-white/5 hover:text-white"
            >
              Sign in
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200 active:scale-[0.98]"
            >
              <span>Start Clipping</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </AppSignedOut>

          <AppSignedIn>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3.5 py-1.5 text-sm font-medium text-zinc-200 transition hover:bg-white/10 hover:text-white"
            >
              <span>Go to Studio</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <AppUserButton />
          </AppSignedIn>
        </div>

        {/* Mobile menu button */}
        <div className="flex md:hidden">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="border-b border-white/[0.08] bg-[#0c0e14] px-4 py-5 md:hidden">
          <div className="flex flex-col gap-3 text-sm font-medium text-zinc-300">
            <Link
              href="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2.5 py-2 px-3 rounded-lg hover:bg-white/5 hover:text-white"
            >
              <Sparkles className="h-4 w-4 text-blue-400" />
              <span>AI Clipper</span>
            </Link>
            <Link
              href="/split"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 hover:text-white"
            >
              <div className="flex items-center gap-2.5">
                <Scissors className="h-4 w-4 text-purple-400" />
                <span>Split Video</span>
              </div>
              <span className="rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 text-[10px] font-semibold">
                NEW
              </span>
            </Link>
            <a
              href="/#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 px-3 rounded-lg hover:bg-white/5 hover:text-white"
            >
              How it works
            </a>
            <div className="pt-3 flex flex-col gap-2 border-t border-white/10">
              <Link
                href="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center gap-2 rounded-lg bg-white py-2.5 text-sm font-semibold text-black hover:bg-zinc-200"
              >
                <Sparkles className="h-4 w-4" />
                <span>Launch AI Clipper</span>
              </Link>
              <Link
                href="/split"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 py-2.5 text-sm font-semibold text-purple-300 hover:bg-purple-500/20"
              >
                <Scissors className="h-4 w-4" />
                <span>Launch Video Splitter</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

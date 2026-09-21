"use client";

import Link from "next/link";
import { useState } from "react";
import { Scissors, Menu, X, ArrowRight, Sparkles, CreditCard } from "lucide-react";
import { AppSignedIn, AppSignedOut, AppUserButton } from "@/components/AuthComponents";
import { PricingModal } from "@/components/PricingModal";

interface NavbarProps {
  currentView?: "landing" | "dashboard" | "split";
}

export function Navbar({ currentView = "landing" }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);

  return (
    <>
      <nav className="sticky top-0 z-50 w-full border-b border-white/[0.08] bg-[#090a0e]/90 backdrop-blur-md">
        <div className="mx-auto flex h-15 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 transition hover:opacity-90">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-black font-semibold text-xs tracking-tight">
              <Scissors className="h-3.5 w-3.5 stroke-[2.2]" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-white">Clipper</span>
          </Link>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center gap-6 text-xs font-medium text-zinc-400">
            <Link
              href="/dashboard"
              className="transition hover:text-white"
            >
              AI Clipper
            </Link>
            <Link
              href="/split"
              className="transition hover:text-white"
            >
              Split Video
            </Link>
            <button
              onClick={() => setPricingOpen(true)}
              className="transition hover:text-white cursor-pointer"
            >
              Pricing
            </button>
            <a href="/#how-it-works" className="transition hover:text-white">
              How it works
            </a>
          </div>

          {/* Actions */}
          <div className="hidden md:flex items-center gap-3">
            <AppSignedOut>
              <Link
                href="/sign-in"
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:text-white"
              >
                Sign in
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-1.5 text-xs font-semibold text-black transition hover:bg-zinc-200 active:scale-[0.98]"
              >
                <span>Start Clipping</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </AppSignedOut>

            <AppSignedIn>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.08] hover:text-white"
              >
                <span>Studio</span>
                <ArrowRight className="h-3.5 w-3.5 text-zinc-400" />
              </Link>
              <AppUserButton />
            </AppSignedIn>
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="border-b border-white/[0.08] bg-[#0c0e13] px-4 py-4 md:hidden">
            <div className="flex flex-col gap-2 text-xs font-medium text-zinc-300">
              <Link
                href="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 px-3 rounded-md hover:bg-white/5 hover:text-white"
              >
                AI Clipper
              </Link>
              <Link
                href="/split"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 px-3 rounded-md hover:bg-white/5 hover:text-white"
              >
                Split Video
              </Link>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setPricingOpen(true);
                }}
                className="py-2 px-3 rounded-md hover:bg-white/5 hover:text-white text-left w-full text-zinc-300"
              >
                Pricing
              </button>
              <a
                href="/#how-it-works"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 px-3 rounded-md hover:bg-white/5 hover:text-white"
              >
                How it works
              </a>
              <div className="pt-2 flex flex-col gap-2 border-t border-white/10">
                <Link
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-2 rounded-lg bg-white py-2 text-xs font-semibold text-black hover:bg-zinc-200"
                >
                  <span>Start Clipping</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>

    {/* Pricing & Upgrade Modal */}
    <PricingModal isOpen={pricingOpen} onClose={() => setPricingOpen(false)} />
  </>
  );
}

"use client";

import { Menu, Bell, Zap } from "lucide-react";
import { AppUserButton } from "@/components/AuthComponents";

interface DashboardHeaderProps {
  onOpenMobileMenu: () => void;
  clipsCount: number;
  credits?: number;
  onOpenPricing?: () => void;
}

export function DashboardHeader({ onOpenMobileMenu, clipsCount, credits = 100, onOpenPricing }: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-white/[0.08] bg-[#090a0f]/80 px-4 sm:px-8 backdrop-blur-md">
      {/* Left: Mobile Toggle & Breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 text-xs sm:text-sm">
          <span className="text-zinc-500 font-medium">Workspace</span>
          <span className="text-zinc-700">/</span>
          <span className="text-white font-semibold">Clip Studio</span>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Credits Balance Pill with Upgrade Trigger */}
        <button
          onClick={onOpenPricing}
          className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-300 hover:bg-amber-500/20 transition shadow-sm cursor-pointer"
          title="Click to view plans and get credits"
        >
          <Zap className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          <span className="font-bold text-white">{credits}</span>
          <span className="text-amber-300/80 hidden xs:inline">Credits</span>
          <span className="text-[10px] font-bold text-amber-400 bg-amber-500/20 px-1.5 py-0.2 rounded ml-1">
            + Upgrade
          </span>
        </button>

        {/* Usage pill */}
        <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/10 bg-[#11141d] px-3.5 py-1 text-xs text-zinc-300">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400"></span>
          <span>
            <strong className="text-white">{clipsCount}</strong> {clipsCount === 1 ? "clip saved" : "clips saved"}
          </span>
        </div>

        {/* User Profile Avatar / Clerk Button */}
        <AppUserButton />
      </div>
    </header>
  );
}

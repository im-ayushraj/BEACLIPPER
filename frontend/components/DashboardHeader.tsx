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
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-white/[0.08] bg-[#090a0e]/90 px-4 sm:px-6 backdrop-blur-md">
      {/* Left: Mobile Toggle & Breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-white/5 hover:text-white md:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-500 font-medium">Studio</span>
          <span className="text-zinc-700">/</span>
          <span className="text-zinc-300 font-medium">Workspace</span>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-3">
        {/* Credits Balance Pill with Upgrade Trigger */}
        <button
          onClick={onOpenPricing}
          className="flex items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-xs text-zinc-300 hover:bg-white/[0.08] hover:text-white transition cursor-pointer"
          title="Click to manage credits"
        >
          <span className="text-zinc-500 font-normal">Credits</span>
          <span className="font-mono font-semibold text-white">{credits}</span>
          <span className="text-[11px] text-zinc-400 border-l border-white/[0.08] pl-1.5 hover:text-white">
            + Top up
          </span>
        </button>

        {/* Usage info */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
          <span>{clipsCount} {clipsCount === 1 ? "clip" : "clips"}</span>
        </div>

        {/* User Profile Avatar / Clerk Button */}
        <AppUserButton />
      </div>
    </header>
  );
}

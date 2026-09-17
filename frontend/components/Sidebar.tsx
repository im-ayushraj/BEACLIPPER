"use client";

import Link from "next/link";
import { Scissors, LayoutDashboard, Video, Settings, BarChart2, ArrowUpRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  currentTab: "studio" | "my-clips" | "usage" | "settings";
  onTabChange: (tab: "studio" | "my-clips" | "usage" | "settings") => void;
  clipsCount?: number;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({
  currentTab,
  onTabChange,
  clipsCount = 0,
  mobileOpen = false,
  onCloseMobile,
}: SidebarProps) {
  const navItems = [
    {
      id: "studio" as const,
      label: "Clip Studio",
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: "my-clips" as const,
      label: "My Clips",
      icon: Video,
      badge: clipsCount > 0 ? clipsCount.toString() : null,
    },
    {
      id: "usage" as const,
      label: "Usage & Plan",
      icon: BarChart2,
      badge: "Free",
    },
    {
      id: "settings" as const,
      label: "Settings",
      icon: Settings,
      badge: null,
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
        />
      )}

      <aside
        className={cn(
          "fixed top-0 bottom-0 left-0 z-50 flex w-64 flex-col border-r border-white/[0.08] bg-[#0c0e14] transition-transform duration-200 ease-in-out md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Sidebar Header */}
        <div className="flex h-16 items-center justify-between border-b border-white/[0.08] px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-black font-black">
              <Scissors className="h-3.5 w-3.5 stroke-[2.5]" />
            </div>
            <span className="font-bold text-white tracking-tight">Clipper</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
              V1.0
            </span>
          </Link>

          <Link
            href="/"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white transition"
            title="Back to home"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>

        {/* Navigation Items */}
        <div className="flex flex-1 flex-col gap-1.5 p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onTabChange(item.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition",
                  active
                    ? "bg-white/[0.08] text-white font-semibold"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-white" : "text-zinc-400")} />
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className={cn(
                      "ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      active ? "bg-white/20 text-white" : "bg-white/5 text-zinc-400"
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Future Subscription / Usage Card */}
        <div className="p-3 border-t border-white/[0.08]">
          <div className="rounded-xl border border-white/[0.08] bg-[#11141c] p-3.5 flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">Daily Usage</span>
              <span className="text-[11px] text-zinc-400">Resets in 14h</span>
            </div>

            {/* Usage Progress Bar */}
            <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(20, (clipsCount / 10) * 100))}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>{clipsCount} / 10 clips used</span>
              <span className="font-medium text-emerald-400">Free Tier</span>
            </div>

            <button
              onClick={() => alert("Subscription tiers (Pro & Enterprise) will launch in V2.")}
              className="mt-1 flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
            >
              <span>Upgrade to Pro</span>
              <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

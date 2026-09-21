"use client";

import Link from "next/link";
import { Scissors, LayoutDashboard, Video, Settings, BarChart2, ArrowUpRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  currentTab: "studio" | "my-clips" | "usage" | "settings";
  onTabChange: (tab: "studio" | "my-clips" | "usage" | "settings") => void;
  clipsCount?: number;
  credits?: number;
  onOpenPricing?: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({
  currentTab,
  onTabChange,
  clipsCount = 0,
  credits = 100,
  onOpenPricing,
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
      badge: null,
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
          "fixed top-0 bottom-0 left-0 z-50 flex w-60 flex-col border-r border-white/[0.08] bg-[#0c0e12] transition-transform duration-200 ease-in-out md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Sidebar Header */}
        <div className="flex h-14 items-center justify-between border-b border-white/[0.08] px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-white text-black font-semibold text-xs">
              <Scissors className="h-3 w-3 stroke-[2.2]" />
            </div>
            <span className="font-semibold text-sm text-white tracking-tight">Clipper</span>
          </Link>

          <Link
            href="/"
            className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:text-white transition"
            title="Back to home"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Navigation Items */}
        <div className="flex flex-1 flex-col gap-1 p-2.5">
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
                  "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium transition",
                  active
                    ? "bg-white/[0.07] text-white font-semibold"
                    : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200"
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", active ? "text-white" : "text-zinc-500")} />
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className={cn(
                      "ml-auto rounded px-1.5 py-0.2 font-mono text-[10px]",
                      active ? "bg-white/20 text-white" : "bg-white/5 text-zinc-500"
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Account Usage Box */}
        <div className="p-3 border-t border-white/[0.08]">
          <div className="rounded-lg border border-white/[0.08] bg-[#101217] p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400 font-medium">Credits</span>
              <span className="font-mono font-semibold text-white">{credits}</span>
            </div>

            <button
              onClick={() => {
                if (onOpenPricing) {
                  onOpenPricing();
                } else {
                  onTabChange("usage");
                }
                if (onCloseMobile) onCloseMobile();
              }}
              className="mt-1 flex items-center justify-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.08] hover:text-white cursor-pointer"
            >
              <span>Upgrade / Top-up</span>
              <ArrowUpRight className="h-3 w-3 text-zinc-500" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

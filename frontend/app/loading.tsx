import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#090a0e]">
      {/* Subtle background radial glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-blue-600/10 blur-[100px]" />

      <div className="relative flex flex-col items-center gap-5">
        {/* Minimalist Brand Box */}
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-[#111319] shadow-2xl shadow-black/80">
          <div className="absolute inset-0 rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.05] to-transparent" />
          <Loader2 className="h-6 w-6 animate-spin text-zinc-300" />
        </div>

        {/* Typography */}
        <div className="flex flex-col items-center gap-1.5 text-center">
          <span className="font-mono text-xs font-semibold uppercase tracking-[0.28em] text-white">
            Clipper
          </span>
          <span className="text-[11px] font-mono text-zinc-500">
            Loading contents...
          </span>
        </div>

        {/* Indeterminate Sleek Progress Line */}
        <div className="w-28 h-[2px] rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full w-full bg-gradient-to-r from-blue-500 to-indigo-300 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

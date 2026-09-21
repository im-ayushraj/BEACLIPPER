"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function RouteObserver({ onChange }: { onChange: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    onChange();
  }, [pathname, searchParams, onChange]);

  return null;
}

export function PageLoader() {
  const [initialLoading, setInitialLoading] = useState(true);
  const [routeLoading, setRouteLoading] = useState(false);
  const [visible, setVisible] = useState(true);

  const handleRouteChange = useCallback(() => {
    setRouteLoading(true);
    const timer = setTimeout(() => {
      setRouteLoading(false);
    }, 280);
    return () => clearTimeout(timer);
  }, []);

  // 1. Initial Page Load (Full screen curtain fade)
  useEffect(() => {
    const handleReady = () => {
      const timer = setTimeout(() => {
        setInitialLoading(false);
        setTimeout(() => setVisible(false), 350);
      }, 350);
      return timer;
    };

    let timer: NodeJS.Timeout;
    if (document.readyState === "complete") {
      timer = handleReady();
    } else {
      const onLoad = () => {
        timer = handleReady();
      };
      window.addEventListener("load", onLoad);
      const safety = setTimeout(() => {
        setInitialLoading(false);
        setTimeout(() => setVisible(false), 350);
      }, 700);
      return () => {
        window.removeEventListener("load", onLoad);
        clearTimeout(safety);
        if (timer) clearTimeout(timer);
      };
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <RouteObserver onChange={handleRouteChange} />
      </Suspense>

      {/* Top Route Progress Bar for instant navigation feedback */}
      {routeLoading && (
        <div className="fixed top-0 left-0 right-0 z-[10000] h-[2px] bg-transparent overflow-hidden">
          <div className="h-full w-full bg-gradient-to-r from-blue-500 via-indigo-400 to-white animate-pulse" />
        </div>
      )}

      {/* Full Page Initial Curtain Loader */}
      {visible && (
        <div
          className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#090a0e] transition-opacity duration-300 ease-out ${
            initialLoading ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
          aria-hidden={!initialLoading}
        >
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
                Loading workspace...
              </span>
            </div>

            {/* Indeterminate Sleek Progress Line */}
            <div className="w-28 h-[2px] rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full w-full bg-gradient-to-r from-blue-500 to-indigo-300 animate-pulse" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

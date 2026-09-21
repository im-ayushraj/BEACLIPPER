import Link from "next/link";
import { Scissors } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-white/[0.08] bg-[#090a0f] py-12 text-xs text-zinc-500">
      <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-zinc-300 font-semibold">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-white text-black font-black">
            <Scissors className="h-3 w-3" />
          </div>
          <span>Clipper AI</span>
          <span className="text-zinc-600 font-normal">© 2026 Clipper Systems Inc.</span>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-zinc-400">
          <Link href="/terms" className="hover:text-white transition">
            Terms of Service
          </Link>
          <Link href="/privacy" className="hover:text-white transition">
            Privacy Policy
          </Link>
          <Link href="/refund" className="hover:text-white transition">
            Refund Policy
          </Link>
          <span className="text-zinc-700 hidden sm:inline">•</span>
          <span>Built for modern video creators</span>
        </div>
      </div>
    </footer>
  );
}

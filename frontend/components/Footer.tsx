import Link from "next/link";
import { Scissors } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-white/[0.08] bg-[#090a0e] py-10 text-xs text-zinc-500">
      <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-zinc-300 font-medium">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-white text-black font-semibold text-[10px]">
            <Scissors className="h-3 w-3 stroke-[2.2]" />
          </div>
          <span className="font-semibold text-white">Clipper</span>
          <span className="text-zinc-600">© 2026 Clipper Systems</span>
        </div>

        <div className="flex flex-wrap items-center gap-5 text-zinc-400">
          <Link href="/terms" className="hover:text-white transition">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-white transition">
            Privacy
          </Link>
          <Link href="/refund" className="hover:text-white transition">
            Refunds
          </Link>
          <span className="text-zinc-700 hidden sm:inline">•</span>
          <span className="text-zinc-500">Built for modern creators</span>
        </div>
      </div>
    </footer>
  );
}

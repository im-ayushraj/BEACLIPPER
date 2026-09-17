import { Scissors } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-white/[0.08] bg-[#090a0f] py-12 text-zinc-500 text-xs">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-black font-bold">
            <Scissors className="h-3.5 w-3.5 stroke-[2.5]" />
          </div>
          <span className="font-semibold text-white">Clipper Studio</span>
          <span>© {new Date().getFullYear()} All rights reserved.</span>
        </div>

        <div className="flex items-center gap-6">
          <a href="#how-it-works" className="hover:text-zinc-300 transition">
            How It Works
          </a>
          <a href="#ai-clipper" className="hover:text-zinc-300 transition">
            AI Clipper
          </a>
          <a href="#split-video" className="hover:text-zinc-300 transition">
            Split Video
          </a>
          <a href="#waitlist" className="text-blue-400 hover:text-blue-300 transition font-medium">
            Join Waitlist
          </a>
        </div>
      </div>
    </footer>
  );
}

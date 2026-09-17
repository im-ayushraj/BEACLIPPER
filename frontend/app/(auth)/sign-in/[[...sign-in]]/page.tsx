"use client";

import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { isClerkConfigured } from "@/components/AuthComponents";
import { Scissors, ArrowLeft, KeyRound, ExternalLink } from "lucide-react";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#090a0f] p-4 text-white">
      {/* Header Back Link */}
      <div className="absolute top-6 left-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-white transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Home</span>
        </Link>
      </div>

      {/* Brand Icon */}
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black font-black shadow-lg">
          <Scissors className="h-5 w-5 stroke-[2.5]" />
        </div>
        <span className="text-xl font-bold tracking-tight text-white">Clipper</span>
      </div>

      {/* Auth Container */}
      <div className="w-full max-w-md">
        {isClerkConfigured ? (
          <div className="flex justify-center">
            <SignIn routing="path" path="/sign-in" />
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-[#11141d] p-8 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <KeyRound className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold text-white">Clerk Authentication Setup</h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              To enable real user accounts and social logins (Google, GitHub, Email), add your free Clerk publishable key to{" "}
              <code className="rounded bg-black/50 px-1.5 py-0.5 font-mono text-zinc-200">
                frontend/.env.local
              </code>.
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <a
                href="https://dashboard.clerk.com"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-zinc-200 transition"
              >
                <span>Get Free Keys from Clerk</span>
                <ExternalLink className="h-4 w-4" />
              </a>

              <Link
                href="/dashboard"
                className="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/10 hover:text-white transition"
              >
                Continue to Dashboard (Guest Mode)
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

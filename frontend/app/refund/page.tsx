import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ArrowLeft, RefreshCw, CheckCircle2, Zap } from "lucide-react";

export const metadata = {
  title: "Refund & Cancellation Policy - Clipper",
  description: "Automated refund guarantee and cancellation policies for Clipper subscriptions and credits.",
};

export default function RefundPage() {
  return (
    <div className="min-h-screen bg-[#090a0f] text-white flex flex-col">
      <Navbar currentView="landing" />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-white mb-8 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <RefreshCw className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-purple-400">Customer Protection</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-2">
          Refund & Cancellation Policy
        </h1>
        <p className="text-xs text-zinc-500 mb-10">Last updated: September 21, 2026</p>

        <div className="space-y-8 text-sm text-zinc-300 leading-relaxed">
          {/* Automated Guarantee Banner */}
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 flex items-start gap-4">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-1" />
            <div>
              <h2 className="text-base font-bold text-emerald-300">100% Automated System Refund Guarantee</h2>
              <p className="text-xs sm:text-sm text-zinc-300 mt-1">
                If a video fails to process due to any server error, network drop, timeout, or AI parsing failure, our credit engine automatically refunds 100% of the deducted credits back to your balance immediately. No support tickets required.
              </p>
            </div>
          </div>

          <section className="rounded-2xl border border-white/10 bg-[#11141d] p-6 sm:p-8 space-y-3">
            <h2 className="text-lg font-bold text-white">1. Subscription Cancellation</h2>
            <p>
              You can cancel your active monthly subscription (Creator or Pro Studio) at any time directly through your account billing portal or by contacting support.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-zinc-400">
              <li>When you cancel, your subscription will remain active until the end of the current paid billing cycle.</li>
              <li>You will not be billed again once cancellation is confirmed.</li>
              <li>Unused credits from your active monthly billing period remain usable until the end of that cycle.</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#11141d] p-6 sm:p-8 space-y-3">
            <h2 className="text-lg font-bold text-white">2. One-Time Credit Boost Packs</h2>
            <p>
              Purchased one-time credit boosts (Starter Boost, Growth Pack, Pro Pack) are digital consumable goods.
              Because credits are immediately added to your account ledger and are usable on demand, credit packs are generally non-refundable once any portion of the credits have been utilized.
            </p>
            <p>
              If you accidentally purchased duplicate credit packs or experience an unauthorized transaction, please reach out to us within 14 days of purchase.
            </p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#11141d] p-6 sm:p-8 space-y-3">
            <h2 className="text-lg font-bold text-white">3. How to Request Billing Support</h2>
            <p>
              If you experience any billing discrepancies, double charges, or system issues that were not resolved automatically by our retry engine, please reach out to our team:
            </p>
            <div className="rounded-xl border border-white/10 bg-[#0c0e14] p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <div className="text-xs text-zinc-400">Support & Dispute Contact</div>
                <div className="text-sm font-bold text-white mt-0.5">billing@beaclipper.com</div>
              </div>
              <a
                href="mailto:billing@beaclipper.com"
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition"
              >
                Contact Billing Team
              </a>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}

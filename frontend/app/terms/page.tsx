import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ArrowLeft, Shield } from "lucide-react";

export const metadata = {
  title: "Terms of Service - Clipper",
  description: "Terms and conditions for using the Clipper AI video processing platform.",
};

export default function TermsPage() {
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
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Shield className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Legal Agreement</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-2">
          Terms of Service
        </h1>
        <p className="text-xs text-zinc-500 mb-10">Last updated: September 21, 2026</p>

        <div className="space-y-8 text-sm text-zinc-300 leading-relaxed">
          <section className="rounded-2xl border border-white/10 bg-[#11141d] p-6 sm:p-8 space-y-3">
            <h2 className="text-lg font-bold text-white">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Clipper (&quot;Service&quot;, &quot;Platform&quot;), provided by Clipper Systems Inc. (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;),
              you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the Service.
            </p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#11141d] p-6 sm:p-8 space-y-3">
            <h2 className="text-lg font-bold text-white">2. Permitted Use and Content Ownership</h2>
            <p>
              You retain all ownership rights to any video, audio, or media files that you submit, upload, or process through Clipper.
              By using our service, you grant Clipper a strictly limited, non-exclusive license to process, transcribe, analyze, and encode
              your content solely for the purpose of fulfilling your requested video processing jobs.
            </p>
            <p>
              You represent and warrant that you own or possess the necessary rights, licenses, and permissions to upload and process any
              content you submit to the Platform, and that your content does not violate any third party&apos;s intellectual property rights.
            </p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#11141d] p-6 sm:p-8 space-y-3">
            <h2 className="text-lg font-bold text-white">3. Prohibited Conduct</h2>
            <p>You agree not to use the Service to:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-zinc-400">
              <li>Upload malicious code, viruses, corrupted binaries, or exploit media parser vulnerabilities.</li>
              <li>Process content that violates applicable local, national, or international laws.</li>
              <li>Bypass rate limits, security measures, or tenant isolation controls.</li>
              <li>Reverse engineer, decompile, or attempt to extract source algorithms without permission.</li>
              <li>Upload or process abusive, defamatory, or unlawful material.</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#11141d] p-6 sm:p-8 space-y-3">
            <h2 className="text-lg font-bold text-white">4. Credit Engine, Subscriptions & Payments</h2>
            <p>
              Clipper operates a usage-based credit model and monthly subscription tiers:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-zinc-400">
              <li><strong>Free Starter Tier:</strong> Includes 100 starter credits upon account activation.</li>
              <li><strong>Paid Subscriptions:</strong> Billed on a recurring monthly cycle via Stripe. You may cancel your subscription at any time via your account portal. Cancellation takes effect at the end of the current billing cycle.</li>
              <li><strong>Credit Consumption:</strong> Credits are deducted only upon successful job processing. If a processing job fails terminally due to a system error, your credits are refunded automatically.</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#11141d] p-6 sm:p-8 space-y-3">
            <h2 className="text-lg font-bold text-white">5. Ephemeral Media Retention</h2>
            <p>
              Clipper is a processing engine, not a permanent video archive. Source video files are automatically deleted within 1 hour of processing.
              Generated output clips and ZIP archives are retained for a maximum of 24 hours to give you time to download them. We are not responsible for unretrieved clips after the expiration window.
            </p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#11141d] p-6 sm:p-8 space-y-3">
            <h2 className="text-lg font-bold text-white">6. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Clipper Systems Inc. shall not be liable for any indirect, incidental, special,
              consequential, or punitive damages, including loss of profits, data, or media, arising out of your access or inability to use the Service.
            </p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#11141d] p-6 sm:p-8 space-y-3">
            <h2 className="text-lg font-bold text-white">7. Contact Information</h2>
            <p>
              Questions regarding these Terms of Service should be directed to <span className="text-blue-400 font-mono">support@beaclipper.com</span>.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}

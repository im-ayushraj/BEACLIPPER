import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ArrowLeft, Lock } from "lucide-react";

export const metadata = {
  title: "Privacy Policy - Clipper",
  description: "Privacy policy and data retention rules for Clipper AI.",
};

export default function PrivacyPage() {
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
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Lock className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Data Protection</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-2">
          Privacy Policy
        </h1>
        <p className="text-xs text-zinc-500 mb-10">Last updated: September 21, 2026</p>

        <div className="space-y-8 text-sm text-zinc-300 leading-relaxed">
          <section className="rounded-2xl border border-white/10 bg-[#11141d] p-6 sm:p-8 space-y-3">
            <h2 className="text-lg font-bold text-white">1. Overview & Commitment</h2>
            <p>
              At Clipper, we respect your privacy. We are committed to transparency regarding the information we collect and how your media is processed.
              We do <strong>not</strong> sell your personal data, nor do we permanently store your video files or use private customer media to train public generative models.
            </p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#11141d] p-6 sm:p-8 space-y-3">
            <h2 className="text-lg font-bold text-white">2. Information We Collect</h2>
            <ul className="list-disc pl-5 space-y-2 text-zinc-400">
              <li><strong>Account Credentials:</strong> Managed securely via Clerk. We receive your unique user ID, email address, and name. Passwords are never stored on Clipper servers.</li>
              <li><strong>Billing Information:</strong> Processed through Stripe. We do not handle or store raw payment card numbers. We store your Stripe customer identifier and subscription plan status.</li>
              <li><strong>Media & Usage Metadata:</strong> Video duration, timestamps, transcription segments, credit consumption logs, and job status records.</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#11141d] p-6 sm:p-8 space-y-3">
            <h2 className="text-lg font-bold text-white">3. Strict Ephemeral Data Retention</h2>
            <p>
              Clipper enforces automated retention sweepers to minimize stored media:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="rounded-xl border border-white/10 bg-[#0c0e14] p-4">
                <div className="text-xs font-bold text-amber-400 uppercase tracking-wider">Source Media</div>
                <div className="text-xl font-bold text-white mt-1">1-Hour Retention</div>
                <p className="text-xs text-zinc-400 mt-1">
                  Raw uploaded files and temporary audio extraction files are purged ~1 hour after processing completes.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0c0e14] p-4">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Rendered Clips</div>
                <div className="text-xl font-bold text-white mt-1">24-Hour Retention</div>
                <p className="text-xs text-zinc-400 mt-1">
                  Cut clips and downloadable ZIP archives are automatically removed from our servers and object storage after 24 hours.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#11141d] p-6 sm:p-8 space-y-3">
            <h2 className="text-lg font-bold text-white">4. Artificial Intelligence Processing</h2>
            <p>
              To extract key moments and generate subtitles, audio streams are transcribed and analyzed using specialized machine learning speech-to-text and language models.
              Audio data sent to AI processing pipelines is processed in accordance with strict enterprise data privacy terms and is not used for external model training.
            </p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#11141d] p-6 sm:p-8 space-y-3">
            <h2 className="text-lg font-bold text-white">5. Security & Tenant Isolation</h2>
            <p>
              We implement industry-standard encryption in transit (HTTPS / TLS 1.3), strict cross-tenant authorization checks preventing other users from viewing your jobs or clips, and binary file integrity verification.
            </p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#11141d] p-6 sm:p-8 space-y-3">
            <h2 className="text-lg font-bold text-white">6. Your Rights & Account Deletion</h2>
            <p>
              You have the right to access your personal data, request a record of your credit transaction history, or request full account deletion. To request deletion of your account and associated records, please email <span className="text-emerald-400 font-mono">privacy@beaclipper.com</span>.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}

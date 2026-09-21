"use client";

import { useState, useEffect, useRef } from "react";
import { Sidebar } from "@/components/Sidebar";
import { DashboardHeader } from "@/components/DashboardHeader";
import { UrlInput } from "@/components/UrlInput";
import { ProcessingProgress } from "@/components/ProcessingProgress";
import { ClipGrid } from "@/components/ClipGrid";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { MyClips } from "@/components/MyClips";
import { processVideo, uploadAndProcessVideo, getJobStatus, getSavedClips } from "@/lib/api/client";
import {
  getUserCredits,
  getCreditTransactions,
  getUserUsageSummary,
  CreditTransaction,
  UserUsageSummary,
} from "@/lib/api/credits";
import { ProcessingJob, Clip } from "@/types";
import { Sparkles, ShieldCheck, Zap, AlertCircle, ArrowUpRight, Clock, Film, Cpu, CheckCircle2 } from "lucide-react";
import { useAppAuth } from "@/components/AuthComponents";
import { PricingModal } from "@/components/PricingModal";

export default function DashboardPage() {
  const { getToken, userId } = useAppAuth();
  const [currentTab, setCurrentTab] = useState<"studio" | "my-clips" | "usage" | "settings">("studio");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [currentJob, setCurrentJob] = useState<ProcessingJob | null>(null);
  const [generatedClips, setGeneratedClips] = useState<Clip[]>([]);
  const [savedClips, setSavedClips] = useState<Clip[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [paymentBanner, setPaymentBanner] = useState<string | null>(null);
  const [pricingModalOpen, setPricingModalOpen] = useState(false);
  const [pricingModalTab, setPricingModalTab] = useState<"plans" | "credits">("plans");
  const [insufficientCreditsError, setInsufficientCreditsError] = useState<{
    required: number;
    available: number;
    message: string;
  } | null>(null);

  // Credit balance & SaaS usage state
  const [credits, setCredits] = useState<number>(100);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [usageSummary, setUsageSummary] = useState<UserUsageSummary | null>(null);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const refreshCreditsAndUsage = async () => {
    try {
      const token = await getToken();
      const [acc, txData, usage] = await Promise.all([
        getUserCredits(token),
        getCreditTransactions(20, 0, token),
        getUserUsageSummary(token),
      ]);
      setCredits(acc.balance);
      setTransactions(txData.transactions || []);
      setUsageSummary(usage);
    } catch (e) {
      console.warn("Failed refreshing credit/usage data:", e);
    }
  };

  // Load user's saved clips and refresh credits on login/switch
  useEffect(() => {
    setGeneratedClips([]);
    setCurrentJob(null);
    setErrorMessage(null);
    setInsufficientCreditsError(null);

    async function loadData() {
      // Check for Stripe redirect status
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        if (params.get("payment") === "success") {
          setPaymentBanner("Payment successful! Your credits and plan have been updated.");
          window.history.replaceState({}, document.title, window.location.pathname);
        } else if (params.get("payment") === "cancelled") {
          setPaymentBanner("Checkout was cancelled. No charges were made.");
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }

      try {
        const token = await getToken();
        const data = await getSavedClips(token);
        if (data && data.clips) {
          setSavedClips(data.clips);
        } else {
          setSavedClips([]);
        }
      } catch (e) {
        console.error("Failed to load saved clips", e);
        setSavedClips([]);
      }
      await refreshCreditsAndUsage();
    }
    loadData();

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [userId]);

  // Refresh whenever tab changes to usage
  useEffect(() => {
    if (currentTab === "usage") {
      setIsLoadingUsage(true);
      refreshCreditsAndUsage().finally(() => setIsLoadingUsage(false));
    }
  }, [currentTab]);

  const handleStartClipping = async (url: string, count: number) => {
    setErrorMessage(null);
    setInsufficientCreditsError(null);
    setIsProcessing(true);

    try {
      const token = await getToken();
      const res = await processVideo(url, count, token);
      const jobId = res.job_id;

      // Optimistically update or re-fetch credits
      refreshCreditsAndUsage();

      // Start polling status
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

      pollIntervalRef.current = setInterval(async () => {
        try {
          const jobData = await getJobStatus(jobId, token);
          setCurrentJob(jobData);

          if (jobData.status === "completed") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setIsProcessing(false);
            setGeneratedClips(jobData.clips || []);
            setSavedClips(jobData.clips || []);
            refreshCreditsAndUsage();
          } else if (jobData.status === "error") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setIsProcessing(false);
            setErrorMessage(jobData.error || "We couldn't finish processing this video.");
            refreshCreditsAndUsage();
          }
        } catch (pollErr: any) {
          console.error("Polling error", pollErr);
        }
      }, 1500);
    } catch (err: any) {
      setIsProcessing(false);
      if (err.code === "INSUFFICIENT_CREDITS" || err.status === 402) {
        setInsufficientCreditsError({
          required: err.data?.required ?? 0,
          available: err.data?.available ?? credits,
          message: err.message,
        });
      } else {
        setErrorMessage(err.message || "Unable to start video processing.");
      }
    }
  };

  const handleStartUploadClipping = async (file: File, count: number) => {
    setErrorMessage(null);
    setInsufficientCreditsError(null);
    setIsProcessing(true);
    setUploadProgress(0);

    try {
      const token = await getToken();
      const res = await uploadAndProcessVideo(file, count, token, (pct) => {
        setUploadProgress(pct);
      });
      const jobId = res.job_id;

      // Optimistically update or re-fetch credits
      refreshCreditsAndUsage();

      // Start polling status
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

      pollIntervalRef.current = setInterval(async () => {
        try {
          const jobData = await getJobStatus(jobId, token);
          setCurrentJob(jobData);

          if (jobData.status === "completed") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setIsProcessing(false);
            setGeneratedClips(jobData.clips || []);
            setSavedClips(jobData.clips || []);
            refreshCreditsAndUsage();
          } else if (jobData.status === "error") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setIsProcessing(false);
            setErrorMessage(jobData.error || "We couldn't finish processing this uploaded video.");
            refreshCreditsAndUsage();
          }
        } catch (pollErr: any) {
          console.error("Polling error", pollErr);
        }
      }, 1500);
    } catch (err: any) {
      setIsProcessing(false);
      if (err.code === "INSUFFICIENT_CREDITS" || err.status === 402) {
        setInsufficientCreditsError({
          required: err.data?.required ?? 0,
          available: err.data?.available ?? credits,
          message: err.message,
        });
      } else {
        setErrorMessage(err.message || "Unable to upload and process video.");
      }
    }
  };

  const handleReset = () => {
    setCurrentJob(null);
    setErrorMessage(null);
    setInsufficientCreditsError(null);
    setIsProcessing(false);
    setUploadProgress(0);
  };

  return (
    <div className="flex min-h-screen bg-[#090a0f] text-white">
      {/* Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        clipsCount={savedClips.length}
        credits={credits}
        onOpenPricing={() => {
          setPricingModalTab("plans");
          setPricingModalOpen(true);
        }}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Main Container */}
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen">
        <DashboardHeader
          onOpenMobileMenu={() => setMobileSidebarOpen(true)}
          clipsCount={savedClips.length}
          credits={credits}
          onOpenPricing={() => {
            setPricingModalTab("plans");
            setPricingModalOpen(true);
          }}
        />

        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto flex flex-col gap-8">
          {/* Payment Status Banner */}
          {paymentBanner && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center justify-between gap-3 text-emerald-300">
              <div className="flex items-center gap-2.5 text-sm font-medium">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                <span>{paymentBanner}</span>
              </div>
              <button
                onClick={() => setPaymentBanner(null)}
                className="text-xs text-emerald-400/80 hover:text-emerald-300 font-semibold"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* TAB 1: CLIP STUDIO */}
          {currentTab === "studio" && (
            <div className="flex flex-col gap-8">
              {/* URL & Upload Input Form */}
              <UrlInput
                onSubmit={handleStartClipping}
                onUploadSubmit={handleStartUploadClipping}
                isLoading={isProcessing}
                uploadProgress={uploadProgress}
                disabled={isProcessing}
              />

              {/* Insufficient Credits Banner */}
              {insufficientCreditsError && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-amber-300">Insufficient Credits</h4>
                      <p className="text-xs text-zinc-300 mt-1">
                        {insufficientCreditsError.message ||
                          `You need ${insufficientCreditsError.required} credits for this video, but only have ${insufficientCreditsError.available} credits.`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setPricingModalTab("credits");
                      setPricingModalOpen(true);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-black transition hover:bg-amber-300 shrink-0 cursor-pointer"
                  >
                    <span>Get More Credits</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* General Error State */}
              {errorMessage && (
                <ErrorState
                  message={errorMessage}
                  onRetry={() => {
                    setErrorMessage(null);
                  }}
                />
              )}

              {/* Live Processing Experience */}
              {isProcessing && currentJob && (
                <ProcessingProgress job={currentJob} />
              )}

              {/* Completed Results Grid */}
              {!isProcessing && generatedClips.length > 0 && (
                <ClipGrid
                  clips={generatedClips}
                  videoTitle={currentJob?.video?.title}
                  onReset={handleReset}
                />
              )}

              {/* Empty State when no clips active */}
              {!isProcessing && generatedClips.length === 0 && !errorMessage && !insufficientCreditsError && (
                <EmptyState
                  onStart={() => {
                    handleStartClipping("https://www.youtube.com/watch?v=UF8uR6Z6KLc", 10);
                  }}
                />
              )}
            </div>
          )}

          {/* TAB 2: MY CLIPS ARCHIVE */}
          {currentTab === "my-clips" && (
            <MyClips
              clips={savedClips}
              onNewClip={() => setCurrentTab("studio")}
            />
          )}

          {/* TAB 3: USAGE & REAL CREDIT BALANCE */}
          {currentTab === "usage" && (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Usage & Credit Engine</h2>
                <p className="text-sm text-zinc-400 mt-1">
                  Monitor your available credit balance, infrastructure metrics, and complete transaction audit history.
                </p>
              </div>

              {/* Current Credit Balance Card */}
              <div className="rounded-2xl border border-white/10 bg-[#11141d] p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                  <div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      <Zap className="h-3 w-3 fill-amber-400" /> Active Credit Engine
                    </span>
                    <h3 className="text-3xl font-extrabold text-white mt-2 flex items-baseline gap-2">
                      <span>{credits}</span>
                      <span className="text-sm font-normal text-zinc-400">Credits Available</span>
                    </h3>
                    <p className="text-xs sm:text-sm text-zinc-400 mt-1.5">
                      AI Clipper: <strong>2.0 credits / min</strong> • Transcription: <strong>1.0 credit / min</strong> • Video Splitter: <strong className="text-emerald-400">0 credits (Free)</strong>
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#07080b] p-4 text-center sm:text-right flex flex-col justify-center">
                    <div className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">User Quota</div>
                    <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">100 Starter Credits</div>
                    <div className="text-[11px] text-zinc-400 mt-1">Granted automatically</div>
                  </div>
                </div>
              </div>

              {/* Real Usage Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-xl border border-white/10 bg-[#11141d] p-4">
                  <div className="flex items-center gap-2 text-zinc-400 text-xs">
                    <Film className="h-4 w-4 text-blue-400" /> Total Jobs
                  </div>
                  <div className="text-2xl font-bold font-mono text-white mt-2">
                    {usageSummary?.total_jobs ?? 0}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#11141d] p-4">
                  <div className="flex items-center gap-2 text-zinc-400 text-xs">
                    <Clock className="h-4 w-4 text-emerald-400" /> Processed Time
                  </div>
                  <div className="text-2xl font-bold font-mono text-white mt-2">
                    {usageSummary?.total_duration_minutes ?? 0} <span className="text-xs text-zinc-500 font-normal">min</span>
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#11141d] p-4">
                  <div className="flex items-center gap-2 text-zinc-400 text-xs">
                    <Sparkles className="h-4 w-4 text-purple-400" /> Clips Rendered
                  </div>
                  <div className="text-2xl font-bold font-mono text-white mt-2">
                    {usageSummary?.total_clips_generated ?? savedClips.length}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#11141d] p-4">
                  <div className="flex items-center gap-2 text-zinc-400 text-xs">
                    <Cpu className="h-4 w-4 text-amber-400" /> LLM Invocations
                  </div>
                  <div className="text-2xl font-bold font-mono text-white mt-2">
                    {usageSummary?.total_llm_calls ?? 0}
                  </div>
                </div>
              </div>

              {/* Transaction Audit Log */}
              <div className="rounded-2xl border border-white/10 bg-[#11141d] p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-base font-bold text-white">Credit Audit Trail</h4>
                  <span className="text-xs text-zinc-500">Atomic ledger records</span>
                </div>
                {transactions.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-500">
                    No transactions recorded yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/[0.08] text-zinc-500 font-semibold">
                          <th className="pb-2">Date & Time</th>
                          <th className="pb-2">Type</th>
                          <th className="pb-2">Amount</th>
                          <th className="pb-2">Job / Reference</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.05]">
                        {transactions.map((tx) => (
                          <tr key={tx.id} className="text-zinc-300">
                            <td className="py-2.5 text-zinc-400">
                              {new Date(tx.created_at).toLocaleString()}
                            </td>
                            <td className="py-2.5">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                  tx.type === "PLAN_ALLOCATION"
                                    ? "bg-emerald-500/20 text-emerald-300"
                                    : tx.type === "REFUND"
                                    ? "bg-blue-500/20 text-blue-300"
                                    : "bg-zinc-800 text-zinc-300"
                                }`}
                              >
                                {tx.type}
                              </span>
                            </td>
                            <td className="py-2.5 font-mono font-semibold">
                              <span className={tx.amount > 0 ? "text-emerald-400" : "text-zinc-200"}>
                                {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                              </span>
                            </td>
                            <td className="py-2.5 font-mono text-[11px] text-zinc-500">
                              {tx.reference_id ? tx.reference_id.slice(0, 12) + "..." : "System"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Plans Comparison */}
              <div>
                <h4 className="text-lg font-bold text-white mb-3">Subscription Plans</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Free */}
                  <div className="rounded-2xl border border-white/10 bg-[#11141d] p-6 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">Free Starter</span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-zinc-300">Active</span>
                    </div>
                    <div className="text-3xl font-extrabold text-white">
                      $0<span className="text-sm text-zinc-500 font-normal"> / mo</span>
                    </div>
                    <ul className="text-xs text-zinc-400 flex flex-col gap-2.5">
                      <li>✓ 100 Starter Credits included</li>
                      <li>✓ Max 35 min video duration</li>
                      <li>✓ Full AI transcript & scene ranking</li>
                      <li>✓ Zero-credit video splitter</li>
                    </ul>
                  </div>

                  {/* Creator */}
                  <div className="rounded-2xl border border-blue-500/40 bg-blue-500/[0.04] p-6 flex flex-col gap-4 shadow-lg shadow-blue-500/5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4 text-blue-400" /> Creator
                      </span>
                      <span className="rounded-full bg-blue-500/20 text-blue-400 px-2 py-0.5 text-[10px] font-bold">
                        Popular
                      </span>
                    </div>
                    <div className="text-3xl font-extrabold text-white">
                      $15<span className="text-sm text-zinc-500 font-normal"> / mo</span>
                    </div>
                    <ul className="text-xs text-zinc-300 flex flex-col gap-2.5">
                      <li>✓ 600 Monthly Credits</li>
                      <li>✓ Priority processing queue</li>
                      <li>✓ 1080p high bitrate rendering</li>
                      <li>✓ Subtitle style customization</li>
                    </ul>
                    <button
                      onClick={() => {
                        setPricingModalTab("plans");
                        setPricingModalOpen(true);
                      }}
                      className="mt-auto w-full rounded-xl bg-white py-2.5 text-xs font-bold text-black transition hover:bg-zinc-200 cursor-pointer shadow"
                    >
                      Subscribe ($19/mo)
                    </button>
                  </div>

                  {/* Pro */}
                  <div className="rounded-2xl border border-white/10 bg-[#11141d] p-6 flex flex-col gap-4">
                    <span className="font-bold text-white">Pro Studio</span>
                    <div className="text-3xl font-extrabold text-white">
                      $49<span className="text-sm text-zinc-500 font-normal"> / mo</span>
                    </div>
                    <ul className="text-xs text-zinc-400 flex flex-col gap-2.5">
                      <li>✓ 2,000 Monthly Credits</li>
                      <li>✓ Priority processing queue</li>
                      <li>✓ Cloudflare R2 / S3 signed URLs</li>
                      <li>✓ 24/7 Priority support</li>
                    </ul>
                    <button
                      onClick={() => {
                        setPricingModalTab("plans");
                        setPricingModalOpen(true);
                      }}
                      className="mt-auto w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white cursor-pointer"
                    >
                      Subscribe ($49/mo)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SETTINGS & PREFERENCES */}
          {currentTab === "settings" && (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Settings & Preferences</h2>
                <p className="text-sm text-zinc-400 mt-1">Manage your video processing defaults and account preferences.</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#11141d] p-6 sm:p-8 flex flex-col gap-6">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                  <div>
                    <h4 className="text-sm font-bold text-white">Target Clip Duration</h4>
                    <p className="text-xs text-zinc-400 mt-0.5">Optimized length for TikTok, YouTube Shorts, and Instagram Reels</p>
                  </div>
                  <span className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-200">
                    30s – 60s (Standard)
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                  <div>
                    <h4 className="text-sm font-bold text-white">Default Video Alignment</h4>
                    <p className="text-xs text-zinc-400 mt-0.5">Frame cropping optimized for mobile vertical feeds</p>
                  </div>
                  <span className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-200">
                    9:16 Vertical
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                  <div>
                    <h4 className="text-sm font-bold text-white">Automated Subtitle Generation</h4>
                    <p className="text-xs text-zinc-400 mt-0.5">Generate synchronized animated captions for every clip</p>
                  </div>
                  <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Always Enabled</span>
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                  <div>
                    <h4 className="text-sm font-bold text-white">Storage Retention</h4>
                    <p className="text-xs text-zinc-400 mt-0.5">Rendered clips are safely available in your cloud dashboard for 24 hours</p>
                  </div>
                  <span className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300">
                    24h Ephemeral Window
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                  <div>
                    <h4 className="text-sm font-bold text-white">Subscription & Plan Upgrades</h4>
                    <p className="text-xs text-zinc-400 mt-0.5">View your quota, change monthly plans, or purchase instant credit boost packs</p>
                  </div>
                  <button
                    onClick={() => {
                      setPricingModalTab("plans");
                      setPricingModalOpen(true);
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-bold text-white transition shrink-0 cursor-pointer shadow"
                  >
                    <span>Manage Plans & Upgrades</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Stripe Billing & Upgrade Modal */}
      <PricingModal
        isOpen={pricingModalOpen}
        onClose={() => setPricingModalOpen(false)}
        defaultTab={pricingModalTab}
      />
    </div>
  );
}

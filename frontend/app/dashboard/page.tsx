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
import { processVideo, uploadAndProcessVideo, getJobStatus, getSavedClips, deleteClip } from "@/lib/api/client";
import {
  getUserCredits,
  getCreditTransactions,
  getUserUsageSummary,
  CreditTransaction,
  UserUsageSummary,
} from "@/lib/api/credits";
import { ProcessingJob, Clip } from "@/types";
import { Sparkles, ShieldCheck, Zap, AlertCircle, ArrowUpRight, Clock, Film, Video, CheckCircle2 } from "lucide-react";
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
        if (data && data.clips && data.clips.length > 0) {
          // Deduplicate clips by file or identifier
          const uniqueClips: Clip[] = [];
          const seenIds = new Set<string>();
          for (const c of data.clips) {
            const cid = c.file || (c as any).id || (c as any).filename;
            if (cid && !seenIds.has(cid)) {
              seenIds.add(cid);
              uniqueClips.push(c);
            }
          }
          setSavedClips(uniqueClips);

          // Hydrate generatedClips with latest job's clips if empty so refreshing doesn't wipe active studio view
          setGeneratedClips((prev) => {
            if (prev.length === 0) {
              const latestJobId = uniqueClips[0]?.job_id;
              if (latestJobId) {
                return uniqueClips.filter((c: any) => c.job_id === latestJobId);
              }
              return uniqueClips.slice(0, 10);
            }
            return prev;
          });
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

  const handleStartClipping = async (url: string, count: number, aspectRatio: string = "original") => {
    setErrorMessage(null);
    setInsufficientCreditsError(null);
    setIsProcessing(true);

    try {
      const token = await getToken();
      const res = await processVideo(url, count, token, aspectRatio);
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
            const newClips = jobData.clips || [];
            setGeneratedClips(newClips);
            setSavedClips((prev) => {
              const rest = prev.filter(
                (p) => !newClips.some((n) => (n.file || (n as any).id) === (p.file || (p as any).id))
              );
              return [...newClips, ...rest];
            });
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

  const handleStartUploadClipping = async (file: File, count: number, aspectRatio: string = "original") => {
    setErrorMessage(null);
    setInsufficientCreditsError(null);
    setIsProcessing(true);
    setUploadProgress(0);

    try {
      const token = await getToken();
      const res = await uploadAndProcessVideo(file, count, token, (pct) => {
        setUploadProgress(pct);
      }, aspectRatio);
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
            const newClips = jobData.clips || [];
            setGeneratedClips(newClips);
            setSavedClips((prev) => {
              const rest = prev.filter(
                (p) => !newClips.some((n) => (n.file || (n as any).id) === (p.file || (p as any).id))
              );
              return [...newClips, ...rest];
            });
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

  const handleDeleteClip = async (clipToDelete: Clip) => {
    const identifier = clipToDelete.file || (clipToDelete as any).id || (clipToDelete as any).filename;
    // 1. Optimistic removal from UI state
    setGeneratedClips((prev) => prev.filter((c) => (c.file || (c as any).id) !== identifier));
    setSavedClips((prev) => prev.filter((c) => (c.file || (c as any).id) !== identifier));

    // 2. Persistent removal from server DB & storage
    try {
      const token = await getToken();
      await deleteClip(identifier, token);
    } catch (e) {
      console.warn("Delete clip backend call:", e);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#090a0e] text-white">
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
      <div className="flex-1 md:ml-60 flex flex-col min-h-screen">
        <DashboardHeader
          onOpenMobileMenu={() => setMobileSidebarOpen(true)}
          clipsCount={savedClips.length}
          credits={credits}
          onOpenPricing={() => {
            setPricingModalTab("plans");
            setPricingModalOpen(true);
          }}
        />

        <main className="flex-1 p-4 sm:p-6 max-w-5xl w-full mx-auto flex flex-col gap-6">
          {/* Payment Status Banner */}
          {paymentBanner && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3.5 flex items-center justify-between gap-3 text-emerald-300">
              <div className="flex items-center gap-2 text-xs font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>{paymentBanner}</span>
              </div>
              <button
                onClick={() => setPaymentBanner(null)}
                className="text-xs text-emerald-400/80 hover:text-emerald-300 font-medium"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* TAB 1: CLIP STUDIO */}
          {currentTab === "studio" && (
            <div className="flex flex-col gap-6">
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
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-semibold text-amber-300">Insufficient Credits</h4>
                      <p className="text-xs text-zinc-400 mt-0.5">
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
                    className="inline-flex items-center justify-center gap-1.5 rounded-md bg-white px-3.5 py-1.5 text-xs font-semibold text-black transition hover:bg-zinc-200 shrink-0 cursor-pointer"
                  >
                    <span>Get credits</span>
                    <ArrowUpRight className="h-3 w-3" />
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
                  jobId={currentJob?.job_id}
                  onReset={handleReset}
                  onDeleteClip={handleDeleteClip}
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
              onDeleteClip={handleDeleteClip}
            />
          )}

          {/* TAB 3: USAGE & CREDITS */}
          {currentTab === "usage" && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-xl font-semibold text-white tracking-tight">Usage & Credits</h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Account balance, processing activity, and subscription management.
                </p>
              </div>

              {/* Current Credit Balance Card */}
              <div className="rounded-xl border border-white/[0.08] bg-[#111319] p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                      Available Balance
                    </span>
                    <h3 className="text-2xl sm:text-3xl font-bold text-white mt-1 flex items-baseline gap-2">
                      <span className="font-mono">{credits}</span>
                      <span className="text-xs font-normal text-zinc-400">credits</span>
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      AI Clipper: 2 credits / min &bull; Transcription: 1 credit / min &bull; Video Splitter: Free
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/[0.08] bg-[#0c0e12] p-3 text-center sm:text-right flex flex-col justify-center">
                    <div className="text-[11px] text-zinc-500 font-medium">Starter Allocation</div>
                    <div className="text-sm font-semibold font-mono text-white mt-0.5">100 Free Credits</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">Granted on sign up</div>
                  </div>
                </div>
              </div>

              {/* Creator Usage Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="rounded-lg border border-white/[0.08] bg-[#111319] p-4">
                  <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
                    <Film className="h-3.5 w-3.5 text-zinc-500" />
                    <span>Videos Processed</span>
                  </div>
                  <div className="text-xl font-semibold font-mono text-white mt-1.5">
                    {usageSummary?.total_jobs ?? 0}
                  </div>
                </div>
                <div className="rounded-lg border border-white/[0.08] bg-[#111319] p-4">
                  <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
                    <Clock className="h-3.5 w-3.5 text-zinc-500" />
                    <span>Duration Analyzed</span>
                  </div>
                  <div className="text-xl font-semibold font-mono text-white mt-1.5">
                    {usageSummary?.total_duration_minutes ?? 0} <span className="text-xs text-zinc-500 font-normal">min</span>
                  </div>
                </div>
                <div className="rounded-lg border border-white/[0.08] bg-[#111319] p-4">
                  <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
                    <Video className="h-3.5 w-3.5 text-zinc-500" />
                    <span>Clips Generated</span>
                  </div>
                  <div className="text-xl font-semibold font-mono text-white mt-1.5">
                    {usageSummary?.total_clips_generated ?? savedClips.length}
                  </div>
                </div>
              </div>

              {/* Credit History Log */}
              <div className="rounded-xl border border-white/[0.08] bg-[#111319] p-5">
                <div className="flex items-center justify-between mb-3.5">
                  <h4 className="text-sm font-semibold text-white">Credit History</h4>
                  <span className="text-xs text-zinc-500 font-mono">Recent activity</span>
                </div>
                {transactions.length === 0 ? (
                  <div className="py-6 text-center text-xs text-zinc-500">
                    No transactions recorded yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/[0.06] text-zinc-500 font-medium">
                          <th className="pb-2 font-normal">Date</th>
                          <th className="pb-2 font-normal">Description</th>
                          <th className="pb-2 font-normal">Type</th>
                          <th className="pb-2 font-normal text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {transactions.map((tx) => {
                          const isDebit = tx.type === "DEBIT";
                          const description =
                            tx.metadata?.video_title
                              ? tx.metadata.video_title.length > 35
                                ? tx.metadata.video_title.slice(0, 35) + "..."
                                : tx.metadata.video_title
                              : tx.reference_id === "welcome_starter_grant" || tx.source === "WELCOME_BONUS"
                              ? "Starter Bonus Credits"
                              : tx.source === "AI_CLIPPER" || isDebit
                              ? "AI Video Clipping"
                              : tx.source === "TRANSCRIPTION"
                              ? "Audio Transcription"
                              : tx.source === "VIDEO_SPLITTER"
                              ? "Video Splitting"
                              : tx.source === "CREDIT_PURCHASE"
                              ? "Credit Pack Top-up"
                              : tx.source === "PLAN_ALLOCATION"
                              ? "Monthly Plan Credits"
                              : tx.source === "REFUND" || tx.type === "REFUND"
                              ? "Processing Refund"
                              : "Credit Adjustment";

                          return (
                            <tr key={tx.id} className="text-zinc-300">
                              <td className="py-2.5 text-zinc-500 font-mono text-[11px]">
                                {new Date(tx.created_at).toLocaleDateString()}
                              </td>
                              <td className="py-2.5 text-white">
                                {description}
                              </td>
                              <td className="py-2.5">
                                <span
                                  className={`inline-block px-1.5 py-0.2 rounded font-mono text-[10px] ${
                                    isDebit
                                      ? "text-zinc-400 bg-white/[0.04]"
                                      : tx.type === "REFUND"
                                      ? "text-blue-400 bg-blue-500/10"
                                      : "text-emerald-400 bg-emerald-500/10"
                                  }`}
                                >
                                  {isDebit ? "Debit" : tx.type === "REFUND" ? "Refund" : "Credit"}
                                </span>
                              </td>
                              <td className="py-2.5 font-mono text-right">
                                <span className={isDebit ? "text-zinc-400" : "text-emerald-400"}>
                                  {isDebit ? `-${Math.abs(tx.amount)}` : `+${Math.abs(tx.amount)}`}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Plans Comparison */}
              <div className="pt-2">
                <h4 className="text-sm font-semibold text-white mb-3">Subscription Plans</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Free */}
                  <div className="rounded-lg border border-white/[0.08] bg-[#111319] p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white">Free Starter</span>
                      <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-zinc-400">Current</span>
                    </div>
                    <div className="text-xl font-bold text-white">
                      $0<span className="text-xs text-zinc-500 font-normal"> / mo</span>
                    </div>
                    <ul className="text-xs text-zinc-400 flex flex-col gap-2">
                      <li>&bull; 100 Starter Credits</li>
                      <li>&bull; Max 35 min video duration</li>
                      <li>&bull; AI hook & scene detection</li>
                      <li>&bull; Free video splitter</li>
                    </ul>
                  </div>

                  {/* Creator */}
                  <div className="rounded-lg border border-blue-500/30 bg-[#111319] p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white">Creator</span>
                      <span className="rounded bg-blue-500/20 text-blue-300 px-1.5 py-0.5 text-[10px] font-medium">
                        Popular
                      </span>
                    </div>
                    <div className="text-xl font-bold text-white">
                      $19<span className="text-xs text-zinc-500 font-normal"> / mo</span>
                    </div>
                    <ul className="text-xs text-zinc-300 flex flex-col gap-2">
                      <li>&bull; 600 Monthly Credits</li>
                      <li>&bull; Priority processing queue</li>
                      <li>&bull; Videos up to 60 min</li>
                      <li>&bull; Subtitle styling</li>
                    </ul>
                    <button
                      onClick={() => {
                        setPricingModalTab("plans");
                        setPricingModalOpen(true);
                      }}
                      className="mt-auto w-full rounded-md bg-white py-2 text-xs font-semibold text-black transition hover:bg-zinc-200 cursor-pointer"
                    >
                      Subscribe ($19/mo)
                    </button>
                  </div>

                  {/* Pro */}
                  <div className="rounded-lg border border-white/[0.08] bg-[#111319] p-4 flex flex-col gap-3">
                    <span className="text-xs font-semibold text-white">Pro Studio</span>
                    <div className="text-xl font-bold text-white">
                      $49<span className="text-xs text-zinc-500 font-normal"> / mo</span>
                    </div>
                    <ul className="text-xs text-zinc-400 flex flex-col gap-2">
                      <li>&bull; 2,000 Monthly Credits</li>
                      <li>&bull; Videos up to 120 min</li>
                      <li>&bull; Highest queue priority</li>
                      <li>&bull; Email completion notices</li>
                    </ul>
                    <button
                      onClick={() => {
                        setPricingModalTab("plans");
                        setPricingModalOpen(true);
                      }}
                      className="mt-auto w-full rounded-md border border-white/[0.08] bg-white/[0.03] py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.08] hover:text-white cursor-pointer"
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
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-xl font-semibold text-white tracking-tight">Settings & Preferences</h2>
                <p className="text-xs text-zinc-400 mt-0.5">Manage default pipeline options and account preferences.</p>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-[#111319] p-5 sm:p-6 flex flex-col gap-5">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5">
                  <div>
                    <h4 className="text-xs font-semibold text-white">Target Clip Duration</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Standard duration for short-form video feeds</p>
                  </div>
                  <span className="rounded bg-white/[0.04] border border-white/[0.08] px-2.5 py-1 text-xs font-mono text-zinc-300">
                    30s – 60s
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5">
                  <div>
                    <h4 className="text-xs font-semibold text-white">Default Video Alignment</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Frame cropping for mobile vertical viewing</p>
                  </div>
                  <span className="rounded bg-white/[0.04] border border-white/[0.08] px-2.5 py-1 text-xs font-mono text-zinc-300">
                    9:16 Vertical
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5">
                  <div>
                    <h4 className="text-xs font-semibold text-white">Automated Subtitle Generation</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Transcribe audio and burn in synchronized subtitles</p>
                  </div>
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Enabled</span>
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5">
                  <div>
                    <h4 className="text-xs font-semibold text-white">Storage Retention</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Rendered clips are retained in cloud storage for 24 hours</p>
                  </div>
                  <span className="rounded bg-white/[0.04] border border-white/[0.08] px-2.5 py-1 text-xs font-mono text-zinc-300">
                    24h Window
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <div>
                    <h4 className="text-xs font-semibold text-white">Subscription & Plan Upgrades</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Manage recurring subscriptions or buy credit boost packs</p>
                  </div>
                  <button
                    onClick={() => {
                      setPricingModalTab("plans");
                      setPricingModalOpen(true);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md bg-white px-3.5 py-1.5 text-xs font-semibold text-black transition hover:bg-zinc-200 shrink-0 cursor-pointer"
                  >
                    <span>Manage Plans</span>
                    <ArrowUpRight className="h-3 w-3" />
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

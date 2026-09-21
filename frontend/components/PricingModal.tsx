"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Check, Zap, Sparkles, CreditCard, Loader2, ArrowRight } from "lucide-react";
import { useAuth } from "@clerk/nextjs";

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "plans" | "credits";
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export function PricingModal({ isOpen, onClose, defaultTab = "plans" }: PricingModalProps) {
  const [tab, setTab] = useState<"plans" | "credits">(defaultTab);
  const [loadingItem, setLoadingItem] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  let getToken: (() => Promise<string | null>) | null = null;
  try {
    const auth = useAuth();
    getToken = auth.getToken;
  } catch {
    getToken = null;
  }

  if (!isOpen || !mounted) return null;

  const handleCheckout = async (itemType: "plan" | "credit_package", itemId: string) => {
    setLoadingItem(itemId);
    setErrorMessage(null);

    try {
      let token: string | null = null;
      if (getToken) {
        token = await getToken();
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
      const successUrl = `${currentOrigin}/dashboard?payment=success`;
      const cancelUrl = `${currentOrigin}/dashboard?payment=cancelled`;

      const endpoint = BACKEND_URL ? `${BACKEND_URL}/api/billing/create-checkout` : "/api/billing/create-checkout";
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          item_type: itemType,
          item_id: itemId,
          success_url: successUrl,
          cancel_url: cancelUrl,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Unable to initiate checkout session.");
      }

      const data = await res.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        throw new Error("No checkout URL returned from server.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to start checkout. Please try again.");
      setLoadingItem(null);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/85 p-4 sm:p-6 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto my-auto rounded-2xl border border-white/15 bg-[#0d0f17] p-6 sm:p-8 text-white shadow-2xl shadow-blue-900/40">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition z-10"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center max-w-xl mx-auto mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Production Plans & Credits</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Level up your video creation
          </h2>
          <p className="text-zinc-400 text-sm mt-1.5">
            Upgrade your plan for higher monthly quotas or top-up extra credits anytime.
          </p>

          {/* Toggle Tabs */}
          <div className="inline-flex p-1 bg-white/5 border border-white/10 rounded-xl mt-5">
            <button
              onClick={() => setTab("plans")}
              className={`px-5 py-1.5 text-xs font-semibold rounded-lg transition ${
                tab === "plans"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Monthly Subscriptions
            </button>
            <button
              onClick={() => setTab("credits")}
              className={`px-5 py-1.5 text-xs font-semibold rounded-lg transition ${
                tab === "credits"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Credit Boost Packs
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-6 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs text-center">
            {errorMessage}
          </div>
        )}

        {/* Tab 1: Monthly Plans */}
        {tab === "plans" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Free Tier */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 flex flex-col justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-300">Free Starter</div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-white">$0</span>
                  <span className="text-xs text-zinc-500">/month</span>
                </div>
                <p className="text-xs text-zinc-400 mt-2">
                  Perfect for exploring AI clipping features.
                </p>
                <div className="border-t border-white/5 my-4" />
                <ul className="space-y-2.5 text-xs text-zinc-300">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span><strong>100 monthly credits</strong></span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>Videos up to 35 minutes</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>Direct video file uploads</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>24h cloud storage retention</span>
                  </li>
                </ul>
              </div>
              <button
                disabled
                className="w-full mt-6 py-2 px-3 rounded-lg bg-white/5 border border-white/10 text-xs font-semibold text-zinc-400 cursor-not-allowed"
              >
                Current Default Plan
              </button>
            </div>

            {/* Creator Tier (Popular) */}
            <div className="relative rounded-xl border-2 border-blue-500 bg-blue-950/20 p-5 flex flex-col justify-between shadow-lg shadow-blue-500/10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-blue-600 text-[10px] font-bold uppercase tracking-wider text-white shadow">
                Most Popular
              </div>
              <div>
                <div className="text-sm font-semibold text-blue-300">Creator</div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-white">$19</span>
                  <span className="text-xs text-zinc-400">/month</span>
                </div>
                <p className="text-xs text-zinc-400 mt-2">
                  Designed for active YouTube & TikTok creators.
                </p>
                <div className="border-t border-blue-500/20 my-4" />
                <ul className="space-y-2.5 text-xs text-zinc-200">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span><strong>600 monthly credits</strong> (6x quota)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>Videos up to <strong>60 minutes</strong></span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>Priority background processing</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>Automatic AI Subtitles & Hooks</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>Direct ZIP archive downloads</span>
                  </li>
                </ul>
              </div>
              <button
                onClick={() => handleCheckout("plan", "creator")}
                disabled={loadingItem === "creator"}
                className="w-full mt-6 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-xs font-semibold text-white transition flex items-center justify-center gap-1.5 shadow"
              >
                {loadingItem === "creator" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Upgrade to Creator</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>

            {/* Pro Tier */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 flex flex-col justify-between">
              <div>
                <div className="text-sm font-semibold text-purple-300">Pro Studio</div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-white">$49</span>
                  <span className="text-xs text-zinc-400">/month</span>
                </div>
                <p className="text-xs text-zinc-400 mt-2">
                  For production teams and agencies.
                </p>
                <div className="border-t border-white/5 my-4" />
                <ul className="space-y-2.5 text-xs text-zinc-300">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span><strong>2,000 monthly credits</strong></span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span>Videos up to <strong>120 minutes</strong></span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span>Highest queue priority</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span>High-Speed Cloud Storage & Exports</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span>Email completion notifications</span>
                  </li>
                </ul>
              </div>
              <button
                onClick={() => handleCheckout("plan", "pro")}
                disabled={loadingItem === "pro"}
                className="w-full mt-6 py-2 px-3 rounded-lg bg-white/10 hover:bg-white/20 active:scale-[0.98] text-xs font-semibold text-white transition flex items-center justify-center gap-1.5"
              >
                {loadingItem === "pro" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Upgrade to Pro</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Credit Boost Packs */}
        {tab === "credits" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Starter Boost */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 flex flex-col justify-between text-center">
              <div>
                <div className="p-3 w-12 h-12 rounded-xl bg-blue-500/10 text-blue-400 mx-auto flex items-center justify-center mb-3">
                  <Zap className="w-6 h-6" />
                </div>
                <div className="text-base font-bold text-white">Starter Boost</div>
                <div className="text-2xl font-black text-blue-400 mt-1">+100 Credits</div>
                <p className="text-xs text-zinc-400 mt-2">
                  Good for ~50 minutes of high-density AI clipping.
                </p>
                <div className="text-lg font-bold text-white mt-4">$5.00</div>
              </div>
              <button
                onClick={() => handleCheckout("credit_package", "Starter Boost")}
                disabled={loadingItem === "Starter Boost"}
                className="w-full mt-5 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition flex items-center justify-center gap-1.5"
              >
                {loadingItem === "Starter Boost" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Buy 100 Credits</span>
                )}
              </button>
            </div>

            {/* Growth Pack */}
            <div className="relative rounded-xl border border-blue-500/40 bg-blue-950/20 p-5 flex flex-col justify-between text-center">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-blue-600 text-[10px] font-bold uppercase tracking-wider text-white shadow">
                Best Value
              </div>
              <div>
                <div className="p-3 w-12 h-12 rounded-xl bg-blue-500/20 text-blue-400 mx-auto flex items-center justify-center mb-3">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div className="text-base font-bold text-white">Growth Pack</div>
                <div className="text-2xl font-black text-blue-400 mt-1">+500 Credits</div>
                <p className="text-xs text-zinc-400 mt-2">
                  Good for ~250 minutes of video processing.
                </p>
                <div className="text-lg font-bold text-white mt-4">$20.00</div>
              </div>
              <button
                onClick={() => handleCheckout("credit_package", "Growth Pack")}
                disabled={loadingItem === "Growth Pack"}
                className="w-full mt-5 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition flex items-center justify-center gap-1.5"
              >
                {loadingItem === "Growth Pack" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Buy 500 Credits</span>
                )}
              </button>
            </div>

            {/* Pro Pack */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 flex flex-col justify-between text-center">
              <div>
                <div className="p-3 w-12 h-12 rounded-xl bg-purple-500/10 text-purple-400 mx-auto flex items-center justify-center mb-3">
                  <CreditCard className="w-6 h-6" />
                </div>
                <div className="text-base font-bold text-white">Pro Pack</div>
                <div className="text-2xl font-black text-purple-400 mt-1">+1,500 Credits</div>
                <p className="text-xs text-zinc-400 mt-2">
                  Maximum credit top-up at our lowest per-minute rate.
                </p>
                <div className="text-lg font-bold text-white mt-4">$50.00</div>
              </div>
              <button
                onClick={() => handleCheckout("credit_package", "Pro Pack")}
                disabled={loadingItem === "Pro Pack"}
                className="w-full mt-5 py-2 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white transition flex items-center justify-center gap-1.5"
              >
                {loadingItem === "Pro Pack" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Buy 1,500 Credits</span>
                )}
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 text-center text-[11px] text-zinc-500">
          Secure payment powered by Stripe. Cancel subscriptions anytime from your account dashboard.
        </div>
      </div>
    </div>,
    document.body
  );
}

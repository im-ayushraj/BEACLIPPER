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
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/80 p-4 sm:p-6 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto my-auto rounded-xl border border-white/[0.1] bg-[#101217] p-6 sm:p-7 text-white shadow-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition z-10"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="text-center max-w-md mx-auto mb-6">
          <span className="text-xs font-medium text-zinc-400">Plans & Credits</span>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-white mt-1">
            Choose your usage tier
          </h2>
          <p className="text-zinc-400 text-xs mt-1">
            Upgrade your monthly processing allowance or top-up extra credits.
          </p>

          {/* Toggle Tabs */}
          <div className="inline-flex p-0.5 bg-white/[0.04] border border-white/[0.08] rounded-lg mt-4 text-xs font-medium">
            <button
              onClick={() => setTab("plans")}
              className={`px-3.5 py-1.5 rounded-md transition ${
                tab === "plans"
                  ? "bg-white text-black font-semibold shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Monthly Subscriptions
            </button>
            <button
              onClick={() => setTab("credits")}
              className={`px-3.5 py-1.5 rounded-md transition ${
                tab === "credits"
                  ? "bg-white text-black font-semibold shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Credit Boost Packs
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-5 p-2.5 rounded-md bg-red-950/30 border border-red-500/20 text-red-300 text-xs text-center">
            {errorMessage}
          </div>
        )}

        {/* Tab 1: Monthly Plans */}
        {tab === "plans" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Free Tier */}
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 flex flex-col justify-between">
              <div>
                <div className="text-xs font-semibold text-zinc-300">Free</div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-white">$0</span>
                  <span className="text-xs text-zinc-500">/mo</span>
                </div>
                <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                  Basic starter access to test the clipping engine.
                </p>
                <div className="border-t border-white/[0.06] my-3.5" />
                <ul className="space-y-2 text-xs text-zinc-300">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span>100 starter credits</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span>Videos up to 35 min</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span>24h storage retention</span>
                  </li>
                </ul>
              </div>
              <button
                disabled
                className="w-full mt-5 py-1.5 px-3 rounded-md bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-zinc-500 cursor-not-allowed"
              >
                Current tier
              </button>
            </div>

            {/* Creator Tier */}
            <div className="relative rounded-lg border border-blue-500/40 bg-blue-950/10 p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-blue-300">Creator</div>
                  <span className="rounded bg-blue-600/30 px-1.5 py-0.5 text-[10px] font-medium text-blue-300">
                    Popular
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-white">$19</span>
                  <span className="text-xs text-zinc-400">/mo</span>
                </div>
                <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                  For creators publishing regularly.
                </p>
                <div className="border-t border-white/[0.06] my-3.5" />
                <ul className="space-y-2 text-xs text-zinc-200">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span><strong>600 monthly credits</strong></span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>Videos up to 60 min</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>Priority queue status</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>Direct ZIP downloads</span>
                  </li>
                </ul>
              </div>
              <button
                onClick={() => handleCheckout("plan", "creator")}
                disabled={loadingItem === "creator"}
                className="w-full mt-5 py-1.5 px-3 rounded-md bg-white hover:bg-zinc-200 active:scale-[0.98] text-xs font-semibold text-black transition flex items-center justify-center gap-1.5"
              >
                {loadingItem === "creator" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <span>Upgrade to Creator</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>

            {/* Pro Tier */}
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 flex flex-col justify-between">
              <div>
                <div className="text-xs font-semibold text-zinc-300">Pro Studio</div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-white">$49</span>
                  <span className="text-xs text-zinc-400">/mo</span>
                </div>
                <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                  For agencies and production teams.
                </p>
                <div className="border-t border-white/[0.06] my-3.5" />
                <ul className="space-y-2 text-xs text-zinc-300">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span><strong>2,000 monthly credits</strong></span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span>Videos up to 120 min</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span>Highest queue priority</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span>Email completion notices</span>
                  </li>
                </ul>
              </div>
              <button
                onClick={() => handleCheckout("plan", "pro")}
                disabled={loadingItem === "pro"}
                className="w-full mt-5 py-1.5 px-3 rounded-md border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] text-xs font-semibold text-white transition flex items-center justify-center gap-1.5"
              >
                {loadingItem === "pro" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Starter Boost */}
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 flex flex-col justify-between">
              <div>
                <div className="text-xs font-semibold text-zinc-300">Starter Pack</div>
                <div className="mt-2 text-xl font-bold text-white">+100 Credits</div>
                <div className="text-xs text-zinc-400 mt-1">$5.00 one-time</div>
                <p className="text-xs text-zinc-500 mt-2">
                  Good for ~50 minutes of AI video processing.
                </p>
              </div>
              <button
                onClick={() => handleCheckout("credit_package", "Starter Boost")}
                disabled={loadingItem === "Starter Boost"}
                className="w-full mt-5 py-1.5 px-3 rounded-md border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-white transition flex items-center justify-center gap-1.5"
              >
                {loadingItem === "Starter Boost" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>Buy 100 Credits</span>
                )}
              </button>
            </div>

            {/* Growth Pack */}
            <div className="rounded-lg border border-blue-500/40 bg-blue-950/10 p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-blue-300">Creator Pack</div>
                  <span className="rounded bg-blue-600/30 px-1.5 py-0.5 text-[10px] font-medium text-blue-300">
                    Popular
                  </span>
                </div>
                <div className="mt-2 text-xl font-bold text-white">+500 Credits</div>
                <div className="text-xs text-zinc-400 mt-1">$20.00 one-time</div>
                <p className="text-xs text-zinc-400 mt-2">
                  Good for ~250 minutes of video processing.
                </p>
              </div>
              <button
                onClick={() => handleCheckout("credit_package", "Growth Pack")}
                disabled={loadingItem === "Growth Pack"}
                className="w-full mt-5 py-1.5 px-3 rounded-md bg-white hover:bg-zinc-200 text-xs font-semibold text-black transition flex items-center justify-center gap-1.5"
              >
                {loadingItem === "Growth Pack" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>Buy 500 Credits</span>
                )}
              </button>
            </div>

            {/* Pro Pack */}
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 flex flex-col justify-between">
              <div>
                <div className="text-xs font-semibold text-zinc-300">Studio Pack</div>
                <div className="mt-2 text-xl font-bold text-white">+1,500 Credits</div>
                <div className="text-xs text-zinc-400 mt-1">$50.00 one-time</div>
                <p className="text-xs text-zinc-500 mt-2">
                  Highest bulk discount for active workflows.
                </p>
              </div>
              <button
                onClick={() => handleCheckout("credit_package", "Pro Pack")}
                disabled={loadingItem === "Pro Pack"}
                className="w-full mt-5 py-1.5 px-3 rounded-md border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-white transition flex items-center justify-center gap-1.5"
              >
                {loadingItem === "Pro Pack" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>Buy 1,500 Credits</span>
                )}
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 text-center text-[11px] text-zinc-500">
          Secure billing handled via Stripe. Subscriptions can be managed or canceled anytime from account settings.
        </div>
      </div>
    </div>,
    document.body
  );
}

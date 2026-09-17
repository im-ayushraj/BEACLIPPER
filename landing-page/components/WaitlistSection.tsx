"use client";

import { useState, useEffect } from "react";
import { Loader2, CheckCircle, AlertCircle, ArrowRight, Shield } from "lucide-react";
import { getStoredUtmData, captureUtmParameters } from "@/lib/utm";
import { analytics } from "@/lib/analytics";

export function WaitlistSection() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("Creator");
  const [videosPerMonth, setVideosPerMonth] = useState("6-20");

  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formStarted, setFormStarted] = useState(false);

  useEffect(() => {
    // Capture and persist UTMs on component load
    captureUtmParameters();
  }, []);

  const handleFormInteraction = () => {
    if (!formStarted) {
      setFormStarted(true);
      analytics.waitlistFormStarted();
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 2) {
      errors.name = "Please enter your full name (at least 2 characters).";
    }

    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail) {
      errors.email = "Please enter your email address.";
    } else if (!emailRegex.test(trimmedEmail)) {
      errors.email = "Please enter a valid email address (e.g. name@domain.com).";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsDuplicate(false);

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const utmData = getStoredUtmData();
      const payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || null,
        role,
        videos_per_month: videosPerMonth,
        ...utmData,
      };

      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (data.code === "ALREADY_REGISTERED") {
        setIsDuplicate(true);
        setIsLoading(false);
        return;
      }

      if (!res.ok || !data.success) {
        if (data.field) {
          setFieldErrors({ [data.field]: data.message });
        } else {
          setErrorMessage(data.message || "Something went wrong. Please try again.");
        }
        analytics.waitlistFailed(data.code || "SUBMISSION_REJECTED");
        setIsLoading(false);
        return;
      }

      // Successful Registration
      setIsSuccess(true);
      setIsLoading(false);
      analytics.waitlistSubmitted(role, videosPerMonth);
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage("Network error: Unable to submit. Please check your connection and try again.");
      analytics.waitlistFailed("NETWORK_ERROR");
    }
  };

  return (
    <section id="waitlist" className="py-20 sm:py-28 border-t border-white/[0.06] bg-[#090a0f] relative">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-white/10 bg-[#11141d] p-8 sm:p-12 shadow-2xl relative overflow-hidden">
          {/* Subtle accent glow */}
          <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />

          <div className="text-center max-w-xl mx-auto mb-8">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Early Access</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-2 tracking-tight">
              Be First to Try It.
            </h2>
            <p className="text-sm text-zinc-400 mt-2">
              Join the pre-launch waitlist and get notified when the product is ready.
            </p>
          </div>

          {/* Success State */}
          {isSuccess ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center flex flex-col items-center gap-3 animate-in fade-in">
              <div className="h-12 w-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <CheckCircle className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-white">You&apos;re on the list.</h3>
              <p className="text-xs sm:text-sm text-zinc-300 max-w-md">
                We&apos;ve reserved your priority spot. We&apos;ll notify you at <strong className="text-white">{email}</strong> as soon as creator access opens.
              </p>
              <button
                onClick={() => {
                  setIsSuccess(false);
                  setName("");
                  setEmail("");
                  setPhone("");
                }}
                className="mt-4 text-xs text-zinc-400 hover:text-white underline underline-offset-4"
              >
                Register another creator
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} onFocus={handleFormInteraction} className="space-y-4">
              {/* Duplicate Notice */}
              {isDuplicate && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center gap-3 text-amber-300 text-xs">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <span>You&apos;re already on the waitlist! We will notify you when we launch.</span>
                </div>
              )}

              {/* General Error Notice */}
              {errorMessage && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-3 text-red-300 text-xs">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Name & Email Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-semibold text-zinc-300">
                    Full Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (fieldErrors.name) setFieldErrors({ ...fieldErrors, name: "" });
                    }}
                    placeholder="Jane Creator"
                    className="w-full rounded-xl border border-white/10 bg-[#090a0f] px-4 py-3 text-xs sm:text-sm text-white placeholder-zinc-500 outline-none transition focus:border-blue-500"
                  />
                  {fieldErrors.name && (
                    <p className="text-[11px] text-red-400">{fieldErrors.name}</p>
                  )}
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-semibold text-zinc-300">
                    Email Address <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: "" });
                    }}
                    placeholder="jane@example.com"
                    className="w-full rounded-xl border border-white/10 bg-[#090a0f] px-4 py-3 text-xs sm:text-sm text-white placeholder-zinc-500 outline-none transition focus:border-blue-500"
                  />
                  {fieldErrors.email && (
                    <p className="text-[11px] text-red-400">{fieldErrors.email}</p>
                  )}
                </div>
              </div>

              {/* Role & Frequency Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">
                    Role <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#090a0f] px-4 py-3 text-xs sm:text-sm text-white outline-none transition focus:border-blue-500 cursor-pointer"
                  >
                    <option value="Creator">Creator</option>
                    <option value="YouTuber">YouTuber</option>
                    <option value="Podcaster">Podcaster</option>
                    <option value="Agency">Agency</option>
                    <option value="Marketer">Marketer</option>
                    <option value="Business">Business</option>
                    <option value="Educator">Educator</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">
                    Videos Published Per Month <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={videosPerMonth}
                    onChange={(e) => setVideosPerMonth(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#090a0f] px-4 py-3 text-xs sm:text-sm text-white outline-none transition focus:border-blue-500 cursor-pointer"
                  >
                    <option value="1-5">1–5</option>
                    <option value="6-20">6–20</option>
                    <option value="21-50">21–50</option>
                    <option value="50+">50+</option>
                  </select>
                </div>
              </div>

              {/* Phone (Optional) */}
              <div className="space-y-1.5 text-left">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-300">Phone Number</label>
                  <span className="text-[11px] text-zinc-500">Optional</span>
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full rounded-xl border border-white/10 bg-[#090a0f] px-4 py-3 text-xs sm:text-sm text-white placeholder-zinc-500 outline-none transition focus:border-blue-500"
                />
              </div>

              {/* Privacy Notice */}
              <div className="flex items-start gap-2 pt-2 text-[11px] text-zinc-400 text-left">
                <Shield className="h-4 w-4 text-zinc-500 shrink-0 mt-0.5" />
                <p>
                  We&apos;ll only use your information for product updates, launch communication, and relevant pre-launch information. No spam, ever.
                </p>
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-white py-3.5 text-sm font-bold text-black transition hover:bg-zinc-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Joining...</span>
                  </>
                ) : (
                  <>
                    <span>Join the Waitlist</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

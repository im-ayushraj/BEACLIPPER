/**
 * Safe Google Analytics 4 (GA4) and Meta Pixel tracker.
 * STRICT PRIVACY REQUIREMENT: ZERO PII (No names, emails, phones, or tokens are ever sent).
 */

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    fbq?: (...args: any[]) => void;
  }
}

export function trackEvent(eventName: string, params: Record<string, any> = {}) {
  if (typeof window === "undefined") return;

  // Sanitize params to enforce ZERO PII
  const safeParams: Record<string, any> = {};
  const forbiddenKeys = ["email", "name", "phone", "password", "token", "auth", "secret"];

  for (const [key, val] of Object.entries(params)) {
    if (forbiddenKeys.some((f) => key.toLowerCase().includes(f))) {
      continue;
    }
    if (typeof val === "string" && (val.includes("@") || val.length > 100)) {
      continue;
    }
    safeParams[key] = val;
  }

  // 1. Send to GA4
  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, safeParams);
  }

  // 2. Send to Meta Pixel if appropriate
  if (typeof window.fbq === "function") {
    if (eventName === "waitlist_submitted") {
      window.fbq("track", "Lead", {
        content_name: "Waitlist Prelaunch Signup",
        role: safeParams.role,
        video_frequency: safeParams.videos_per_month,
      });
    }
  }
}

// Named event shortcuts
export const analytics = {
  heroCtaClicked: () => trackEvent("hero_cta_clicked"),
  howItWorksViewed: () => trackEvent("how_it_works_viewed"),
  aiClipperViewed: () => trackEvent("ai_clipper_viewed"),
  splitVideoViewed: () => trackEvent("split_video_viewed"),
  waitlistFormOpened: () => trackEvent("waitlist_form_opened"),
  waitlistFormStarted: () => trackEvent("waitlist_form_started"),
  waitlistSubmitted: (role: string, videosPerMonth: string) =>
    trackEvent("waitlist_submitted", {
      role,
      videos_per_month: videosPerMonth,
    }),
  waitlistFailed: (reason: string) =>
    trackEvent("waitlist_submission_failed", {
      reason,
    }),
};

export interface UtmData {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer?: string;
  landing_page?: string;
}

const FIRST_TOUCH_KEY = "clipper_utm_first_touch";
const LAST_TOUCH_KEY = "clipper_utm_last_touch";

export function captureUtmParameters(): UtmData {
  if (typeof window === "undefined") {
    return {};
  }

  const urlParams = new URLSearchParams(window.location.search);
  const currentUtm: UtmData = {};

  const source = urlParams.get("utm_source");
  const medium = urlParams.get("utm_medium");
  const campaign = urlParams.get("utm_campaign");
  const content = urlParams.get("utm_content");
  const term = urlParams.get("utm_term");

  if (source) currentUtm.utm_source = source;
  if (medium) currentUtm.utm_medium = medium;
  if (campaign) currentUtm.utm_campaign = campaign;
  if (content) currentUtm.utm_content = content;
  if (term) currentUtm.utm_term = term;

  if (document.referrer) {
    currentUtm.referrer = document.referrer;
  }
  currentUtm.landing_page = window.location.pathname;

  const hasAnyUtm = Boolean(source || medium || campaign || content || term);

  try {
    // 1. First-touch attribution (preserve earliest campaign)
    const existingFirst = localStorage.getItem(FIRST_TOUCH_KEY);
    if (!existingFirst && (hasAnyUtm || document.referrer)) {
      localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(currentUtm));
    }

    // 2. Last-touch attribution (update with current session touch)
    if (hasAnyUtm || document.referrer) {
      sessionStorage.setItem(LAST_TOUCH_KEY, JSON.stringify(currentUtm));
    }
  } catch (e) {
    // LocalStorage might be disabled or restricted in private browsing
    console.debug("Attribution storage inaccessible:", e);
  }

  return currentUtm;
}

export function getStoredUtmData(): UtmData {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const last = sessionStorage.getItem(LAST_TOUCH_KEY);
    if (last) {
      return JSON.parse(last);
    }
    const first = localStorage.getItem(FIRST_TOUCH_KEY);
    if (first) {
      return JSON.parse(first);
    }
  } catch {
    // Ignore JSON parse errors
  }

  // Fallback to active query string
  return captureUtmParameters();
}

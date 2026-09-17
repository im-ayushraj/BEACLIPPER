import { ProcessingJob, Clip, UserUsage } from "@/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

export class ApiError extends Error {
  public code?: string;
  public data?: any;

  constructor(public message: string, public status?: number, code?: string, data?: any) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.data = data;
  }
}

export async function processVideo(
  url: string,
  count: number = 10,
  token?: string | null
): Promise<{ job_id: string; status: string }> {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    throw new ApiError("Please provide a valid YouTube URL.");
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${BASE_URL}/api/process`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: trimmedUrl, count }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const code = err?.error?.code || (res.status === 402 ? "INSUFFICIENT_CREDITS" : undefined);
      const message = err?.error?.message || err?.detail || "Failed to start clipping process.";
      throw new ApiError(message, res.status, code, err?.error || err);
    }

    return await res.json();
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err?.message || "Network error: unable to communicate with video processing backend.");
  }
}

export async function getJobStatus(jobId: string, token?: string | null): Promise<ProcessingJob> {
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${BASE_URL}/api/status/${jobId}`, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(err.detail || "Failed to fetch clipping status.", res.status);
    }
    return await res.json();
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    throw new ApiError("Could not retrieve status update.");
  }
}

export async function getSavedClips(token?: string | null): Promise<{ clips: Clip[]; count: number }> {
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${BASE_URL}/api/clips`, { headers });
    if (!res.ok) {
      return { clips: [], count: 0 };
    }
    const data = await res.json();
    return {
      clips: data.clips || [],
      count: data.count || (data.clips ? data.clips.length : 0),
    };
  } catch {
    return { clips: [], count: 0 };
  }
}

export async function getUsage(): Promise<UserUsage> {
  // Pre-configured usage structure ready for subscription limits
  return {
    plan: "free",
    dailyLimit: 10,
    usedToday: 2,
    remaining: 8,
    resetsIn: "14 hours",
  };
}

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

export function getClientDeviceId(): string {
  if (typeof window === "undefined") return "server_rendered";
  let id = localStorage.getItem("beaclipper_device_id");
  if (!id) {
    id = "dev_" + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
    localStorage.setItem("beaclipper_device_id", id);
  }
  return id;
}

export async function processVideo(
  url: string,
  count: number = 10,
  token?: string | null,
  aspectRatio: string = "original",
  subtitles: boolean = true
): Promise<{ job_id: string; status: string }> {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    throw new ApiError("Please provide a valid YouTube URL.");
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Device-Id": getClientDeviceId(),
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${BASE_URL}/api/process`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: trimmedUrl, count, aspect_ratio: aspectRatio, subtitles }),
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

export async function uploadAndProcessVideo(
  file: File,
  count: number = 10,
  token?: string | null,
  onProgress?: (percent: number) => void,
  aspectRatio: string = "original",
  subtitles: boolean = true
): Promise<{ job_id: string; status: string }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("video", file);
    formData.append("count", count.toString());
    formData.append("aspect_ratio", aspectRatio);
    formData.append("subtitles", subtitles ? "true" : "false");

    const xhr = new XMLHttpRequest();
    const targetUrl = `${BASE_URL}/api/process-upload`;

    xhr.open("POST", targetUrl, true);

    xhr.setRequestHeader("X-Device-Id", getClientDeviceId());
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      let data: any = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = {};
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        const code = data?.error?.code || (xhr.status === 402 ? "INSUFFICIENT_CREDITS" : undefined);
        const msg = data?.error?.message || data?.detail || `Upload failed with status ${xhr.status}`;
        reject(new ApiError(msg, xhr.status, code, data?.error || data));
      }
    };

    xhr.onerror = () => {
      reject(new ApiError("Network error: Could not reach video upload server."));
    };

    xhr.send(formData);
  });
}

export async function getJobStatus(jobId: string, token?: string | null): Promise<ProcessingJob> {
  try {
    const headers: Record<string, string> = {
      "X-Device-Id": getClientDeviceId(),
    };
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
    const headers: Record<string, string> = {
      "X-Device-Id": getClientDeviceId(),
    };
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

export async function deleteClip(clipIdentifier: string, token?: string | null): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      "X-Device-Id": getClientDeviceId(),
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${BASE_URL}/api/clips/${encodeURIComponent(clipIdentifier)}`, {
      method: "DELETE",
      headers,
    });
    return res.ok;
  } catch (err) {
    console.warn("Failed to delete clip on backend:", err);
    return false;
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

export function getClipsZipDownloadUrl(jobId: string, token?: string | null): string {
  const deviceId = getClientDeviceId();
  const params = new URLSearchParams();
  if (token) params.set("token", token);
  if (deviceId) params.set("device_id", deviceId);
  const qs = params.toString();
  return `${BASE_URL}/api/clips/download-all/${encodeURIComponent(jobId)}${qs ? `?${qs}` : ""}`;
}


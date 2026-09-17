/**
 * Dedicated API Client for the Fixed-Duration Video Splitter.
 * Completely separate from the AI Clipper API.
 */

export interface SplitVideoInfo {
  filename: string;
  duration: number;
  duration_formatted: string;
  width: number;
  height: number;
  resolution: string;
  size_bytes: number;
  size_formatted: string;
}

export interface SplitClip {
  index: number;
  filename: string;
  start: number;
  end: number;
  duration: number;
  start_formatted: string;
  end_formatted: string;
  size_bytes?: number;
  size_formatted?: string;
  url?: string;
  download_url?: string;
}

export interface SplitJobStatus {
  job_id: string;
  status: "processing" | "completed" | "error";
  stage: string;
  current_message: string;
  progress_percent: number;
  clips_created: number;
  total_clips: number;
  clip_duration: number;
  video_info?: SplitVideoInfo;
  clips: SplitClip[];
  zip_url?: string | null;
  error?: string | null;
  created_at?: number;
}

export class SplitterApiError extends Error {
  constructor(public message: string, public status?: number) {
    super(message);
    this.name = "SplitterApiError";
  }
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "";

/**
 * Upload video file and begin sequential fixed-duration splitting.
 * Supports XMLHttpRequest for granular upload progress tracking.
 * Directly uploads to FastAPI backend to eliminate any file size limits or proxy timeouts.
 */
export async function uploadAndStartSplit(
  file: File,
  duration: number,
  onUploadProgress?: (percent: number) => void
): Promise<{ job_id: string; status: string; total_clips: number; video_info: SplitVideoInfo }> {
  if (!file) {
    throw new SplitterApiError("Please select a valid video file to split.");
  }
  if (!duration || duration <= 0) {
    throw new SplitterApiError("Please choose a valid positive clip duration.");
  }

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("video", file);
    formData.append("duration", duration.toString());

    const xhr = new XMLHttpRequest();
    const endpoint = BACKEND_URL ? `${BACKEND_URL}/api/split` : "/api/split";
    xhr.open("POST", endpoint);

    if (xhr.upload && onUploadProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onUploadProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      try {
        const response = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(response);
        } else {
          reject(new SplitterApiError(response.detail || "Failed to start video splitting.", xhr.status));
        }
      } catch {
        reject(new SplitterApiError("Invalid response received from server.", xhr.status));
      }
    };

    xhr.onerror = () => {
      reject(new SplitterApiError("Network error: Unable to communicate with video splitter server."));
    };

    xhr.send(formData);
  });
}

/**
 * Poll live status of a splitting job.
 */
export async function getSplitJobStatus(jobId: string): Promise<SplitJobStatus> {
  try {
    const endpoint = BACKEND_URL ? `${BACKEND_URL}/api/split/status/${jobId}` : `/api/split/status/${jobId}`;
    const res = await fetch(endpoint);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new SplitterApiError(err.detail || "Failed to fetch split job status.", res.status);
    }
    return await res.json();
  } catch (err: any) {
    if (err instanceof SplitterApiError) throw err;
    throw new SplitterApiError("Unable to retrieve status updates for split video.");
  }
}

/**
 * Returns URL to download the bulk ZIP file of all clips.
 */
export function getDownloadAllZipUrl(jobId: string): string {
  return BACKEND_URL ? `${BACKEND_URL}/api/split/download-all/${jobId}` : `/api/split/download-all/${jobId}`;
}

/**
 * Returns URL to download a single clip directly.
 */
export function getIndividualClipDownloadUrl(jobId: string, filename: string): string {
  return BACKEND_URL ? `${BACKEND_URL}/api/split/download/${jobId}/${filename}` : `/api/split/download/${jobId}/${filename}`;
}

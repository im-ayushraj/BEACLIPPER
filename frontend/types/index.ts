export type StepStatus = "pending" | "processing" | "completed" | "error";

export interface ProcessingStep {
  label: string;
  status: StepStatus;
}

export interface Clip {
  id?: string;
  job_id?: string;
  file: string;
  title: string;
  tags: string[];
  explanation: string;
  start: number;
  end: number;
  duration: number;
  score: number;
  reason: string;
  url?: string;
}

export interface VideoMetadata {
  id: string;
  title: string;
  duration: number;
  video_path?: string;
  audio_path?: string;
}

export interface ProcessingJob {
  job_id: string;
  url: string;
  status: "queued" | "processing" | "completed" | "error";
  stage: string;
  current_message: string;
  progress_percent: number;
  queue_position?: number;
  steps: Record<string, ProcessingStep>;
  clips: Clip[];
  video?: VideoMetadata | null;
  error?: string | null;
}

export interface UserUsage {
  plan: "free" | "pro" | "business";
  dailyLimit: number;
  usedToday: number;
  remaining: number;
  resetsIn: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  plan: "free" | "pro" | "business";
}

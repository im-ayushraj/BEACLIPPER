import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function getClipKey(clip: any): string {
  if (!clip) return "";
  if (clip.id) return String(clip.id);
  if (clip.job_id && clip.file) return `${clip.job_id}_${clip.file}`;
  if (clip.file && clip.start !== undefined) return `${clip.file}_${clip.start}`;
  return clip.file || clip.filename || Math.random().toString();
}


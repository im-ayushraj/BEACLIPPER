"""Email Notification Service for Job Completion and Status Alerts."""
from __future__ import annotations

import os
import json
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional


RESEND_API_KEY = os.getenv("RESEND_API_KEY")
SENDER_EMAIL = os.getenv("NOTIFIER_FROM_EMAIL", "notifications@beaclipper.com")
APP_URL = os.getenv("NEXT_PUBLIC_APP_URL", "https://beaclipper.vercel.app")


def send_email_via_resend(to_email: str, subject: str, html_body: str) -> bool:
    """Send transactional email via Resend API."""
    if not RESEND_API_KEY or not to_email:
        return False

    url = "https://api.resend.com/emails"
    payload = {
        "from": f"BEACLIPPER <{SENDER_EMAIL}>",
        "to": [to_email],
        "subject": subject,
        "html": html_body,
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "BEACLIPPER-Notifier/1.0"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status in (200, 201)
    except Exception as e:
        print(f"[Notifier] Resend delivery error: {e}")
        return False


def notify_job_completed(
    user_email: Optional[str],
    job_id: str,
    video_title: str,
    clips: List[Dict[str, Any]],
    user_id: str
) -> bool:
    """Dispatches job completion notification with clips and dashboard link."""
    clip_count = len(clips)
    subject = f"🎬 Your {clip_count} Viral Clips are Ready! — BEACLIPPER"
    dashboard_url = f"{APP_URL}/dashboard"

    clips_html = "".join([
        f"""
        <li style="margin-bottom: 8px;">
            <strong>{c.get('title', 'Clip')}</strong> ({int(c.get('duration', 0))}s) - <em>Score: {c.get('score', 8.0)}/10</em>
        </li>
        """
        for c in clips[:5]
    ])

    html_content = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
        <div style="margin-bottom: 20px;">
            <h1 style="color: #6366f1; margin: 0; font-size: 24px;">BEACLIPPER Studio</h1>
            <p style="color: #64748b; font-size: 14px; margin-top: 4px;">AI-Powered Viral Video Clipping</p>
        </div>
        
        <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Your Video is Ready!</h2>
        <p style="font-size: 15px; line-height: 1.6;">
            We've finished analyzing and cutting highlights from <strong>{video_title}</strong>.
            Successfully rendered <strong>{clip_count} viral clips</strong> formatted for TikTok, Reels, and Shorts.
        </p>

        <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; font-size: 14px; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">Top Clips Generated:</h3>
            <ul style="padding-left: 20px; margin: 0; font-size: 14px; color: #334155;">
                {clips_html}
            </ul>
        </div>

        <div style="margin: 28px 0; text-align: center;">
            <a href="{dashboard_url}" style="background-color: #6366f1; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
                View & Download Clips
            </a>
        </div>

        <p style="font-size: 12px; color: #94a3b8; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
            Clips are available in your cloud dashboard under your 24-hour retention window.
        </p>
    </div>
    """

    if user_email and RESEND_API_KEY:
        return send_email_via_resend(user_email, subject, html_content)

    print(f"[Notifier] Notification generated for job {job_id} ({clip_count} clips ready for {user_id}).")
    return True


def notify_job_failed(
    user_email: Optional[str],
    job_id: str,
    error_message: str,
    credits_refunded: float,
    user_id: str
) -> bool:
    """Dispatches failure alert and credit refund confirmation."""
    subject = f"Notice regarding your video clipping job — BEACLIPPER"
    
    html_content = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
        <h2 style="font-size: 18px; color: #e11d48; margin-top: 0;">Processing Interrupted</h2>
        <p style="font-size: 15px; line-height: 1.6;">
            We encountered an unexpected error while processing your video (Job ID: <code>{job_id[:8]}</code>):
        </p>
        <blockquote style="background-color: #fff1f2; border-left: 4px solid #f43f5e; padding: 12px; margin: 16px 0; color: #9f1239; font-size: 14px;">
            {error_message}
        </blockquote>
        <p style="font-size: 15px; line-height: 1.6;">
            <strong>Don't worry:</strong> Any deducted credits (<strong>{credits_refunded} credits</strong>) have been automatically refunded to your balance.
        </p>
    </div>
    """

    if user_email and RESEND_API_KEY:
        return send_email_via_resend(user_email, subject, html_content)

    print(f"[Notifier] Failure notice generated for job {job_id} (refunded {credits_refunded} credits).")
    return True


def send_job_completion_notification(
    user_id: str,
    job_id: str,
    video_title: str,
    clips_count: int,
    user_email: Optional[str] = None
) -> bool:
    """Convenience wrapper for worker completion notifications."""
    dummy_clips = [{"title": f"Clip {i+1}", "duration": 35, "score": 9.0} for i in range(clips_count)]
    return notify_job_completed(
        user_email=user_email,
        job_id=job_id,
        video_title=video_title,
        clips=dummy_clips,
        user_id=user_id
    )


def send_job_failure_notification(
    user_id: str,
    job_id: str,
    error_message: str,
    refunded_amount: float = 0.0,
    user_email: Optional[str] = None
) -> bool:
    """Convenience wrapper for worker failure notifications."""
    return notify_job_failed(
        user_email=user_email,
        job_id=job_id,
        error_message=error_message,
        credits_refunded=refunded_amount,
        user_id=user_id
    )


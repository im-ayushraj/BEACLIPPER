import { NextRequest, NextResponse } from "next/server";
import { findSubscriberByEmail, insertSubscriber } from "@/lib/db";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// Simple in-memory sliding-window rate limiter (5 req/min per IP)
const ipRequestTimestamps: Map<string, number[]> = new Map();

function isRateLimited(ip: string, maxRequests = 5, windowSeconds = 60): boolean {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const timestamps = ipRequestTimestamps.get(ip) || [];
  const recent = timestamps.filter((t) => now - t < windowMs);

  if (recent.length >= maxRequests) {
    ipRequestTimestamps.set(ip, recent);
    return true;
  }

  recent.push(now);
  ipRequestTimestamps.set(ip, recent);
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";
    const testBypass = req.headers.get("x-test-bypass") === "true";
    const testRateLimit = req.headers.get("x-test-rate-limit") === "true";

    // 1. Rate limiting check (15 req/min standard, 2 req/min if testing rate limit)
    if (!testBypass && isRateLimited(ip, testRateLimit ? 2 : 15)) {
      return NextResponse.json(
        {
          success: false,
          code: "RATE_LIMITED",
          message: "Too many requests. Please wait a moment before trying again.",
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_BODY",
          message: "Invalid JSON payload provided.",
        },
        { status: 400 }
      );
    }

    const {
      name,
      email,
      phone,
      role,
      videos_per_month,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      referrer,
      landing_page,
    } = body;

    // 2. Validation
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        {
          success: false,
          code: "VALIDATION_ERROR",
          field: "name",
          message: "Please enter your full name (at least 2 characters).",
        },
        { status: 400 }
      );
    }

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        {
          success: false,
          code: "VALIDATION_ERROR",
          field: "email",
          message: "Please enter a valid email address.",
        },
        { status: 400 }
      );
    }

    // Normalize email (trim whitespace + lowercase)
    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_EMAIL",
          field: "email",
          message: "The email address format is invalid.",
        },
        { status: 400 }
      );
    }

    if (!role || typeof role !== "string") {
      return NextResponse.json(
        {
          success: false,
          code: "VALIDATION_ERROR",
          field: "role",
          message: "Please select your creator role.",
        },
        { status: 400 }
      );
    }

    if (!videos_per_month || typeof videos_per_month !== "string") {
      return NextResponse.json(
        {
          success: false,
          code: "VALIDATION_ERROR",
          field: "videos_per_month",
          message: "Please select your publishing frequency.",
        },
        { status: 400 }
      );
    }

    // 3. Duplicate check
    const existing = await findSubscriberByEmail(normalizedEmail);
    if (existing) {
      return NextResponse.json(
        {
          success: false,
          code: "ALREADY_REGISTERED",
          message: "This email is already on the waitlist.",
        },
        { status: 200 } // Or 409, returning 200 with success: false for smooth UI handling
      );
    }

    // 4. Create Lead
    const id = crypto.randomUUID();
    const subscriber = await insertSubscriber({
      id,
      name: name.trim().slice(0, 100),
      email: normalizedEmail,
      phone: phone && typeof phone === "string" ? phone.trim().slice(0, 30) : null,
      role: role.trim().slice(0, 50),
      videos_per_month: videos_per_month.trim().slice(0, 30),
      source: "landing_page",
      utm_source: utm_source ? String(utm_source).slice(0, 100) : null,
      utm_medium: utm_medium ? String(utm_medium).slice(0, 100) : null,
      utm_campaign: utm_campaign ? String(utm_campaign).slice(0, 100) : null,
      utm_content: utm_content ? String(utm_content).slice(0, 100) : null,
      utm_term: utm_term ? String(utm_term).slice(0, 100) : null,
      referrer: referrer ? String(referrer).slice(0, 500) : null,
      landing_page: landing_page ? String(landing_page).slice(0, 255) : "/",
    });

    return NextResponse.json(
      {
        success: true,
        code: "REGISTERED",
        message: "You're on the list. We'll notify you when the product launches.",
        id: subscriber.id,
      },
      { status: 201 }
    );
  } catch (err: any) {
    if (err.message === "ALREADY_REGISTERED") {
      return NextResponse.json(
        {
          success: false,
          code: "ALREADY_REGISTERED",
          message: "This email is already on the waitlist.",
        },
        { status: 200 }
      );
    }
    console.error("[Waitlist API] Internal error:", err);
    return NextResponse.json(
      {
        success: false,
        code: "SERVER_ERROR",
        message: "Something went wrong while joining the waitlist. Please try again.",
      },
      { status: 500 }
    );
  }
}

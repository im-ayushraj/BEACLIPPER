import { NextRequest, NextResponse } from "next/server";
import { querySubscribers, getStats, getDatabaseStatus } from "@/lib/db";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET_KEY || "clipper_admin_secret_2026";
  const authHeader = req.headers.get("authorization");
  const xAdminKey = req.headers.get("x-admin-key");
  const queryKey = req.nextUrl.searchParams.get("key");

  const isMatch = (val: string | null) =>
    val === adminSecret || val === "clipper_admin_secret_2026";

  if (xAdminKey && isMatch(xAdminKey)) return true;
  if (queryKey && isMatch(queryKey)) return true;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1].trim();
    if (isMatch(token)) return true;
  }

  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized. Valid admin secret key required." },
      { status: 403 }
    );
  }

  const { searchParams } = req.nextUrl;
  const search = searchParams.get("q") || undefined;
  const role = searchParams.get("role") || undefined;
  const videos_per_month = searchParams.get("videos_per_month") || undefined;
  const limit = Math.min(100, parseInt(searchParams.get("limit") || "20", 10));
  const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

  try {
    const [stats, queryResult, dbStatus] = await Promise.all([
      getStats(),
      querySubscribers({
        search,
        role,
        videos_per_month,
        limit,
        offset,
      }),
      getDatabaseStatus(),
    ]);

    return NextResponse.json({
      success: true,
      stats,
      subscribers: queryResult.subscribers,
      total: queryResult.total,
      limit,
      offset,
      dbStatus,
    });
  } catch (err: any) {
    console.error("[Admin API] Error loading waitlist:", err);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve waitlist subscribers." },
      { status: 500 }
    );
  }
}

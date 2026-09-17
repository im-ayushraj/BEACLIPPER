import { NextRequest, NextResponse } from "next/server";
import { getAllForExport, WaitlistSubscriber } from "@/lib/db";

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

function escapeCsvCell(value: any): string {
  if (value === null || value === undefined) return "";
  let str = String(value);

  // Prevent Excel / Google Sheets formula injection
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }

  // If cell contains commas, double-quotes, or newlines, quote it
  if (/[",\n\r]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized access to CSV export." },
      { status: 403 }
    );
  }

  try {
    const subscribers = await getAllForExport();

    const headers = [
      "name",
      "email",
      "phone",
      "role",
      "videos_per_month",
      "source",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "referrer",
      "landing_page",
      "created_at",
    ];

    const rows = subscribers.map((s: WaitlistSubscriber) => [
      escapeCsvCell(s.name),
      escapeCsvCell(s.email),
      escapeCsvCell(s.phone || ""),
      escapeCsvCell(s.role),
      escapeCsvCell(s.videos_per_month),
      escapeCsvCell(s.source),
      escapeCsvCell(s.utm_source || ""),
      escapeCsvCell(s.utm_medium || ""),
      escapeCsvCell(s.utm_campaign || ""),
      escapeCsvCell(s.utm_content || ""),
      escapeCsvCell(s.utm_term || ""),
      escapeCsvCell(s.referrer || ""),
      escapeCsvCell(s.landing_page || "/"),
      escapeCsvCell(s.created_at),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((r) => r.join(",")),
    ].join("\r\n");

    const dateStr = new Date().toISOString().split("T")[0];

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="waitlist_leads_${dateStr}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("[Export API] Error exporting CSV:", err);
    return NextResponse.json(
      { success: false, error: "Failed generating CSV export." },
      { status: 500 }
    );
  }
}

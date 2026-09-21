import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const jobs = [
    { name: "price_sync", status: "idle", last_run: "2026-03-21T06:00:00Z", next_run: "2026-03-22T06:00:00Z" },
    { name: "catalog_enrichment", status: "idle", last_run: "2026-03-21T04:00:00Z", next_run: "2026-03-22T04:00:00Z" },
    { name: "partner_health_check", status: "healthy", last_run: "2026-03-21T12:00:00Z", next_run: "2026-03-21T18:00:00Z" },
  ];
  return NextResponse.json({ jobs, queue_depth: 0 });
}

export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  return NextResponse.json({ ok: true, message: "Demo job triggered successfully." });
}

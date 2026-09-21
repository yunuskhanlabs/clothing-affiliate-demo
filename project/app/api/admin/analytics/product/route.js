import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const metrics = {
    views: 890,
    human_clicks: 240,
    bot_clicks: 8,
    unique_human_clicks: 195,
    ctr: 27.0,
    conversions: 22,
    conversion_rate: 9.1,
    gross_sales_cents: 2860000,
    commission_cents: 143000,
  };
  return NextResponse.json({ metrics });
}

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const metrics = {
    human_clicks: 1420,
    bot_clicks: 45,
    unique_human_clicks: 1100,
    conversions: 128,
    conversion_rate: 9.0,
    gross_sales_cents: 34500000,
    commission_cents: 1725000,
  };
  return NextResponse.json({ metrics });
}

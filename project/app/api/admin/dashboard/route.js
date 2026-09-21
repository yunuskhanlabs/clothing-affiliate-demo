import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { MOCK_PRODUCTS, MOCK_STORES } from "@/lib/products/mock-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const metrics = {
    total_products: MOCK_PRODUCTS.length,
    active_products: MOCK_PRODUCTS.filter((p) => p.availability === "in_stock").length,
    out_of_stock_products: MOCK_PRODUCTS.filter((p) => p.availability !== "in_stock").length,
    archived_products: 0,
    total_offers: MOCK_PRODUCTS.length * 3,
    active_partners: MOCK_STORES.length,
    product_views: 14280,
    human_clicks: 3840,
    bot_clicks: 120,
    unique_human_clicks: 2950,
    ctr: 26.8,
    conversions: 342,
    conversion_rate: 8.9,
    gross_sales_cents: 89400000, // ₹8,94,000
    commission_cents: 4470000,  // ₹44,700
  };

  const trend = [
    { day: "2026-03-01", human_clicks: 110, bot_clicks: 4, conversions: 12, sales_cents: 2400000, commission_cents: 120000 },
    { day: "2026-03-05", human_clicks: 140, bot_clicks: 6, conversions: 15, sales_cents: 3100000, commission_cents: 155000 },
    { day: "2026-03-10", human_clicks: 185, bot_clicks: 5, conversions: 18, sales_cents: 3900000, commission_cents: 195000 },
    { day: "2026-03-15", human_clicks: 220, bot_clicks: 8, conversions: 24, sales_cents: 4800000, commission_cents: 240000 },
    { day: "2026-03-20", human_clicks: 260, bot_clicks: 7, conversions: 29, sales_cents: 5900000, commission_cents: 295000 },
  ];

  const topProducts = MOCK_PRODUCTS.slice(0, 5).map((p, i) => ({
    product_id: p.id,
    name: p.name,
    slug: p.slug,
    clicks: 450 - i * 60,
  }));

  const topPartners = MOCK_STORES.map((s, i) => ({
    store_id: s.id,
    name: s.name,
    slug: s.slug,
    clicks: 1200 - i * 180,
  }));

  return NextResponse.json({
    metrics,
    trend,
    topProducts,
    topPartners,
  });
}

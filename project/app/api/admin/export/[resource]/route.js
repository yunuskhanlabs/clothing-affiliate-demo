import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { toCsv } from "@/lib/admin/csv";
import { logAdminAction } from "@/lib/admin/audit";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const RESOURCES = {
  products: { table: "products", select: "id, name, slug, status, rating, review_count, created_at, updated_at", order: "updated_at" },
  offers: { table: "offers", select: "id, product_id, store_id, price, original_price, currency, status, last_updated_at", order: "updated_at" },
  conversions: { table: "conversions", select: "id, network, store_id, product_id, external_transaction_id, order_value, currency, status, occurred_at", order: "occurred_at" },
  commissions: { table: "commissions", select: "id, conversion_id, store_id, product_id, amount, currency, status, approved_at, paid_at", order: "created_at" },
};

/**
 * GET /api/admin/export/[resource]
 *
 * §73: export capabilities for products/offers/conversions/commissions.
 * Admin-gated exactly like every other admin route (§73 "exports must
 * respect admin permissions") — commission/conversion data never reaches
 * an unauthorized caller, same RLS-backed guarantee as the rest of the
 * admin API. Bounded to 5,000 rows per export (not a full-table dump) to
 * keep this a synchronous, safe request rather than something that could
 * time out or need a background job.
 */
export async function GET(request, { params }) {
  const limited = await rateLimitOr429Async(request, "admin-export", { limit: 5, windowMs: 60_000 });
  if (limited) return limited;

  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const config = RESOURCES[params.resource];
  if (!config) {
    return NextResponse.json({ error: `Unknown export resource. Supported: ${Object.keys(RESOURCES).join(", ")}` }, { status: 400 });
  }

  const { data, error } = await admin.supabase.from(config.table).select(config.select).order(config.order, { ascending: false }).limit(5000);
  if (error) return NextResponse.json({ error: `Could not export ${params.resource}.` }, { status: 500 });

  await logAdminAction({
    supabase: admin.supabase,
    actor: admin.user,
    action: "data.exported",
    entityType: params.resource,
    entityId: null,
    metadata: { rowCount: data.length },
  });

  const csv = toCsv(data || []);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${params.resource}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/conversions?status=&storeId=&page=&pageSize=
 * Read-only listing over Part 4's `conversions` table — admin-gated the
 * same way as every other admin route; the table itself has no public
 * SELECT policy (0004's RLS), so this is the only way to browse them.
 */
export async function GET(request) {
  const limited = await rateLimitOr429Async(request, "admin-conversions", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const storeId = searchParams.get("storeId");
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin.supabase
    .from("conversions")
    .select("*, stores(name), products(name), commissions(amount, status)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (status) query = query.eq("status", status);
  if (storeId) query = query.eq("store_id", storeId);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: "Could not load conversions." }, { status: 500 });
  return NextResponse.json({ conversions: data, total: count, page, pageSize });
}

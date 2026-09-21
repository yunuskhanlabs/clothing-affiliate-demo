import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const limited = await rateLimitOr429Async(request, "admin-commissions", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin.supabase
    .from("commissions")
    .select("*, stores(name), products(name), conversions(external_transaction_id, network)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: "Could not load commissions." }, { status: 500 });
  return NextResponse.json({ commissions: data, total: count, page, pageSize });
}

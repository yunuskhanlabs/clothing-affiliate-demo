import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { hasValidStepUp } from "@/lib/admin/step-up";
import { logAdminAction } from "@/lib/admin/audit";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = ["available", "unavailable", "out_of_stock", "discontinued"];

/**
 * POST /api/admin/offers/bulk  { ids: string[], status: offer_status }
 * Same shape/safety posture as the products bulk endpoint (§70/§71):
 * step-up required, every id applied individually, exact success/failure
 * counts returned, audited as one entry covering the whole batch.
 */
export async function POST(request) {
  const limited = await rateLimitOr429Async(request, "admin-offers-bulk", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  if (!hasValidStepUp(request, admin.user.id)) {
    return NextResponse.json({ error: "Bulk actions require step-up re-authentication.", stepUpRequired: true }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { ids, status } = body || {};
  if (!Array.isArray(ids) || ids.length === 0 || !ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json({ error: `ids (non-empty array) and a valid status (${ALLOWED_STATUSES.join(", ")}) are required.` }, { status: 400 });
  }
  if (ids.length > 200) {
    return NextResponse.json({ error: "Bulk actions are limited to 200 records at a time." }, { status: 400 });
  }

  let succeeded = 0;
  const failed = [];
  const now = new Date().toISOString();

  for (const id of ids) {
    const { error } = await admin.supabase.from("offers").update({ status, last_updated_at: now }).eq("id", id);
    if (error) failed.push({ id, error: error.message });
    else succeeded += 1;
  }

  await logAdminAction({
    supabase: admin.supabase,
    actor: admin.user,
    action: "offer.bulk_updated",
    entityType: "offer",
    entityId: null,
    metadata: { status, requested: ids.length, succeeded, failedCount: failed.length },
    stepUpUsed: true,
  });

  return NextResponse.json({ succeeded, failedCount: failed.length, failed });
}

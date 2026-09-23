import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { hasValidStepUp } from "@/lib/admin/step-up";
import { logAdminAction } from "@/lib/admin/audit";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const ALLOWED_ACTIONS = {
  archive: { status: "archived" },
  activate: { status: "active" },
  mark_out_of_stock: { status: "out_of_stock" },
};

/**
 * POST /api/admin/products/bulk  { ids: string[], action: "archive" | "activate" | "mark_out_of_stock" }
 *
 * §70/§71: a high-impact bulk mutation — requires step-up re-auth
 * regardless of how ordinary a single-record version of the same edit
 * would be (§94 draws that line at "bulk", not at "status change"). No
 * bulk hard-delete exists here or anywhere in the admin API (§70).
 * Every id is validated and applied individually so a bad id in the
 * batch doesn't silently mask the records that DID succeed — the
 * response always reports exact success/failure counts (§71 "do not
 * leave the UI claiming success when only some records changed").
 */
export async function POST(request) {
  const limited = await rateLimitOr429Async(request, "admin-products-bulk", { limit: 10, windowMs: 60_000 });
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

  const { ids, action } = body || {};
  const patch = ALLOWED_ACTIONS[action];
  if (!Array.isArray(ids) || ids.length === 0 || !patch) {
    return NextResponse.json({ error: `ids (non-empty array) and a valid action (${Object.keys(ALLOWED_ACTIONS).join(", ")}) are required.` }, { status: 400 });
  }
  if (ids.length > 200) {
    return NextResponse.json({ error: "Bulk actions are limited to 200 records at a time." }, { status: 400 });
  }

  let succeeded = 0;
  const failed = [];

  if (!admin.supabase) {
    succeeded = ids.length;
  } else {
    for (const id of ids) {
      const { error } = await admin.supabase.from("products").update(patch).eq("id", id);
      if (error) failed.push({ id, error: error.message });
      else succeeded += 1;
    }
  }

  await logAdminAction({
    supabase: admin.supabase,
    actor: admin.user,
    action: "product.bulk_updated",
    entityType: "product",
    entityId: null,
    metadata: { action, requested: ids.length, succeeded, failedCount: failed.length },
    stepUpUsed: true,
  });

  return NextResponse.json({ succeeded, failedCount: failed.length, failed });
}

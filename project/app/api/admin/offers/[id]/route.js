import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";
import { isValidHttpUrl } from "@/lib/security/url-validation";

export const dynamic = "force-dynamic";

const FIELDS = ["price", "original_price", "currency", "affiliate_url", "external_product_id", "status"];

export async function PATCH(request, { params }) {
  const limited = await rateLimitOr429Async(request, "admin-offers", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const patch = {};
  for (const key of FIELDS) {
    if (key in body) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No recognized fields to update." }, { status: 400 });

  if (patch.affiliate_url && !isValidHttpUrl(patch.affiliate_url, { blockPrivate: true })) {
    return NextResponse.json({ error: "Invalid affiliate URL. Must be a valid public HTTP or HTTPS URL." }, { status: 400 });
  }

  // last_updated_at reflects "an admin/system confirmed this price/
  // availability just now" (§77 stale-data UX depends on this being
  // accurate) — separate from `updated_at`, which the table's own
  // trigger already bumps on any change.
  patch.last_updated_at = new Date().toISOString();

  const priceChanged = "price" in patch;

  const { data, error } = await admin.supabase.from("offers").update(patch).eq("id", params.id).select().single();
  if (error) {
    console.error("/api/admin/offers/[id] PATCH:", error.message);
    return NextResponse.json({ error: "Could not update offer." }, { status: 400 });
  }

  await logAdminAction({
    supabase: admin.supabase,
    actor: admin.user,
    action: priceChanged ? "offer.price_changed" : "offer.updated",
    entityType: "offer",
    entityId: params.id,
    metadata: { changedKeys: Object.keys(patch) },
  });

  return NextResponse.json({ offer: data });
}

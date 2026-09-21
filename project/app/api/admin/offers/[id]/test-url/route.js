import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { resolveTrustedDestination, injectTrackingParam, isValidHttpUrl } from "@/lib/affiliate/url";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/offers/[id]/test-url
 *
 * §20: validates an offer's affiliate configuration end-to-end WITHOUT
 * going through `/go/[offerId]` — so testing it never inserts an
 * `affiliate_clicks` row or redirects anywhere (explicit test mode, §20
 * "do not accidentally generate fake production analytics"). Reuses the
 * exact same `lib/affiliate/url.js` functions the real redirect route
 * uses, so a "pass" here is a genuine guarantee the real flow will also
 * work, not a separate reimplementation that could drift.
 */
export async function GET(request, { params }) {
  const limited = await rateLimitOr429Async(request, "admin-test-url", { limit: 15, windowMs: 60_000 });
  if (limited) return limited;

  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const { data: offer, error } = await admin.supabase
    .from("offers")
    .select("id, status, affiliate_url, stores(name, base_url, status, tracking_param_name)")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !offer) return NextResponse.json({ error: "Offer not found." }, { status: 404 });

  const checks = {
    offerExists: true,
    offerActive: offer.status === "available",
    partnerActive: offer.stores?.status === "active",
    affiliateUrlConfigured: isValidHttpUrl(offer.affiliate_url),
    storeBaseUrlConfigured: isValidHttpUrl(offer.stores?.base_url),
    trackingParamConfigured: !!offer.stores?.tracking_param_name,
  };

  const destination = resolveTrustedDestination(offer, offer.stores || {});
  checks.destinationResolved = !!destination;

  let finalUrl = null;
  let finalUrlError = null;
  if (destination) {
    try {
      // A clearly-marked TEST value, never a real click_uuid — this is
      // what makes it obvious in any downstream log that this was a
      // dry-run, and it's never written to affiliate_clicks (this route
      // never calls recordAffiliateClick at all).
      finalUrl = injectTrackingParam(destination, offer.stores.tracking_param_name, "TEST-00000000-0000-0000-0000-000000000000");
    } catch (err) {
      finalUrlError = String(err.message || err);
    }
  }

  const passed = checks.offerActive && checks.partnerActive && checks.destinationResolved && !finalUrlError;

  return NextResponse.json({ passed, checks, finalUrl, finalUrlError, testMode: true });
}

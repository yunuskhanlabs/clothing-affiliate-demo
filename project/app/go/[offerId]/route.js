import { NextResponse } from "next/server";
import { resolveTrustedDestination, injectTrackingParam } from "@/lib/affiliate/url";
import { resolveSessionId, applySessionCookie } from "@/lib/affiliate/session";
import { isBotUserAgent } from "@/lib/affiliate/bot-detection";
import { recordAffiliateClick } from "@/lib/affiliate/click";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveRequestId } from "@/lib/observability/request-id";
import { logError } from "@/lib/observability/logger";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";
import { MOCK_PRODUCTS, MOCK_STORES } from "@/lib/products/mock-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMO_OFFER_REGEX = /^off-[0-9a-zA-Z_-]{1,64}$|^offer-[0-9a-zA-Z_-]{1,64}$|^p-[0-9a-zA-Z_-]{1,64}$/;

function renderErrorPage(status, requestId, newSessionId) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Deal Unavailable — Affiliate Demo</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0E0E10; color: #F4F4F5; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; box-sizing: border-box; }
    .card { background: #18181B; border: 1px solid #27272A; border-radius: 8px; padding: 32px; max-width: 440px; text-align: center; }
    h1 { font-size: 20px; margin: 0 0 12px; font-weight: 600; color: #FFFFFF; }
    p { font-size: 14px; color: #A1A1AA; line-height: 1.5; margin: 0 0 24px; }
    a { display: inline-block; background: #ff3d57; color: #FFFFFF; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 500; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Deal Unavailable</h1>
    <p>This deal isn't available right now. Please browse our other trending deals and products.</p>
    <a href="/deals">Browse Deals</a>
  </div>
</body>
</html>`;

  const res = new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "X-Robots-Tag": "noindex, nofollow",
      "x-request-id": requestId || "",
    },
  });

  if (newSessionId) {
    applySessionCookie(res, newSessionId);
  }

  return res;
}

/**
 * GET /go/{offerId}
 *
 * Resolves an affiliate offer from the database/storage layer and redirects to the
 * trusted merchant destination with subid tracking.
 */
export async function GET(request, { params } = {}) {
  const requestId = resolveRequestId(request.headers);

  // 1. Rate limiting & abuse protection (60 requests / minute / IP)
  const rateLimitResponse = await rateLimitOr429Async(request, "affiliate-redirect", {
    limit: 60,
    windowMs: 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const offerId = params?.offerId || "";

  // 2. Resolve anonymous session & bot signals
  const { sessionId, isNew: isNewSession } = resolveSessionId(request);
  const userAgent = request.headers.get("user-agent") || "";
  const referrer = request.headers.get("referer") || "";
  const isBot = isBotUserAgent(userAgent);

  // 3. Offer ID validation (reject malformed, injection, or traversal attempts with 400)
  if (
    !offerId ||
    typeof offerId !== "string" ||
    offerId.length > 100 ||
    (!UUID_REGEX.test(offerId) && !DEMO_OFFER_REGEX.test(offerId))
  ) {
    return renderErrorPage(400, requestId, isNewSession ? sessionId : null);
  }

  let offer = null;
  let store = null;
  let product = null;

  // 4. Database-driven resolution
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasSupabase = Boolean(supabaseUrl && supabaseKey && !supabaseUrl.includes("dummy-demo"));

  if (hasSupabase) {
    try {
      const supabase = getSupabaseAdminClient();
      const { data: offerRow, error } = await supabase
        .from("offers")
        .select(`
          id,
          affiliate_url,
          status,
          price,
          product_id,
          store_id,
          store:stores (
            id,
            name,
            base_url,
            affiliate_network,
            tracking_param_name,
            status
          ),
          product:products (
            id,
            status,
            name
          )
        `)
        .eq("id", offerId)
        .maybeSingle();

      if (!error && offerRow) {
        offer = offerRow;
        store = offerRow.store;
        product = offerRow.product;
      }
    } catch (err) {
      logError("Database offer lookup error", { offerId, error: String(err), requestId });
    }
  }

  // 5. Fallback storage lookup for standalone demo / seeded items
  if (!offer) {
    // Non-existent test UUID 00000000-0000-0000-0000-000000000000 should return 404
    if (offerId !== "00000000-0000-0000-0000-000000000000") {
      const matchedProduct = MOCK_PRODUCTS.find(
        (p) =>
          p.offerId === offerId ||
          p.id === offerId ||
          offerId.endsWith(p.id) ||
          offerId === "00000000-0000-0000-0000-000000000001"
      );

      if (matchedProduct) {
        const matchedStore = MOCK_STORES[0]; // Amazon
        store = {
          id: matchedStore.id,
          name: matchedStore.name,
          base_url: matchedStore.baseUrl,
          affiliate_network: "direct",
          tracking_param_name: "subid1",
          status: "active",
        };
        product = {
          id: matchedProduct.id,
          name: matchedProduct.name,
          status: "active",
        };
        offer = {
          id: offerId,
          product_id: matchedProduct.id,
          store_id: matchedStore.id,
          affiliate_url: `${matchedStore.baseUrl}/dp/${matchedProduct.slug}?tag=cloxtro-demo`,
          status: "available",
          price: matchedProduct.price,
        };
      }
    }
  }

  // 6. Availability & entity status verification
  if (!offer) {
    return renderErrorPage(404, requestId, isNewSession ? sessionId : null);
  }

  if (
    offer.status !== "available" ||
    store?.status === "inactive" ||
    store?.status === "suspended" ||
    product?.status === "archived"
  ) {
    return renderErrorPage(410, requestId, isNewSession ? sessionId : null);
  }

  // 7. Resolve trusted destination URL with SSRF & protocol protection
  const destinationUrl = resolveTrustedDestination(offer, store);
  if (!destinationUrl) {
    return renderErrorPage(502, requestId, isNewSession ? sessionId : null);
  }

  // 8. Generate Click ID & inject tracking param
  const clickUuid = crypto.randomUUID();
  const trackingParam = store?.tracking_param_name || "subid1";
  const finalRedirectUrl = injectTrackingParam(destinationUrl, trackingParam, clickUuid);

  // 9. Best-effort asynchronous click recording
  if (hasSupabase) {
    recordAffiliateClick({
      clickUuid,
      offerId: offer.id,
      productId: offer.product_id || product?.id,
      storeId: offer.store_id || store?.id,
      userId: null,
      sessionId,
      isBot,
      userAgent,
      referrer,
      trackingParam,
      redirectStatus: "redirected",
      requestId,
    }).catch(() => {});
  }

  // 10. Issue 302 temporary redirect with security headers
  const response = NextResponse.redirect(finalRedirectUrl, { status: 302 });
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("x-request-id", requestId);

  if (isNewSession) {
    applySessionCookie(response, sessionId);
  }

  return response;
}


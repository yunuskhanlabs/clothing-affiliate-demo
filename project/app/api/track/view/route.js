import { NextResponse } from "next/server";
import { recordProductViewEvent } from "@/lib/affiliate/click";
import { isBotUserAgent } from "@/lib/affiliate/bot-detection";
import { resolveSessionId, applySessionCookie } from "@/lib/affiliate/session";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/track/view  { productId }
 *
 * Called from `ProductDetailClient` with `fetch(..., { keepalive: true
 * })` and never awaited by the render path (§25 "analytics must not
 * degrade the user experience"). Always responds 204 even on internal
 * failure — a dropped analytics event is not something the caller should
 * retry aggressively or surface to the visitor.
 */
export async function POST(request) {
  const limited = await rateLimitOr429Async(request, "track-view", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  let body;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const productId = body?.productId;
  if (typeof productId !== "string" || !UUID_RE.test(productId)) {
    return new NextResponse(null, { status: 204 });
  }

  const { sessionId, isNew } = resolveSessionId(request);
  const userAgent = request.headers.get("user-agent");

  await recordProductViewEvent({
    productId,
    sessionId,
    isBot: isBotUserAgent(userAgent),
    referrer: request.headers.get("referer"),
  });

  const response = new NextResponse(null, { status: 204 });
  if (isNew) applySessionCookie(response, sessionId);
  return response;
}

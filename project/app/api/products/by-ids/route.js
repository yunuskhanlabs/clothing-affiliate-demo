import { NextResponse } from "next/server";
import { getProductsByIds } from "@/lib/products";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";

/**
 * GET /api/products/by-ids?ids=a,b,c
 *
 * Used by `FrequentlyViewed` (a "use client" component driven by
 * `useRecentlyViewed`'s localStorage/backend id list) since it can't
 * `await lib/products/index.js` directly.
 *
 * Bounded to 20 ids per request so a single call cannot become an
 * unbounded database read (the view consumer never needs more than 12,
 * the extra headroom covers future pagination needs).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 20;

export async function GET(request) {
  const limited = await rateLimitOr429Async(request, "products-by-ids", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const ids = (searchParams.get("ids") || "")
    .split(",")
    .filter((id) => UUID_RE.test(id))
    .slice(0, MAX_IDS);
  if (!ids.length) return NextResponse.json({ products: [] });

  try {
    const products = await getProductsByIds(ids);
    return NextResponse.json({ products });
  } catch (err) {
    console.error("/api/products/by-ids:", err);
    return NextResponse.json({ products: [] });
  }
}

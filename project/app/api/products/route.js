import { NextResponse } from "next/server";
import { parseFilters } from "@/lib/catalog/query-state";
import { queryProductCatalog } from "@/lib/products";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";

/**
 * GET /api/products?<same query params as the catalog URL state>&page=1&pageSize=12
 *
 * This is what `CatalogView` (a client component) calls instead of the
 * old synchronous `getAllProducts()` + `applyFilters()` + `sortProducts()`
 * chain — a client component cannot `await` `lib/products/index.js`
 * directly (it depends on `next/headers` via the server Supabase client).
 * Reuses `parseFilters()` from `lib/catalog/query-state.js` so the query
 * param contract is defined in exactly one place (§56 — don't drift from
 * Part 2's URL parameter names).
 */
export async function GET(request) {
  const limited = await rateLimitOr429Async(request, "products", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const { searchParams } = new URL(request.url);
  const filters = parseFilters(searchParams);

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(48, Math.max(1, Number(searchParams.get("pageSize")) || 12));

  // Route-locked filters (e.g. category=men on /men, subcategory on
  // /categories/[slug]) are sent by CatalogView as regular query params
  // already merged with the user's own filters (see updateUrl() in
  // CatalogView.jsx), so no special-casing is needed for those. `/deals`
  // is the one route with a predicate that ISN'T expressible as a normal
  // filter value (Part 2's `extraFilter={(p) => p.discountPercentage > 0}`
  // was a JS closure, which can't cross an HTTP boundary) — it sends
  // `deals=1` instead, and this route translates that into "at least 1%
  // discount" UNLESS the user has already picked a stronger discount
  // filter (the "50%+ OFF" quick link), so filtering still happens
  // server-side and pagination/total stay correct at every page.
  const isDeals = searchParams.get("deals") === "1";
  const effectiveFilters = isDeals && filters.discount === null ? { ...filters, discount: 1 } : filters;

  try {
    const { products, total } = await queryProductCatalog(effectiveFilters, { page, pageSize });

    return NextResponse.json({
      products,
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    });
  } catch (err) {
    console.error("/api/products:", err);
    return NextResponse.json({ error: "Could not load products. Please try again." }, { status: 500 });
  }
}

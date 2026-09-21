import { getAllProducts, getAllSubcategorySlugs } from "@/lib/products";
import { SITE_URL } from "@/lib/seo/site";

/**
 * PART 6 §11-§12 — dynamic XML sitemap via Next.js's built-in
 * `app/sitemap.js` convention. Every URL here is read from live
 * database state at request time (§11 "Sitemap generation should use
 * actual database state. Do not manually maintain thousands of URLs.")
 * — no code deploy is needed for a new/archived product to
 * appear/disappear here (§12).
 *
 * Deliberately excluded (§11):
 * - Archived products — `getAllProducts()` already filters to
 *   `status = 'active'` (see lib/products/index.js), so an archived
 *   product simply falls out of this list on its own.
 * - `/admin/**`, `/account`, `/wishlist` — private/internal, excluded
 *   from robots.txt too (app/robots.js).
 * - `/search` and any filtered/query-parameter catalog URL — §9 "do not
 *   automatically index arbitrary user search queries" / §8 "avoid
 *   allowing infinite low-value filter combinations to create index
 *   bloat." Only the canonical, unfiltered listing routes are included;
 *   `/products`, `/men`, `/women`, `/kids`, and each `/categories/{slug}`
 *   route are real, stable, curated landing pages, not ad hoc filter
 *   combinations, so they ARE included.
 * - Brand pages — no public `/brands/*` route exists in this codebase
 *   (only `/admin/brands`), so none are listed (§11 "use actual data" —
 *   never invent a route that doesn't exist).
 *
 * `getAllProducts()` caps at 500 rows (see its `DEFAULT_LIMIT`) — fine
 * at this catalog's current size, but the honest production note is in
 * PHASE-6-CONTEXT.md §12: a catalog that outgrows one page's sitemap
 * limit (50,000 URLs per Google's own spec, but a single fetch call
 * long before that) needs either the limit raised with pagination
 * support here, or a sitemap-index file splitting products across
 * several sitemap files — neither was needed at this catalog's size, so
 * neither was speculatively built (§3 "do not add complexity unless it
 * solves a real production requirement").
 */
export default async function sitemap() {
  const [products, subcategorySlugs] = await Promise.all([getAllProducts({ limit: 500 }), getAllSubcategorySlugs()]);

  const staticRoutes = ["/", "/products", "/men", "/women", "/kids", "/deals", "/categories"].map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: path === "/" || path === "/deals" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));

  const categoryRoutes = subcategorySlugs.map((slug) => ({
    url: `${SITE_URL}/categories/${slug}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const productRoutes = products.map((product) => ({
    url: `${SITE_URL}/product/${product.slug}`,
    lastModified: product.updatedAt || undefined,
    changeFrequency: "daily", // price/availability can change without a new deploy
    priority: 0.5,
  }));

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}

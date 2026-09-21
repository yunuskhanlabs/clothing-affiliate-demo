# PHASE-2-CONTEXT.md — Product Catalog + Product Experience

Continuation of the PART 1 foundation. This document is the handoff for PART 3.

## 1. What was implemented

- A typed product data contract + a deterministic (seeded) mock catalog of
  ~60 products across Men / Women / Kids and their subcategories.
- A single reusable `ProductCard`, used everywhere a product appears.
- Homepage sections wired to real (mock) data: Trending, Today's Deals,
  Under ₹499, Under ₹999, New Arrivals, Best Sellers, Seasonal, plus a new
  Men/Women/Kids department highlight section.
- A full category browsing system: `/categories`, `/categories/[slug]`,
  `/men`, `/women`, `/kids`, `/products`.
- A combinable filter system (department, price, size, color, brand,
  rating, discount, material, fit, occasion, new/trending/bestseller) with
  desktop sidebar + mobile drawer, fully synchronized to the URL.
- Sorting (relevance, popularity, price asc/desc, discount, rating,
  newest), also URL-synced.
- A lightweight search foundation with query interpretation (color, fit,
  "under ₹X") and a `/search` page.
- A product detail page: gallery, color/size selection, price/discount,
  rating, availability, primary CTA (visual only), delivery/return
  placeholders, affiliate disclosure, similar products, related products,
  frequently viewed (localStorage-backed).
- A deals experience (`/deals`) with quick filters and "coming soon"
  placeholders for flash deals / limited-time deals / price drops.
- Loading, empty, and error states throughout, reusing PART 1's
  `LoadingState` / `EmptyState` / `ErrorState`.
- Scroll-triggered reveal animation (`ScrollReveal`, IntersectionObserver)
  for product grids, separate from PART 1's load-time `fade-up`.
- Placeholder `/wishlist` and `/account` pages so PART 1's nav links don't
  404 — static only, no auth, no persistence (that's PART 3).

## 2. Files created

```
lib/products/schema.js         Product data contract (JSDoc typedef)
lib/products/mock-data.js      Seeded mock catalog + taxonomy + facets
lib/products/index.js          Data access layer (the Part 3 swap point)
lib/catalog/query-state.js     URL query-state contract (parse/serialize)
lib/catalog/filter-sort.js     applyFilters() / sortProducts()
lib/catalog/search.js          interpretQuery() / searchProducts()
lib/format.js                  formatPrice()
lib/hooks/useRecentlyViewed.js recordProductView() / useRecentlyViewed()

components/ui/ScrollReveal.jsx

components/product/ProductCard.jsx
components/product/ProductGrid.jsx
components/product/PriceTag.jsx
components/product/Rating.jsx
components/product/ProductBadge.jsx
components/product/WishlistButton.jsx
components/product/AffiliateDisclosure.jsx
components/product/Breadcrumb.jsx
components/product/Gallery.jsx
components/product/VariantSelector.jsx
components/product/DeliveryReturnInfo.jsx
components/product/ProductCTA.jsx
components/product/ProductDetailClient.jsx
components/product/FrequentlyViewed.jsx

components/catalog/FilterPanel.jsx
components/catalog/FilterDrawer.jsx
components/catalog/SortDropdown.jsx
components/catalog/ActiveFilterChips.jsx
components/catalog/SearchBar.jsx
components/catalog/SearchPageBody.jsx
components/catalog/CatalogView.jsx    (the shared engine behind every listing route)

components/home/CategoryHighlights.jsx  (new: Men/Women/Kids)

app/products/page.js
app/men/page.js, app/women/page.js, app/kids/page.js
app/categories/page.js, app/categories/[slug]/page.js
app/product/[slug]/page.js
app/search/page.js
app/deals/page.js
app/wishlist/page.js, app/account/page.js  (static placeholders only)
```

## 3. Files modified

- `app/page.js` — sections now receive real `products` arrays instead of
  rendering skeleton-only.
- `components/home/ProductGridShell.jsx` — extended to accept a
  `products` prop and render `ProductGrid`; `count` remains the
  loading-state fallback (`products === undefined` → skeleton).
- `components/home/CategoryShell.jsx` — now reads categories from
  `lib/products` taxonomy instead of a hardcoded placeholder list.
- `components/home/PriceBandShell.jsx` — query param fixed from `max` to
  the canonical `price_max`.

No PART 1 component was rewritten or had working behavior removed —
Header, Hero, Footer, and the animation/design system are untouched.

## 4. Routes added

`/products`, `/men`, `/women`, `/kids`, `/categories`,
`/categories/[slug]`, `/product/[slug]`, `/search`, `/deals`,
`/wishlist` (placeholder), `/account` (placeholder).

## 5. Product data model

See `lib/products/schema.js` for the full JSDoc contract. Every product
has: `id, name, slug, brand, category, subcategory, description, images[],
price, originalPrice, discountPercentage, rating, reviewCount, colors[],
sizes[], material, fit, occasion, tags[], availability, store,
affiliateUrl, badges[], createdAt, updatedAt`.

All reads go through `lib/products/index.js` (`getAllProducts`,
`getProductBySlug`, `getProductsByCategory`, `getSimilarProducts`,
`getRelatedProducts`, etc.) — no component imports `mock-data.js`
directly, except `index.js` itself and `lib/catalog/search.js` (for the
color-name list).

## 6. Filter architecture

`lib/catalog/filter-sort.js` exports `applyFilters(products, filters)`
and `sortProducts(products, sort)` — pure functions over a plain
`Product[]` array, framework-agnostic. `CatalogView` (the shared
client component behind every listing route) composes:
`getAllProducts() → searchProducts() → applyFilters() → extraFilter? →
sortProducts()`.

`FilterPanel` (desktop sidebar) and `FilterDrawer` (mobile sheet) both
render the same filter controls and both call the same `onChange(patch)`
callback — there's exactly one filter-UI implementation, not two.

## 7. URL query-state architecture + parameter naming

Centralized in `lib/catalog/query-state.js`:

```
category, subcategory        single value
brand, color, size            comma-separated list, e.g. brand=northline,marrow
price_min, price_max          number
rating, discount              number (minimum threshold)
material, fit, occasion       single value
new, trending, bestseller     "1" flag
q                              free-text search
sort                           relevance | popular | price_asc | price_desc
                                | discount | rating | newest
```

`parseFilters(searchParams)` never throws — unknown/invalid params are
ignored, missing params fall back to `DEFAULT_FILTERS`.
`filtersToQueryString(filters)` is the single serializer; every write to
the URL (`CatalogView.updateUrl`) goes through it, so parameter names
can't drift between routes.

Route-locked filters (e.g. `category: "men"` on `/men`) are passed as
`lockedFilters` to `CatalogView` and merged back in on every URL write,
so they can't be accidentally cleared, and their filter-panel group is
hidden via `hideFilterKeys`.

## 8. Sorting architecture

`SORT_OPTIONS` in `lib/catalog/query-state.js` is the single source of
truth for valid sort values (also drives the `<SortDropdown>` options
list). `sortProducts()` is a pure switch over those values.

## 9. Search architecture

`lib/catalog/search.js` — `interpretQuery()` extracts a max price
("under 799"), a known color name, and a known fit word from the raw
query, then `searchProducts()` filters on those hints plus a plain token
match against name/brand/category/subcategory/material/fit/occasion/tags.
This is intentionally the whole implementation for PART 2 — PART 5
replaces `interpretQuery()`/`searchProducts()` with an AI/semantic call;
nothing else in the search UI needs to change when that happens.

## 10. Product detail architecture

`app/product/[slug]/page.js` (server component: `notFound()`,
`generateMetadata`, breadcrumb, similar/related sections) renders
`ProductDetailClient` (client component: gallery, color/size selection
state, CTA, records the view via `recordProductView`).

## 11. Product gallery architecture

`components/product/Gallery.jsx` — main image is a strict 3:4 box with
skeleton-before-load and graceful `onError` fallback; thumbnails are
buttons with `role="tab"`/`aria-selected`.

## 12. 3:4 image / CLS strategy

Every product image container (`ProductCard`, `Gallery`,
`ProductCardSkeleton`, `CategoryHighlights`) uses Tailwind's
`aspect-[3/4]` utility on the *container*, before any image request
resolves. A `bg-surface-raised animate-pulse` skeleton `<div>` occupies
that same box until the `<img>` fires `onLoad`; if it instead fires
`onError`, a static gradient placeholder (same box, no image) takes
over. In both cases the box's dimensions never depend on the image's
natural size, so there is no image-induced reflow.

## 13. Skeleton strategy

`ProductGrid` renders `ProductCardSkeleton` (same 3:4 box + text-line
placeholders, matching the loaded card's approximate proportions) when
`products` is `undefined`. `CatalogView` intentionally sets
`products={undefined}` for ~180ms on every filter/sort/search change —
that's a stand-in for the async fetch PART 3's real Supabase queries
will introduce; the loading contract (`undefined` = loading, `[]` =
empty, array = data) is what PART 3 should preserve.

## 14. Mobile touch interaction model

Hover-only affordances (image zoom, CTA slide-in) are scoped with the
arbitrary Tailwind variant `[@media(hover:hover)]:group-hover:...`, so
touch devices never get a "stuck hover" after a tap. The card's image is
one full-bleed link (primary tap → product detail); the wishlist button
is a visually-overlapping but DOM-sibling touch target (not nested
inside the image's anchor) sized at 36×36px.

## 15. Affiliate disclosure placement

`components/product/AffiliateDisclosure.jsx`, rendered on: product
detail page (below the info grid), `/deals` (top of page, before the
catalog). Copy is explicitly marked as non-final in the component's own
doc comment.

## 16. Animation ownership

Unchanged from PART 1's ownership split (see MASTER-ARCHITECTURE.md).
PART 2 adds: product image hover zoom, card CTA slide-in, `ScrollReveal`
(IntersectionObserver-based scroll entrance for grids), filter drawer
slide-up, search recent-search dropdown fade. All respect
`prefers-reduced-motion` (`ScrollReveal` skips straight to visible).

## 17. Responsive behavior

Grid: 2 columns (mobile) → 3 (sm) → 4 (lg), via `ProductGrid`'s fixed
class string — not duplicated per section. Filter UI: sidebar ≥ `lg`,
drawer < `lg`.

## 18. Dependencies added

None. Everything above uses only what PART 1 already had (`next`,
`react`, Tailwind) plus browser-native `IntersectionObserver` and
`localStorage`.

## 19. Temporary/mock data location

`lib/products/mock-data.js`. Images are stable `images.unsplash.com`
URLs (already whitelisted in `next.config.js`); a handful may 404 over
time — `ProductCard`/`Gallery`'s `onError` fallback handles that
gracefully, it is not a bug to fix by hand.

## 20. Future Supabase integration points

Replace the bodies of the functions in `lib/products/index.js` with real
queries; keep every exported function name and signature. `CatalogView`,
`ProductGrid`, `ProductCard`, and every page already only talk to that
module.

## 21. Future affiliate integration points

`components/product/ProductCTA.jsx` — swap the `onClick` preventDefault
stub for a real `href="/go/[slug]"` link (tracking → redirect →
merchant). `product.affiliateUrl` is already a field on every product,
currently `"#"`.

## 22. Known limitations

- No real pagination — "Load more" is a client-side slice over the full
  (mock, in-memory) result set. Fine at this data size; PART 3 should
  move to real offset/cursor pagination once data is server-fetched.
- Search is token-matching, not fuzzy/typo-tolerant.
- Wishlist and recently-viewed are local-only (no cross-device sync) —
  by design for this phase.
- Build was **not** verified with `next build` in this environment
  (no network access to install `node_modules`). Run
  `npm install && npm run build` before deploying.

## 23. Known issues

- None identified in manual review; please run the PART 2 test matrix
  from the phase spec (§48) locally, especially the URL-state edge
  cases (§47), since they couldn't be exercised in a live browser here.

## 24. Exact requirements for PART 3

- Supabase schema should mirror `lib/products/schema.js` field-for-field
  to minimize changes in `lib/products/index.js`.
- Auth needed before `/wishlist` and `/account` can become real (they're
  currently static placeholders).
- `PersonalizedShell` (PART 1) is already gated on "sign in" — wire it up
  once accounts exist.

## 25. Architectural decisions

- `/categories/[slug]` shows a subcategory (e.g. "T-Shirts") **across all
  departments** (Men+Women+Kids) rather than being department-scoped —
  the department filter is just another filter inside it. This avoids a
  combinatorial explosion of routes and matches how `NAME_TEMPLATES`
  overlap across categories.
- One shared `CatalogView` powers `/products`, `/men`, `/women`, `/kids`,
  `/categories/[slug]`, `/search`, and `/deals` via `lockedFilters` /
  `hideFilterKeys` / `extraFilter` props, instead of six near-duplicate
  page implementations.

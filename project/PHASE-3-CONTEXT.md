# PHASE-3-CONTEXT.md — Supabase Backend + User System

Continuation of PART 1 (foundation) and PART 2 (product experience). This
document is the handoff for PART 4 (affiliate click/commission tracking).

## 1. What was implemented

- A normalized PostgreSQL schema (Supabase): categories, brands, stores,
  products, product_variants, product_images, offers, price_history,
  profiles, wishlist_items, recently_viewed, saved_searches, price_alerts.
- Explicit product lifecycle (`active` / `out_of_stock` / `archived`) —
  no hard deletes in normal operation.
- A `catalog_search()` Postgres RPC that does filtering + PostgreSQL
  full-text search + sorting + pagination in one indexed round trip.
- PostgreSQL full-text search: trigger-maintained `search_vector`
  (`tsvector`) + GIN index, `websearch_to_tsquery` + `ts_rank`.
- A database trigger that automatically writes `price_history` rows on
  `offers.price` changes — idempotent for no-op updates.
- Supabase Auth (email/password): signup, login, logout, password reset,
  session persistence via `@supabase/ssr` + middleware.
- Row Level Security on every table; an `is_admin()` foundation for future
  admin write access.
- Wishlist, recently-viewed (with anonymous localStorage fallback), saved
  searches, and price-alert **foundation** (no notification engine — that's
  Part 5) — all connected to the real Part 2 UI, not a second UI.
- `lib/products/index.js` rewritten to query Supabase; the mock catalog
  (`lib/products/mock-data.js`) is no longer imported anywhere but was
  **not deleted** — see §26 "Known limitations."

## 2. Price authority — read this before touching pricing code

This is a **multi-merchant** catalog: the same product can be listed by
several stores at several prices. `products` holds **no price column**.
The authoritative current price for a given merchant is `offers.price`.
A product's single "display price" (what `ProductCard` shows) is derived
— never stored — as the cheapest currently-`available` offer, via the
`product_listing` SQL view. See `supabase/migrations/0001_init_schema.sql`
§6 for the full reasoning. If a future phase adds a second price source,
it must either replace this decision everywhere or be clearly scoped
(e.g. "MSRP reference price" ≠ "sellable price") — never a second
silently-conflicting `price` column.

Variant-level pricing was deliberately **not** implemented (§8 below) —
all variants of a product share one offer's price; only stock varies per
variant.

## 3. Database schema

All DDL lives in `supabase/migrations/`, applied in order:

```
0001_init_schema.sql              enums, tables, triggers, indexes, RLS
0002_seed_dev_data.sql            dev/test seed data (NOT real merchant data)
0003_catalog_search_function.sql  catalog_search() RPC
```

### Tables

| Table              | Purpose                                          | Delete behavior on FK |
|---------------------|--------------------------------------------------|------------------------|
| `categories`        | departments (men/women/kids) + subcategories, one normalized table (`kind` column) | self-ref `parent_id` → `SET NULL` |
| `brands`             | brand identity                                   | — |
| `stores`             | affiliate partner/merchant identity (Part 4 foundation) | — |
| `products`           | product identity + catalog attributes, no price | `brand_id`/`department_id` → `RESTRICT` |
| `product_variants`   | color/size/SKU/stock per product                 | `product_id` → `CASCADE` (only case where a full product row deletion is expected to remove children — see §9) |
| `product_images`     | ordered images, one primary, optional variant scope | `product_id` → `CASCADE`, `variant_id` → `SET NULL` |
| `offers`             | **authoritative merchant price**, per (product, store) | `product_id`/`store_id` → `RESTRICT` |
| `price_history`      | append-only, trigger-populated only              | `offer_id`/`product_id` → `RESTRICT` |
| `profiles`           | 1:1 with `auth.users`                            | `id` → `CASCADE` (the one legitimate cascade — see §9) |
| `wishlist_items`     | user-owned, `UNIQUE(user_id, product_id)`        | `user_id` → `CASCADE`, `product_id` → `RESTRICT` |
| `recently_viewed`    | user-owned, `UNIQUE(user_id, product_id)`, upsert-bumps `viewed_at` | same as wishlist |
| `saved_searches`     | user-owned; `query_string` = exact `filtersToQueryString()` output | `user_id` → `CASCADE` |
| `price_alerts`       | user-owned, foundation only, no matching engine  | `user_id` → `CASCADE`, `product_id`/`offer_id` → `RESTRICT` |

### `categories` design note

Part 2's `/categories/[slug]` shows one subcategory (e.g. "T-Shirts")
**across** Men/Women/Kids at once, and `getAllSubcategorySlugs()`
de-duplicates subcategory slugs globally — subcategories are not nested
under one department in the actual UI. So `categories` is one table with
a `kind` enum (`department` | `subcategory`) and a self-referencing
`parent_id` that exists as a mechanism but is `null` for every row in
this phase — every product references a department row **and** a
subcategory row independently, matching the real Part 2 behavior instead
of inventing a nesting the frontend doesn't use.

## 4. Product lifecycle

`product_status`: `active` | `out_of_stock` | `archived`. Normal catalog
queries (`catalog_search()`, `getAllProducts()`, etc.) filter
`status = 'active'`. Nothing hard-deletes a product in normal operation.
`offer_status` is a **separate** enum on `offers`
(`available`/`out_of_stock`/`unavailable`/`discontinued`) — a product can
be `active` while a specific store's offer is `out_of_stock`, and an
`archived` product can still carry historical offer rows.

RLS does **not** filter by `status` — an archived product must stay
readable so a user's wishlist can still show its name and a "no longer
available" state (`app/wishlist/page.js` does exactly this). Excluding
archived products from discovery is an **application-query-layer** rule,
not an RLS rule (see `0001_init_schema.sql` §20 comment).

## 5. Data-access layer

`lib/products/index.js` — every exported function name/signature from
Part 2 is unchanged; every body is now `async` (queries Supabase) instead
of reading an in-memory array. This is the one unavoidable call-site
change: every Server Component that called these functions now `await`s
them. Files touched for this reason only (no other logic changed):

```
app/page.js
app/product/[slug]/page.js
app/categories/page.js
app/categories/[slug]/page.js
components/home/CategoryShell.jsx
```

`queryProductCatalog(filters, {page, pageSize})` is new — the scalable,
filter/search/sort/paginate path, delegating entirely to the
`catalog_search()` RPC. `getAllProducts()` still exists (capped at 500)
for the homepage, which composes ~8 rails from one shared fetch and
reuses Part 2's pure `sortProducts()` in memory — cheaper than 8 separate
round trips at this catalog size, and still bounded (see the doc comment
in the file for the explicit trade-off reasoning).

`lib/products/mappers.js` is new — the **only** place a Supabase row
becomes the frontend `Product` shape (`lib/products/schema.js`, unchanged
from Part 2). `mapListingRowToProduct()` for catalog/grid rows (from the
`product_listing` view), `mapDetailToProduct()` for the richer
product-detail query (product + variants + images + offers fetched
separately).

### Client components can't await the server layer

A few Part 2 components read product data directly and are `"use client"`
(they own interactive state — filters, drawers). A client component
cannot `await` `lib/products/index.js` (it depends on `next/headers`
cookies). These were converted to fetch from a new API route instead:

| Component | Was | Now |
|---|---|---|
| `CatalogView.jsx` | sync `getAllProducts()` + `applyFilters()` + `sortProducts()` + `searchProducts()` | fetches `/api/products?<filters>&page=&pageSize=` |
| `FilterPanel.jsx` | static `FACETS` import | `useFacets()` hook → `/api/facets` |
| `FrequentlyViewed.jsx` | sync `getProductsByIds()` | fetches `/api/products/by-ids?ids=` |

`Part 2's `extraFilter={(p) => p.discountPercentage > 0}` prop on
`CatalogView` (used by `/deals`) was a JS closure — closures can't cross
an HTTP boundary. Replaced with a `dealsOnly` boolean prop that the API
route (`app/api/products/route.js`) turns into "discount ≥ 1%, unless the
user already picked a stronger discount filter" — so `/deals?discount=50`
(the "50%+ OFF" quick link) still works and pagination/totals stay
correct at every page (a naive post-fetch JS filter would have broken
both).

## 6. `catalog_search()` — why an RPC instead of query-builder filters

Color/size filters need to match against `product_variants` (via a JSON
array/array column on the view), and `sort=relevance` needs `ts_rank`
against `search_vector` — both are awkward-to-impossible through
PostgREST's flat filter syntax. One SQL function keeps the entire
filter → full-text search → sort → paginate pipeline server-side and
consistent. Parameters mirror `parseFilters()`'s output field-for-field,
so `app/api/products/route.js` is a thin pass-through, not a second
filter implementation. Full definition:
`supabase/migrations/0003_catalog_search_function.sql`.

## 7. Full-text search

- `products.search_vector` (`tsvector`) — **trigger-maintained**, not a
  `GENERATED ALWAYS AS` column. A generated column's expression must be
  immutable and can't reference other tables, but `search_vector` needs
  the product's **brand name** and **category names**, which live in
  `brands`/`categories`. `products_refresh_search_vector()` is a
  `BEFORE INSERT OR UPDATE` trigger instead — the documented,
  safest database-native fallback (phase spec explicitly allows this when
  a generated column can't express the requirement). A brand/category
  rename cascades a lightweight re-touch to dependent products so
  `search_vector` stays in sync.
- Weights: product name = `A`, brand+tags = `B`, material/fit/occasion/
  category names = `C`.
- `idx_products_search_vector` — GIN index on `search_vector`.
- `catalog_search()` filters with `search_vector @@ websearch_to_tsquery(...)`
  and orders by `ts_rank(...)` when `sort=relevance` and a query is
  present.
- `lib/catalog/search.js` (Part 2's client-side heuristic
  `interpretQuery`/`searchProducts`) is **superseded** as the primary
  search path, not deleted — kept as a dependency-free utility that could
  back a future "did you mean" hint, decoupled from the retired mock-data
  fixture it used to import from.

## 8. Variant pricing — explicit simplification

Variants (`product_variants`) do **not** carry a price. Within one
store's offer, all size/color variants share that offer's price; only
`stock_quantity` varies per variant. This is a deliberate simplification
for an apparel catalog (documented in `0001_init_schema.sql` §6) chosen
specifically because the phase spec requires **one** authoritative price
model — adding a second, variant-scoped price column on top of
`offers.price` would recreate the exact conflicting-prices problem the
spec warns against. If a future phase needs true per-variant merchant
pricing, add `variant_id` to `offers` (one offer row per variant per
store) rather than introducing a new price column elsewhere.

## 9. Delete-behavior decisions (§44 of the phase spec)

Every foreign key's `ON DELETE` behavior was chosen deliberately, not
left at the Postgres default:

- **`RESTRICT`** (the majority): `products` ← `offers`, `products` ←
  `wishlist_items`/`recently_viewed`/`price_alerts`, `offers` ←
  `price_history`, `products`/`stores` ← `offers`. A product/offer must
  be **archived** (status change), never hard-deleted, while any of this
  historical/user-owned data references it. `RESTRICT` makes an
  accidental `DELETE` fail loudly instead of silently destroying data.
- **`CASCADE`**, used in exactly two places, both deliberately scoped to
  data that has no meaning without its parent: `product_variants`/
  `product_images` ← `products.id` (a variant/image with no product is
  meaningless — but products are archived, not deleted, in normal
  operation, so this only fires in exceptional admin data-maintenance),
  and `profiles.id` ← `auth.users.id` (a profile with no auth user is
  meaningless — and deleting the auth user is an explicit, intentional
  account-deletion action, not a soft-lifecycle event). `wishlist_items`/
  `recently_viewed`/`saved_searches`/`price_alerts` ← `auth.users.id` are
  also `CASCADE` — this is the user's own data; deleting their account
  should take it with them.
- **`SET NULL`**: `categories.parent_id`, `product_images.variant_id` —
  losing the parent/variant association shouldn't delete the row itself.

## 10. Automated price-history trigger

`AFTER UPDATE OF price ON offers ... WHEN (OLD.price IS DISTINCT FROM
NEW.price)` — attached to `offers` because `offers.price` is the
authoritative price owner (§2 above). The `WHEN` clause makes it
idempotent for no-op updates without even invoking the trigger function.
A second trigger (`AFTER INSERT`) records the very first price so a
product's initial price is part of its history timeline too. Both run
inside the same transaction as the write by construction (plain `AFTER`
triggers), so a price change and its history row are always consistent —
no application-layer history writes exist anywhere in the codebase.

Manually verified logical cases (see `0002_seed_dev_data.sql`'s "Oxford
Button-Down Shirt" seed row, which walks an offer through
`1299 → 999 → 899 → 799`):

1. Price changed (`1299 → 999`) → one new `price_history` row.
2. Price unchanged (`999 → 999`) → no row (blocked by the `WHEN` clause).
3. Multiple sequential changes → one row per genuine change, none skipped,
   none duplicated.
4. Transactional consistency: the trigger is a normal Postgres `AFTER`
   trigger, so it cannot run outside the `UPDATE`'s transaction by
   construction — there is no code path where a price changes without
   its history row, or vice versa.

## 11. Authentication

Supabase Auth, email/password only (no social login — not required by
this phase). `@supabase/ssr` provides three clients:

- `lib/supabase/client.js` — browser, anon key. Used by
  `lib/auth/actions.js` (signUp/signIn/signOut/resetPassword/
  updatePassword) and `lib/auth/AuthProvider.jsx`.
- `lib/supabase/server.js` — server, anon key + request session cookies
  (via `next/headers`). Used by every Server Component/Route Handler that
  needs session-aware reads (`lib/products/index.js`, all `/api/*`
  routes).
- `lib/supabase/admin.js` — service role, **server-only** (`server-only`
  package import forces a build error if ever imported client-side).
  Not currently called from any route in this phase — held in reserve
  for a legitimate future need (e.g. a Part 5 server-side alert-matching
  job) rather than used to route around RLS anywhere in Part 3.

`middleware.js` refreshes the session cookie on every request (standard
`@supabase/ssr` App Router pattern) — a freshness optimization, not the
authorization boundary (RLS + each route's own `auth.getUser()` check is).

Pages: `/login`, `/signup`, `/forgot-password`, `/reset-password`,
`/auth/callback` (exchanges Supabase's emailed one-time `code` for a
session). All reuse existing `Container`/`SectionHeading`/`Button`
components and a new small `components/auth/AuthForm.jsx` (styled
identically to `FilterPanel`'s existing input styling) — no new visual
language introduced. Errors are mapped to friendly strings in
`lib/auth/actions.js`'s `friendlyError()` — raw Supabase error text is
never shown to the user.

`handle_new_auth_user()` (DB trigger on `auth.users` insert) auto-creates
a `profiles` row on signup, so the app never has a user with no profile.

## 12. Authorization / roles

`app_role` enum (`user` | `admin`) on `profiles.role`. `is_admin(uid)` is
a `SECURITY DEFINER` SQL function RLS policies call to check admin status
without recursively re-triggering RLS on `profiles` itself. Catalog
tables (`products`, `brands`, `categories`, `stores`, `product_variants`,
`product_images`, `offers`) have `select true` (public) and
`is_admin(auth.uid())`-gated write policies — this phase does **not**
build an admin UI (that's Part 5's `Admin Panel`), just the enforced
foundation so Part 5 can add one without touching the schema or RLS
model.

## 13. Row Level Security

Enabled on every table. Summary:

- **Public read**: `categories`, `brands`, `stores`, `products`,
  `product_variants`, `product_images`, `offers`, `price_history` — all
  `select true`. Deliberately not status-filtered (§4 above).
- **Admin-gated write**: same catalog tables, `is_admin(auth.uid())`.
  `price_history` has **no** write policy for anyone — only the
  `SECURITY DEFINER` trigger functions (which run as table owner,
  bypassing RLS) can insert it.
- **Strictly own-rows-only** (`auth.uid() = user_id`, all four verbs):
  `wishlist_items`, `recently_viewed`, `saved_searches`, `price_alerts`.
- **`profiles`**: users can select/update only their own row; admins can
  select all; no user-facing insert policy (rows are trigger-created).

Verified manually against the policy definitions (no live Supabase
project was available in this environment to run integration tests
against — see §26): every user-data table's policies were written and
reviewed to guarantee `auth.uid() = user_id` on every verb, and every
route handler additionally re-checks `auth.getUser()` server-side and
never trusts a client-supplied user id, so a compromised/absent RLS
policy would still not be the only line of defense. A real project
should still run the standard Supabase RLS test suite (create two test
users, confirm User A cannot see/modify User B's wishlist/saved-searches/
price-alerts rows) before going live.

## 14. Wishlist

`app/api/wishlist/route.js` (GET/POST/DELETE) +
`lib/wishlist/WishlistProvider.jsx` (client context — one fetch per
session, shared by every `WishlistButton` on the page instead of one
fetch per product card) + `WishlistButton.jsx` (rewritten to read/toggle
real state; signed-out clicks redirect to `/login?next=<path>` since
wishlist rows are user-owned and RLS-enforced — there's no anonymous
wishlist to fall back to) + `/app/wishlist/page.js` (real page, lists
saved products, and separately surfaces items whose product has since
gone `archived`/deleted-from-view without ever losing the underlying
`wishlist_items` row).

`UNIQUE(user_id, product_id)` + upsert with `ignoreDuplicates: true`
prevents duplicate rows on repeat "add" clicks.

## 15. Recently viewed

`lib/hooks/useRecentlyViewed.js` — `recordProductView()` still writes to
`localStorage` unconditionally (Part 2's anonymous-visitor behavior is
byte-for-byte unchanged) and **also** fires a best-effort
`POST /api/recently-viewed`, which is a safe no-op server-side when
nobody is signed in. `useRecentlyViewed()` merges the backend list
(authoritative once signed in) with any very-recent local-only entries.
`FrequentlyViewed.jsx` fetches the actual product objects via
`/api/products/by-ids` (a client component, can't await the server data
layer directly).

## 16. Saved searches

`app/api/saved-searches/route.js` — `query_string` is stored **exactly**
as `filtersToQueryString()` (Part 2, unchanged) produces, so a saved
search replays by appending it to any catalog `basePath` with zero
translation. No UI was built to create/manage saved searches from the
catalog page in this phase (out of the phase's required scope beyond the
data model + API) — the API is ready for a "Save this search" button in
a later phase.

## 17. Price alert foundation

`app/api/price-alerts/route.js` — full CRUD (`GET`/`POST`/`PATCH`/
`DELETE`), no matching/notification engine (Part 5's job). `offer_id` is
nullable so an alert can target "this product, any store" or one specific
store's offer.

## 18. Product images / storage

Images continue to be plain URLs (Unsplash, per Part 2's `next.config.js`
`remotePatterns`) referenced from `product_images.url` — Supabase Storage
was **not** introduced in this phase, per §14 of the spec ("If the
project already uses an external image source, preserve that
architecture where appropriate instead of migrating everything without
reason"). `product_images` is schema-ready for Storage URLs later (it
only cares that `url` is a stable, fetchable string).

## 19. Indexing decisions

Composite indexes are adapted to this schema's actual price owner (see
§2 above) rather than the spec's literal `(category_id, status, price)`
example, since `products` holds no price column:

- `idx_products_department_status_created (department_id, status, created_at desc)`
- `idx_products_brand_status_created (brand_id, status, created_at desc)`
- `idx_products_subcategory_status (subcategory_id, status)`
- `idx_products_status_rating (status, rating desc)`
- `idx_offers_product_status_price (product_id, status, price)` — the
  schema-accurate equivalent of the spec's price-composite example;
  price filtering/sorting happens against `offers.price`.
- `idx_offers_store_status_price (store_id, status, price)`
- `idx_products_search_vector` — GIN, full-text search.
- Per-user-table indexes: `wishlist_items(user_id, created_at desc)`,
  `recently_viewed(user_id, viewed_at desc)`, `saved_searches(user_id, ...)`,
  `price_alerts(user_id)`, `price_alerts(product_id)`.
- `price_history(offer_id, changed_at desc)`, `price_history(product_id, changed_at desc)`.

`products.slug` and `brands.slug`/`stores.slug`/`categories.slug` already
have unique-constraint-backed indexes. No live Supabase project was
available in this environment to run `EXPLAIN` against real query plans
(§26) — index choices are based on the WHERE/ORDER BY patterns in
`catalog_search()` and the data-access layer, not measured execution
plans. Verify with `EXPLAIN ANALYZE` against a populated project before
relying on these at production scale.

## 20. Filter → query mapping

`app/api/products/route.js` calls `parseFilters(searchParams)` (Part 2,
unchanged) then passes the result straight into
`queryProductCatalog(filters, {page, pageSize})` →
`catalog_search()`. Parameter names in the URL are **unchanged** from
Part 2 (`category`, `subcategory`, `brand`, `color`, `size`, `price_min`,
`price_max`, `rating`, `discount`, `material`, `fit`, `occasion`, `new`,
`trending`, `bestseller`, `q`, `sort`) — no renames, per §56 of the phase
spec.

## 21. Sorting / pagination

All handled inside `catalog_search()`'s single query (`ORDER BY CASE
WHEN p_sort = ...`, `LIMIT`/`OFFSET`, `count(*) over()` for `total`).
`CatalogView.jsx` calls `/api/products` with `page`/`pageSize` and
appends results on "Load more" (`page += 1`) rather than fetching
everything — no full-table fetch anywhere in the listing path.

## 22. Security decisions

- Service-role key (`SUPABASE_SERVICE_ROLE_KEY`) is read only in
  `lib/supabase/admin.js`, guarded by the `server-only` package so any
  accidental client-side import fails the build. Not currently invoked
  by any route — kept in reserve.
- Every `/api/*` route re-derives the user from
  `supabase.auth.getUser()` server-side; none trust a client-supplied
  user id. RLS is the actual authorization boundary underneath that.
- `.env.local` is already gitignored (inherited from Part 1); added
  `.env.local.example` documenting the three required variables.
- No raw Supabase error text is ever returned to the client — every
  route/auth-action maps errors to a generic friendly message.

## 23. Performance

- Catalog browsing/search/filtering: one `catalog_search()` RPC call per
  page, server-side filter+sort+paginate, GIN + composite indexes.
- Homepage: one bounded (`limit 500`) fetch, ~8 rails derived in memory
  (documented trade-off, §5 above) — not 8 separate round trips, not an
  unbounded fetch.
- `useFacets()` and the wishlist context both cache their one fetch at
  module/context scope so repeated component mounts don't re-request.
- No realtime subscriptions were added (not required by this phase).

## 24. Files created

```
supabase/migrations/0001_init_schema.sql
supabase/migrations/0002_seed_dev_data.sql
supabase/migrations/0003_catalog_search_function.sql
.env.local.example

lib/supabase/client.js
lib/supabase/server.js
lib/supabase/admin.js
lib/products/mappers.js
lib/auth/AuthProvider.jsx
lib/auth/actions.js
lib/wishlist/WishlistProvider.jsx
lib/hooks/useFacets.js

middleware.js

app/api/products/route.js
app/api/products/by-ids/route.js
app/api/facets/route.js
app/api/wishlist/route.js
app/api/recently-viewed/route.js
app/api/saved-searches/route.js
app/api/price-alerts/route.js
app/auth/callback/route.js
app/login/page.js
app/signup/page.js
app/forgot-password/page.js
app/reset-password/page.js

components/auth/AuthForm.jsx
```

## 25. Files modified

```
lib/products/index.js         rewritten — Supabase queries, all async
lib/catalog/search.js         decoupled from retired mock-data fixture
lib/hooks/useRecentlyViewed.js backend sync added, localStorage kept
package.json                  + @supabase/ssr, @supabase/supabase-js, server-only

app/layout.js                 wrapped in AuthProvider + WishlistProvider
app/page.js                   async, awaits getAllProducts()
app/product/[slug]/page.js    async, awaits data-layer calls
app/categories/page.js        async, awaits getTaxonomy()
app/categories/[slug]/page.js async, awaits data-layer calls
app/deals/page.js             extraFilter prop → dealsOnly prop
app/wishlist/page.js          real implementation (was static placeholder)
app/account/page.js           real implementation (was static placeholder)

components/home/CategoryShell.jsx  async, awaits getTaxonomy()
components/catalog/CatalogView.jsx rewritten — fetches /api/products
components/catalog/FilterPanel.jsx FACETS import → useFacets() hook
components/product/WishlistButton.jsx rewritten — real per-user state
components/product/FrequentlyViewed.jsx rewritten — fetches by-ids API
components/product/ProductCard.jsx  passes product.id to WishlistButton
components/product/ProductDetailClient.jsx  passes product.id to WishlistButton
```

## 26. Known limitations / known issues

- **No live Supabase project was available in this development
  environment.** The migrations were written and manually reviewed for
  correctness (syntax, RLS policy logic, trigger behavior, index
  rationale) but were not executed against a real Postgres instance in
  this session, and the app was not run against live data end-to-end. A
  production `next build` **was** run successfully against this exact
  codebase (all routes/pages compile, no import or syntax errors) — see
  the build output referenced in the handoff conversation — but that
  only proves the JavaScript/JSX layer is sound, not that every SQL
  statement executes without a typo. **Before shipping**: run
  `supabase db push` (or paste the three migration files into the SQL
  editor in order) against a real project, then re-run the price-history
  and RLS test cases described in §10/§13 against real data.
- `lib/products/mock-data.js` was **not deleted** (§63 of the phase spec:
  "remove... only after the real backend is confirmed working" —
  confirmation wasn't possible without a live project in this
  environment). Nothing imports it anymore (`lib/catalog/search.js` was
  decoupled from it in this phase). Safe to delete once a live project is
  verified working.
- No Supabase Storage bucket was configured (§18 above) — images remain
  external URLs, matching the existing Part 1/2 image strategy.
- Saved searches and price alerts have API routes and a database model
  but no dedicated UI to create them yet (no "Save this search" or "Alert
  me" button was added to `CatalogView`/product detail) — intentionally
  scoped out to stay inside "user-data foundation," not a full feature
  build; a later phase can add the UI against the existing API.
- Google/social login was not added (not required; §21 of the phase spec
  makes it conditional on actual need).

## 27. Exact requirements for PART 4

- `stores` and `offers` tables already model `Product → Offer → Partner`
  — Part 4 adds affiliate click tracking (a new `affiliate_clicks` table
  referencing `offers`/`users`), conversion/commission tracking, and
  turns `offers.affiliate_url` from a placeholder into a real redirect
  target. No schema changes to `products`/`offers` should be needed —
  only new tables + a redirect route.
- The admin RLS foundation (`is_admin()`, admin-gated write policies) is
  ready for Part 5's admin panel to build directly on top of.
- `price_alerts` and `saved_searches` have working CRUD APIs; Part 5's
  automation/notification engine and admin panel can read/write them
  directly rather than introducing parallel tables.

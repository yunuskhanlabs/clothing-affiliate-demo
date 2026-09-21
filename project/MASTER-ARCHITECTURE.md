# Master Architecture — CLOXTRO (Fashion Discovery & Affiliate Platform)

This document describes the architecture **as it actually exists in the
code** after Part 6 — the final production-hardening phase. Every later
change should read this before touching anything. (§ headers below still
match the PART 1 structure; PART 2, PART 3, PART 4, PART 5, and PART 6
additions are marked inline rather than renumbered below §9, so old
cross-references stay valid. PART 3 added §9 for the backend; PART 4
added §10 for the affiliate engine; PART 5 added §11 for admin/
automation/AI; PART 6 added §13 for production hardening — SEO,
performance, security headers, request correlation, monitoring, and
deployment. This is the final single source of truth; no competing
architecture document exists.)

## 1. Framework & build system

- **Next.js 14.2.35**, App Router (`app/`), JavaScript (no TypeScript yet —
  see "Open decisions" if a later phase wants to migrate).
- **Tailwind CSS 3.4** for styling. No CSS-in-JS, no separate CSS Modules
  except `app/globals.css` for tokens/base/utilities that don't fit Tailwind
  classes (focus rings, nav underline, section rhythm, reduced-motion).
- **Fonts**: self-hosted via `@fontsource/fraunces` and `@fontsource/inter`,
  imported in `app/layout.js`. Deliberately **not** `next/font/google` —
  that fetches from Google at build time, which fails in network-restricted
  environments (CI, sandboxes) and adds a runtime dependency on Google's
  CDN. Self-hosted packages avoid both.
- Package manager: npm. `package.json` lists exact dependency set — keep it
  minimal, every new dependency should earn its place.

## 2. Folder structure

```
app/
  layout.js          Root layout — fonts, metadata, <Header>/<Footer> shell
  page.js             Homepage — composes Hero + section shells (now with real data)
  globals.css         Design tokens (CSS vars), base styles, small utilities
                       Tailwind can't express cleanly (nav underline, focus
                       ring, reduced-motion, section divider rhythm)
  products/page.js               /products — master catalog
  men/, women/, kids/page.js     department catalogs (locked category filter)
  categories/page.js             category index
  categories/[slug]/page.js      subcategory catalog, cross-department
  product/[slug]/page.js         product detail
  search/page.js                 search results
  deals/page.js                  deals experience
  wishlist/, account/page.js     Part 3: real auth-gated pages
  go/[offerId]/route.js          Part 4: secure affiliate redirect (302, no-store)
  api/track/view/route.js        Part 4: product-view analytics beacon
  api/webhooks/affiliate/[network]/route.js   Part 4: HMAC-verified conversion ingestion
  api/admin/analytics/partner|product/route.js  Part 4: admin-gated performance queries
components/
  ui/                 Framework-agnostic primitives, no page-specific logic
    Container.jsx
    Button.jsx
    Section.jsx       + SectionHeading
    States.jsx         LoadingState / EmptyState / ErrorState
    ScrollReveal.jsx    Part 2: IntersectionObserver scroll-entrance wrapper
  layout/             Structural chrome shared by every route
    Header.jsx         Sticky nav, mobile menu (client component)
    Footer.jsx
  home/               Homepage-specific composition
    Hero.jsx
    CategoryShell.jsx        now data-driven from lib/products taxonomy
    CategoryHighlights.jsx   Part 2: Men/Women/Kids department tiles
    ProductGridShell.jsx     renders real ProductCards via ProductGrid
    PriceBandShell.jsx
    PersonalizedShell.jsx
  product/            Part 2: everything product-detail/product-card related
    ProductCard.jsx PriceTag.jsx Rating.jsx ProductBadge.jsx
    WishlistButton.jsx AffiliateDisclosure.jsx Breadcrumb.jsx
    Gallery.jsx VariantSelector.jsx DeliveryReturnInfo.jsx ProductCTA.jsx
    ProductDetailClient.jsx FrequentlyViewed.jsx ProductGrid.jsx
    OfferComparison.jsx    Part 4: price-comparison table, commission-blind ranking
  catalog/            Part 2: filtering/sorting/search UI
    FilterPanel.jsx FilterDrawer.jsx SortDropdown.jsx
    ActiveFilterChips.jsx SearchBar.jsx SearchPageBody.jsx
    CatalogView.jsx    the shared engine behind every listing route
lib/
  products/           data contract + access layer (Part 3: backed by Supabase)
    schema.js index.js mappers.js
    offers.js          Part 4: getOffersForProduct() — the one best-price implementation for the comparison UI
    price-history.js   Part 4: getRecentPriceDrop(), reads Part 3's price_history only
  catalog/            Part 2: filter/sort/search, framework-agnostic
    query-state.js filter-sort.js search.js
  affiliate/          Part 4: click tracking, redirects, webhooks — all server-only
    bot-detection.js session.js url.js click.js webhook-verify.js
    network-adapters/index.js network-adapters/generic.js
  analytics/trackView.js   Part 4: client-side fire-and-forget view beacon
  format.js           Part 2: formatPrice()
  hooks/useRecentlyViewed.js   Part 2/3: recently-viewed (local + synced)
```

**Rule for future phases:** page-specific components live under
`components/<domain>/` (e.g. `components/product/`, `components/catalog/`).
Cross-page primitives go in `components/ui/`. Non-component logic goes in
`lib/<domain>/`, kept framework-agnostic where possible (pure functions
over plain data) so it can move server-side later without a rewrite.
Don't add components directly under `components/` root.

## 3. Component architecture

- `components/ui/*` are the only components allowed to be purely
  presentational with no business logic — treat them as the design system.
- `ProductGridShell` takes `eyebrow`, `title`, `description`, `viewAllHref`,
  `count` (skeleton fallback), and now `products` — when `products` is
  `undefined` it renders `count` skeleton cards via `ProductGrid`; when
  it's an array (incl. empty) it renders real `ProductCard`s or the empty
  state. **This `undefined` = loading / `[]` = empty / array = data
  contract is what Part 3's async Supabase fetching should preserve.**
- `ProductCard` (`components/product/ProductCard.jsx`) is the **only**
  product card in the codebase — every rail, grid, and recommendation
  section renders it via `ProductGrid`. Do not create a second card
  component for a specific section; extend `ProductCard`'s props instead.
- `CatalogView` (`components/catalog/CatalogView.jsx`) is the **only**
  filter/sort/search/grid implementation. `/products`, `/men`, `/women`,
  `/kids`, `/categories/[slug]`, `/search`, and `/deals` are all thin
  `page.js` files that render `<CatalogView>` with different
  `basePath` / `lockedFilters` / `hideFilterKeys` / `extraFilter` props —
  they do not each implement their own filtering.
- `Header` and `Footer` are the only components that know about the full
  site nav. The wishlist/account icons in the header link to `/wishlist`
  and `/account`, which Part 3 made real, auth-gated pages.

## 4. Routing strategy

- App Router, file-based.
- Live after Part 5: `/`, `/products`, `/men`, `/women`, `/kids`,
  `/categories`, `/categories/[slug]`, `/product/[slug]`, `/search`,
  `/deals`, `/wishlist`, `/account`, `/go/[offerId]` (Route Handler, not
  a page), `/api/track/view`, `/api/webhooks/affiliate/[network]`,
  `/api/ai/search`, `/api/ai/recommendations`, `/api/cron/automation`
  (bearer-token authenticated, not a session route), and the full
  `/admin/**` area (dashboard, products, categories, brands, offers,
  partners, deals, content, analytics, conversions, commissions,
  automation, ai, audit-logs, settings) with its `/api/admin/**`
  counterpart routes (§11).
- All catalog-type routes (`/products`, `/men`, `/women`, `/kids`,
  `/categories/[slug]`, `/search`, `/deals`) are shareable, deep-linkable
  URLs — filter/sort/search state lives in the query string, not
  component memory. See §5's new "URL query-state" subsection.

## 5. Styling strategy & design tokens

All tokens are defined in `tailwind.config.js theme.extend`, sourced from
CSS custom properties where relevant (`--font-display`, `--font-body` in
`globals.css`). Don't hardcode hex values in components — extend the
token set in `tailwind.config.js` instead.

### Color tokens

| Token | Hex | Use |
|---|---|---|
| `ink` | `#0E0E10` | Page background |
| `ink-soft` | `#141417` | Slightly-lifted background (footer) |
| `surface` | `#17171A` | Cards, skeleton blocks |
| `surface-raised` | `#1D1D21` | Nested surfaces |
| `border` | `#26262B` | Default hairline border |
| `border-strong` | `#333338` | Emphasized border (badges, secondary CTA) |
| `paper` | `#F2F0EC` | Primary text |
| `paper-muted` | `#C8C6C0` | Secondary text |
| `paper-dim` | `#8B8983` | Muted/tertiary text |
| `tag` | `#FF3D57` | Accent — CTAs, price/deal signaling, focus ring |
| `tag-hover` | `#FF5C73` | Accent hover state |
| `tag-soft` | `#3A1620` | Accent tint background (error/alert state) |

Chosen deliberately: a "price tag red" accent on a near-black ground,
paired with an editorial serif (Fraunces) for headings — reads as
fashion-magazine/deals-driven rather than generic SaaS. Avoid introducing
a second accent color; if a phase needs a semantic color (success,
warning), add it as a named token here, not an inline hex.

### Typography

- Display face: **Fraunces** (`font-display`) — used for H1/H2/hero only,
  set in italic for emphasis words. Never use for body copy or UI chrome.
- Body/UI face: **Inter** (`font-body`) — everything else, including nav
  and buttons (uppercase + letterspaced via utility classes, not a
  different font).
- Scale: `text-display-xl` (hero H1), `text-display-lg` (reserved for
  future large headings), `text-section-head` (section H2). Body sizes use
  default Tailwind scale (`text-sm`, `text-base`, etc).

### Responsive breakpoints

Default Tailwind breakpoints, used consistently: `sm` 640px, `lg` 1024px.
Container max-width is `max-w-content` (1360px), horizontal padding scales
`px-5 → sm:px-8 → lg:px-10`. Mobile-first: base classes target mobile,
overrides added at `sm:`/`lg:`.

### Animation conventions

- Standard easing: `ease-premium` = `cubic-bezier(0.4, 0, 0.2, 1)`.
- Standard duration: **0.3s** for interactive transitions (nav underline,
  sticky header, hover states, mobile menu icon).
- Entrance animations (hero text) use `animate-fade-up` (0.6s, staggered
  via inline `[animation-delay:_]` utility classes) — reserved for
  above-the-fold, page-load moments only. Don't reuse `fade-up` for
  scroll-triggered reveals; Part 2 should define its own scroll-reveal
  utility for product grids (see "Animation ownership" below) rather than
  repurpose this one, since the two need different trigger mechanisms
  (load vs. intersection observer).
- All continuous/ambient motion (hero mesh background) is wrapped in
  `motion-safe:` variants, and `globals.css` additionally forces
  `animation-duration: 0.001ms !important` under
  `prefers-reduced-motion: reduce` as a global safety net.

### Animation ownership (do not violate)

- **Part 1 owns**: header sticky transition, nav underline hover, hero text
  reveal, hero background drift, CTA hover/focus/active states, the global
  motion conventions above.
- **Part 2 owns** (implemented): product-card image zoom + CTA slide-in
  (`components/product/ProductCard.jsx`, both scoped to
  `[@media(hover:hover)]:group-hover:...` so touch devices never get a
  stuck hover), product-grid scroll reveal (`components/ui/ScrollReveal.jsx`,
  IntersectionObserver-based, separate trigger mechanism from `fade-up` as
  planned), filter drawer slide-up (`components/catalog/FilterDrawer.jsx`).
  None of `Header.jsx`, `Hero.jsx`, or `globals.css`'s `.nav-link` rule
  were touched to build these.

### URL query-state architecture (Part 2)

The URL is the canonical, shareable representation of catalog state —
never keep filter/sort/search state exclusively in component memory.
Single source of truth: `lib/catalog/query-state.js`
(`parseFilters`/`filtersToQueryString`/`DEFAULT_FILTERS`/`SORT_OPTIONS`).
Parameter names (don't drift from these): `category, subcategory, brand,
color, size, price_min, price_max, rating, discount, material, fit,
occasion, new, trending, bestseller, q, sort`. List-valued params
(`brand`, `color`, `size`) are comma-separated. Unknown/invalid params are
ignored, never thrown — a stale or hand-edited URL must not crash a page.

## 6. Naming conventions

- Components: PascalCase file + export (`Header.jsx`, `ProductGridShell.jsx`).
- Non-component modules (utils, config): kebab-case or camelCase file name,
  no JSX.
- Route segments: kebab-case (`/affiliate-disclosure`, `/new-arrivals`).
- Tailwind color/token names: kebab-case, semantic not literal (`tag`, not
  `red`; `surface-raised`, not `gray-800`).

## 7. Reusable components inventory

**Part 1 primitives:** `Container`, `Button` (variants: `primary` /
`secondary` / `ghost`), `Section` + `SectionHeading`, `LoadingState` /
`EmptyState` / `ErrorState`, `Header`, `Footer`.

**Part 2 additions:** `ScrollReveal` (ui); `ProductCard`, `ProductGrid`,
`PriceTag`, `Rating`, `ProductBadge`, `WishlistButton`,
`AffiliateDisclosure`, `Breadcrumb`, `Gallery`, `ColorSelector`/
`SizeSelector`, `DeliveryReturnInfo`, `ProductCTA` (product);
`FilterPanel`, `FilterDrawer`, `SortDropdown`, `ActiveFilterChips`,
`SearchBar`, `CatalogView` (catalog). Use these instead of
re-implementing equivalents — in particular, always render products via
`ProductCard`/`ProductGrid` and always build a new listing route on top
of `CatalogView`.

**Part 4 addition:** `OfferComparison` (product) — the price-comparison
table, rendered on the product detail page when a product has more than
one active offer. Ranks purely on availability + price (see §10) — never
extend it to accept or weight commission data.

## 8. Future integration points

### Supabase (integrated — Part 3; see §9 for the full backend architecture)

The mock data layer described here in Part 2 (`lib/products/mock-data.js`)
is retired from the active code path. `lib/products/index.js` now queries
Supabase — every function name/signature from Part 2 is unchanged, only
the bodies became `async`. See §9 below for the schema, RLS, and
data-access-layer details, and `PHASE-3-CONTEXT.md` for the full
narrative.

### Affiliate system (integrated — Part 4; see §11 for the full engine)

`View Deal → /go/[offerId] → ClickID generated → click recorded →
network-specific tracking param injected → 302 → Merchant` is live.
`components/product/ProductCTA.jsx` and `ProductCard.jsx`'s slide-in CTA
now render a real `<a href="/go/{offerId}">` instead of a local-state
stub. `offers`/`stores` (§9) were extended, not replaced — no competing
affiliate-partner table exists. See §11 below for the click/conversion/
commission model, redirect security, and webhook verification.

### Authentication (integrated — Part 3; see §9)

`Header.jsx`'s account/wishlist icons link to real `/account` and
`/wishlist` pages now (Part 2's static placeholders are gone).
`WishlistButton` reads/writes real per-user state via
`lib/wishlist/WishlistProvider.jsx`, not local `useState`.
`components/home/PersonalizedShell.jsx` (Part 1) is still gated on "sign
in" copy only — wiring it to real personalized data (using the now-real
`user` from `useAuth()`) is unclaimed scope, fair game for a later phase.

### Admin (Part 5 — implemented; see §11 for the full architecture)

`app/admin/**` now exists for all 14 route areas the phase spec asked
for (dashboard, products, categories, brands, offers, partners, deals,
content, analytics, conversions, commissions, automation, ai,
audit-logs, settings), backed by `/api/admin/**`. The RLS foundation
this was built on (§9 "Roles & RLS": `is_admin(auth.uid())`-gated write
policies on every catalog table) needed no changes — admin mutation
routes write through the normal session-aware client and those existing
policies are what actually authorizes them, `requireAdmin()` is a
friendly-error layer in front of that, not a replacement for it. Part
4's analytics endpoints (`/api/admin/analytics/partner`, `/product`)
power `/admin/analytics`'s drill-down view; Part 5 added a platform-wide
equivalent (`platform_performance()`, `platform_daily_trend()`) for the
main dashboard, since Part 4 only had per-store/per-product scope.

## 9. Backend architecture (Part 3)

Full narrative in `PHASE-3-CONTEXT.md`. Summary of what every later phase
needs to know without opening that file:

### Price authority

`products` holds **no price column**. This is a multi-merchant affiliate
catalog — `offers.price` is the sole authoritative current price, one row
per (product, store). A product's card/grid "display price" is derived
(never stored) as the cheapest currently-`available` offer, via the
`product_listing` SQL view. Any future work involving price — Part 4's
click tracking, Part 5's admin panel — reads/writes `offers`, never adds
a competing price field to `products` or anywhere else.

### Data-access layer

`lib/products/index.js` — Server Components only (reads `next/headers`
via `lib/supabase/server.js`). Client components that need catalog data
go through API routes instead (`/api/products`, `/api/facets`,
`/api/products/by-ids`) since a `"use client"` component can't `await` a
server-only module. `queryProductCatalog()` is the scalable path
(delegates to the `catalog_search()` Postgres RPC — filter + full-text
search + sort + pagination in one round trip); `getAllProducts()` is a
bounded (`limit 500`) convenience used only by the homepage's multi-rail
composition.

### Auth & user data

Supabase Auth (email/password) via `@supabase/ssr`. Three Supabase client
variants: browser (`lib/supabase/client.js`), server/session-aware
(`lib/supabase/server.js`), and service-role/admin
(`lib/supabase/admin.js`, `server-only`-guarded, not currently called
from any route). `lib/auth/AuthProvider.jsx` + `lib/auth/actions.js` are
the client-side session/action layer; `lib/wishlist/WishlistProvider.jsx`
is the equivalent for wishlist state (one fetch per session, shared by
every `WishlistButton`). Wishlist/recently-viewed/saved-searches/
price-alerts are all Row-Level-Security-enforced, own-rows-only tables —
see `PHASE-3-CONTEXT.md` §13 for the full policy list.

### Product lifecycle

`product_status`: `active` | `out_of_stock` | `archived`. No hard deletes
in normal operation. Normal catalog queries filter `status = 'active'`;
RLS itself does not filter by status (an archived product must stay
readable so a wishlist row can still show its name).

### Database schema location

`supabase/migrations/0001_init_schema.sql` (schema, RLS, triggers),
`0002_seed_dev_data.sql` (dev-only seed data), `0003_catalog_search_function.sql`
(the RPC `app/api/products/route.js` calls), `0004_affiliate_engine.sql`
(Part 4: click/conversion/commission tables + analytics functions),
`0005_affiliate_dev_seed.sql` (Part 4: dev-only tracking config),
`0006_catalog_search_offer_id.sql` (Part 4: adds `offer_id` to the
catalog RPC). Apply in that order.

## 10. Affiliate engine architecture (Part 4)

Full narrative in `PHASE-4-CONTEXT.md`. Summary every later phase needs:

### The model

`Product → Offer → Partner(Store) → Affiliate URL → ClickID → Redirect →
Merchant`, and separately, where a network reports back:
`Click → Conversion → Commission (pending → approved → paid, or → rejected)`.
**A click is never treated as a conversion; a conversion is never treated
as an approved commission** — three separate tables
(`affiliate_clicks`/`conversions`/`commissions`), never conflated.

### Redirect

`app/go/[offerId]/route.js` is the only place a merchant destination is
ever constructed. It resolves the destination exclusively from the
`offers`/`stores` rows looked up by a UUID-validated `offerId` path
segment — never from a query parameter (open-redirect protection).
Temporary redirect only (`302`), with explicit no-store cache headers on
every response, success or failure.

### Tracking config

Per-store, not global: `stores.tracking_param_name` (which query param
the ClickID goes into) and `stores.affiliate_network` (which
adapter/network it belongs to). See §9's `stores` extension.

### Click/view tracking

`affiliate_clicks` and `product_views` are raw-event tables, never
deduplicated or deleted. Bot/crawler traffic (`lib/affiliate/
bot-detection.js`, a User-Agent heuristic — an analytics signal, never a
security gate) is flagged (`is_bot`) but still recorded; human-facing
metrics filter it out, they don't discard it.

### Conversion ingestion

`app/api/webhooks/affiliate/[network]/route.js` — HMAC-SHA256 verified
(constant-time comparison, over the raw body) before any payload
parsing, replay-checked when the network signs a timestamp, and
idempotent at two layers (`webhook_events` for literal-replay, a unique
constraint on `conversions` for duplicate-transaction). Network-specific
payload shape is isolated in `lib/affiliate/network-adapters/` — the
route itself never parses a network's field names directly.

### Price comparison

`lib/products/offers.js`'s `getOffersForProduct()` is the one
implementation of "Best Price" ranking (also mirrored in SQL inside
`product_listing`'s LATERAL join and `product_performance()` — three
call sites, same three-key rule: available-first, then lowest price,
then offer id as a deterministic tie-break). None of the three ever
reads commission/conversion data — Best Price cannot be influenced by
affiliate revenue by construction, not just by policy.

### Analytics

`partner_performance()`/`product_performance()` (SQL functions,
`SECURITY DEFINER`, execute privilege restricted to `service_role` only)
compute CTR/EPC database-side, excluding bot traffic from human figures
and returning `NULL` rather than a fabricated rate on a zero denominator.
Exposed to the frontend only via the two admin-gated routes in §8's
"Admin" note above — never queried directly from client code.

### RLS posture

`affiliate_clicks`, `product_views`, `conversions`, `commissions`,
`webhook_events` all have RLS enabled with an admin-only SELECT policy
and **no INSERT/UPDATE/DELETE policy for any role** — every write goes
through the service-role client from trusted server code only, the same
posture Part 3 established for `price_history`.

## 11. Admin, automation & AI architecture (Part 5)

Full narrative in `PHASE-5-CONTEXT.md`. Summary every later phase needs:

### Admin

`app/admin/**` (own `layout.js`, auth-gated via `lib/admin/auth.js`'s
`requireAdmin()`) + `components/admin/AdminShell.jsx`. Authorization is
NOT frontend-only: every `/api/admin/**` route independently calls
`requireAdmin()`, and underneath that every table those routes touch
still has its Part 3 `is_admin(auth.uid())` RLS policy — bypassing the
frontend entirely still hits both layers. Sensitive actions (partner
tracking/credential changes, high-impact bulk product mutations)
additionally require a **step-up token** (`lib/admin/step-up.js`) —
proof the admin re-entered their password within the last 10 minutes,
independent of the normal session cookie.

### Audit log

`audit_logs` — INSERT only via the `log_admin_action()` SECURITY DEFINER
function; **UPDATE and DELETE are revoked at the Postgres privilege
level from every role, including `service_role`** (not just missing an
RLS policy, and not just an omitted admin-UI button). Every admin
mutation route calls `lib/admin/audit.js`'s `logAdminAction()` after a
successful write.

### Automation

`automation_jobs` (run ledger) + `automation_dlq` (dead-letter queue).
Two locking shapes, by job type — see `0008_automation.sql`'s header
comment and `PHASE-5-CONTEXT.md` §21-22 for the full reasoning: pure-SQL
jobs (price-drop detection, deal recalculation, price-alert matching) run
entirely inside one `pg_try_advisory_xact_lock`-protected transaction;
Node-driven jobs that call an external URL (offer refresh, embeddings
backfill) use `claim_job_run()`'s short-atomic-claim pattern instead,
since holding a transaction open across an HTTP call is exactly what the
spec warns against. Retries use bounded exponential backoff with jitter
(`lib/automation/retry.js`); exhausted/permanent failures land in the DLQ
(`lib/automation/dlq.js`), replayable from `/admin/automation`.

### Deals & Best Price integrity

`deals` is a pure **label** table (`featured` / `todays_deal` / etc.) —
it has no price column at all, which is what makes it structurally
impossible for a promoted deal to misrepresent Best Price. Best Price
itself is unchanged from Part 4: `product_listing`'s LATERAL join,
`getOffersForProduct()`, and the new `product_performance()`-style
functions never read commission/conversion data.

### Search: FTS + pgvector hybrid

Part 3's `tsvector`/GIN full-text search is untouched and remains the
deterministic fallback. `product_embeddings` (pgvector, HNSW index) +
`hybrid_search()` (RRF fusion of FTS rank and vector rank, filters
applied before fusion) are an ADDITIVE ranking layer — `lib/search/
hybrid.js` calls it and falls back to plain `catalog_search()` on any
error, so semantic infrastructure is never a single point of failure for
basic product discovery.

### AI

`lib/ai/schema.js` (Zod, `.strict()` — rejects unknown fields) is the
only gate between AI provider output and query-building code
(`lib/ai/search-pipeline.js`). AI never generates SQL and never invents
commerce facts — it only produces a structured intent object, which is
converted into the exact same filter parameters the deterministic catalog
already understands, then a fresh database query runs. `lib/ai/
cache.js`'s `ai_intent_cache` caches ONLY that structured intent (no
price/availability column exists on the table at all) — cache key is
versioned by schema+provider, bounded TTL. `AI_PROVIDER=local` (default)
is a real, always-available rule-based extractor requiring no external
key; `lib/ai/providers/openai.js` is a documented, inactive-by-default
seam for a real model. Every failure point (provider error, malformed
JSON, failed validation, hybrid search unavailable) has a defined
fallback that still returns real products — see `PHASE-5-CONTEXT.md`
§37/§50 for the full failure-mode table.

## 12. Key architectural decisions

- **JavaScript, not TypeScript.** Kept Part 1 dependency-light; revisit if
  a later phase's data layer (Supabase types) makes TS worth the
  migration cost. If migrating, do it as its own PR before adding new
  features, not incrementally alongside new feature work.
- **App Router over Pages Router** — standard for new Next.js projects,
  required for the layout/server-component patterns later phases
  (Supabase server components, streaming product data) will want.
  Never mix in a `pages/` directory.
  - **No component library** (no shadcn/MUI/etc.) — the design system is
  small enough that Tailwind + the `components/ui/` primitives cover it.
  Don't introduce one without updating this document.
- **Self-hosted fonts** over `next/font/google` — see §1. If a later phase
  adds more font weights/styles, add the corresponding `@fontsource`
  import in `app/layout.js` rather than switching loaders.
- **All homepage sections are shells, not real product logic** *(Part 1
  scope boundary — resolved in Part 2: sections now render real, if
  mocked, product data; see `PHASE-2-CONTEXT.md`)*.
- **One `CatalogView` for every listing route**, not six near-duplicate
  pages — `/products`, `/men`, `/women`, `/kids`, `/categories/[slug]`,
  `/search`, `/deals` are thin `page.js` wrappers around it. See
  `PHASE-2-CONTEXT.md` §25 for why `/categories/[slug]` is cross-department
  rather than nested under `/men/categories/[slug]` etc.
- **URL as the canonical filter/sort/search state**, not component state
  or a state-management library — see the new "URL query-state
  architecture" subsection under §5.
- **Mock data retired behind the same function-call seam it was built
  behind** (`lib/products/index.js`) — Part 2 never let components import
  `mock-data.js` directly, so Part 3's Supabase migration was a
  data-layer change (every function body became `async`), not a UI
  rewrite. The mock file itself is unused but not deleted — see
  `PHASE-3-CONTEXT.md` §26.
- **Real async fetch replaces the Part 2 simulated-loading window** — the
  ~180ms `undefined`-products delay in `CatalogView` was a stand-in for
  the fetch Part 3 introduces; `CatalogView` now genuinely awaits
  `/api/products` and the same `undefined`-means-loading contract carries
  the real latency instead of a fake one.
- **Price authority lives in `offers.price`, not on `products`** — see
  §9 "Price authority" for the full reasoning. Any future feature that
  touches pricing must extend `offers`, not add a second price field
  elsewhere.
- **Best Price is structurally commission-blind** — `getOffersForProduct()`
  and the SQL equivalents in §10 never join against `conversions`/
  `commissions` at all, so "rank offers by commission" isn't a
  configuration mistake away from happening; the data needed to do it
  simply isn't in scope of those queries.
- **Redirect and webhook writes always use the service-role client** — no
  affiliate table in §10 has an INSERT/UPDATE policy for any
  session-based role, matching Part 3's `price_history` precedent. A
  future feature must not "fix" this by adding a user-writable policy;
  add a new server-only route instead.
- **One network adapter (`generic`) rather than pre-building several** —
  §22 of the Part 4 spec explicitly allows this scope cut; adding a real
  network later is a new file in `lib/affiliate/network-adapters/` plus
  one registry line, not a route-handler change.
- **Audit-log immutability is a database privilege, not an RLS policy or
  a missing UI button** — `audit_logs` has UPDATE/DELETE revoked from
  every role at the Postgres grant level (§11). A future feature must
  never re-grant those privileges to "make admin editing easier" — if a
  legal/retention deletion is ever required, it goes through a
  separately-controlled privileged process, per the phase spec, not
  through this table's normal access path.
- **AI never touches query-building code with unvalidated output** — the
  Zod schema in `lib/ai/schema.js` is `.strict()` specifically so an
  unexpected field (a prompt-injection attempt, a provider bug) is a hard
  validation failure, not a silently-ignored extra key. A future AI
  feature must extend that schema deliberately, not bypass it.

## 13. Production hardening architecture (Part 6)

Part 6 did not change the shape of the system described in §1–§12 — no
route was restructured, no table was redesigned, no working feature was
rewritten. It added a hardening layer on top: SEO, HTTP security
headers, request correlation, rate limiting, health checks, error
boundaries, and documentation of what was already true but unverified.
Full reasoning for every decision below lives in `PHASE-6-CONTEXT.md`;
this section is the durable architectural summary.

### 13.1 SEO layer

- `lib/seo/site.js` — single `SITE_URL`/`absoluteUrl()` source of truth
  (`NEXT_PUBLIC_SITE_URL`), used by every canonical URL, the sitemap, and
  `robots.txt`'s `Sitemap:` line.
- `app/robots.js`, `app/sitemap.js` — Next.js metadata-route conventions,
  not static files. The sitemap reads live database state
  (`getAllProducts()`, `getAllSubcategorySlugs()`) — a new/archived
  product changes the sitemap on the next request, no deploy needed.
- `lib/seo/schema.js` — JSON-LD builders (`organizationSchema`,
  `websiteSchema`, `productSchema`, `breadcrumbSchema`), strictly
  grounded in real product/offer fields — never a fabricated rating,
  availability, or spec. `Offer.seller` is always the real partner
  store, never CLOXTRO itself (CLOXTRO is not the merchant of record).
- Canonical/Open Graph/Twitter Card metadata added to every public page.
  Filtered/sorted catalog URLs (`?price_max=...&sort=...`) are
  deliberately NOT canonicalized to their bare listing page — those
  represent real, shareable views the Part 2 URL-state system exists to
  preserve. `/search` is `noindex` instead, since arbitrary search
  queries are the actual low-value-URL surface.
- Private routes (`/admin`, `/account`, `/wishlist`, `/login`,
  `/signup`) carry `robots: { index: false }`. Four of them
  (`account`/`wishlist`/`login`/`signup`) are Client Components, so a
  thin server `layout.js` per route carries the metadata export
  instead — a pattern any future private Client Component page should
  reuse rather than converting itself to a Server Component just to
  attach metadata.

### 13.2 HTTP security headers

`next.config.js`'s `headers()` applies one security-header set —
Content-Security-Policy, X-Frame-Options, X-Content-Type-Options,
Referrer-Policy, Permissions-Policy, and (production-only)
Strict-Transport-Security — to every route, including `/go/*` and
`/api/webhooks/*` (which skip `middleware.js` entirely for latency, but
have no reason to skip static headers). The CSP is built from a
function (`buildCsp()`) that reads the actual Supabase project origin at
build/start time and lists only the domains this codebase genuinely
talks to from the browser — verified by grep, not assumed. A future
feature that adds a new external browser-facing dependency (a new image
CDN, an embedded widget, a different auth provider) MUST update
`buildCsp()`'s directives; it will otherwise be silently blocked by CSP
in production and appear to "not work" for reasons invisible in local
dev if `NODE_ENV` differences mask it.

### 13.3 Request correlation (`x-request-id`)

`lib/observability/request-id.js` resolves/validates/generates a
correlation id; `middleware.js` does this once per request for
everything its matcher covers, forwarding it via both a request header
(for downstream Server Components/Route Handlers to read) and a
response header. `/go/[offerId]`, the webhook route, and the cron route
— all excluded from that matcher — each resolve their own id directly.
The id is opaque, never authentication, and is stored (as
`metadata.requestId`, a jsonb field) on `affiliate_clicks` and
`webhook_events` rows for tracing, alongside — never instead of —
`audit_logs`' actor/action/entity/timestamp fields. A future feature
adding a new route that records something traceable (a new webhook
network, a new admin bulk action) should read the id the same way:
`request.headers.get("x-request-id")` if reached through middleware, or
`resolveRequestId(request.headers)` directly if the route is excluded
from the matcher like `/go` and the webhook route are.

### 13.4 Rate limiting

`lib/security/rate-limit.js` — an in-memory, per-server-process token
bucket, applied to the two AI routes (`/api/ai/search`, `/api/ai/
recommendations`) that can trigger a real per-call provider cost.
Explicitly NOT a distributed rate limit under serverless scale-out —
see PHASE-6-CONTEXT.md §13 for the full reasoning and the documented
upgrade path (Upstash Redis, swap-compatible with the same
`checkRateLimit(key, opts)` call shape). A future feature that adds
another cost-bearing or abuse-prone endpoint should call
`rateLimitOr429()` the same way rather than reinventing a limiter.

### 13.5 Observability

`lib/observability/logger.js` — structured JSON logging
(`logError`/`logWarn`/`logInfo`) to stdout/stderr, isomorphic (works in
both Client Components like `app/error.js` and server code). No
third-party error-tracking provider is wired up — swapping one in later
is confined to that file's single `emit()` function. `/api/health`
(liveness, zero dependencies) and `/api/health/ready` (readiness, checks
Supabase reachability) exist for platform health-check integration.

### 13.6 Database connection architecture — clarified, not changed

This project's Supabase clients (`lib/supabase/{server,client,admin}.js`)
talk to Supabase over HTTP (PostgREST/GoTrue), not a raw `pg` driver —
there is no connection pool to configure in application code, and the
classic serverless-connection-exhaustion failure mode does not apply to
this app's request-serving code path. A future feature must NOT add a
raw `pg`/`postgres` driver dependency to bypass PostgREST for
"performance" without re-introducing exactly that exhaustion risk this
architecture currently avoids structurally — if a bulk/raw-SQL operation
is ever genuinely needed, it should go through a Supabase RPC function
(the pattern already used for `claim_job_run()`/`finish_job_run()` in
Part 5's automation system), not a direct driver connection from
request-serving code.

### 13.7 Error boundaries

`app/error.js` (route-segment), `app/global-error.js` (root-layout-level,
renders its own minimal document since it may be catching a failure IN
the shared layout), and `app/not-found.js` (styled, noindexed 404). None
render error internals (stack traces, messages) to the visitor — those
go to `logError()` only.

### 13.8 What Part 6 deliberately did not touch

- No route was restructured, no table redesigned, no RLS policy
  changed, no admin flow rewritten — all verified correct as-is.
- `next/image` migration was not performed (raw `<img>` tags remain,
  already CLS-safe per Part 1/2's aspect-ratio-box pattern) — flagged as
  a real, worthwhile follow-up outside this hardening phase's scope.
- No fetch-timeout wrapper was added around Supabase calls — a
  genuinely slow/unreachable Supabase backend can currently hang a
  request rather than fail fast. Flagged as the top item for a future
  hardening increment (see PHASE-6-CONTEXT.md §31 for why it wasn't
  done here: it touches roughly a dozen exported functions across
  `lib/products/index.js` and the admin/automation equivalents, larger
  than this phase's minimum-safe-change mandate supports for a risk
  that's currently theoretical against a healthy backend).

## 14. Deployment status

This codebase has been verified to build cleanly (`next build`, zero
errors) and to serve correct HTTP responses (`next start` + real `curl`
requests against headers, robots.txt, and health endpoints) in this
development/verification environment, using placeholder Supabase
credentials. **It has not been deployed to any live production
environment**, and no DNS, domain, real Supabase project, monitoring
service, or affiliate network credentials have been configured as part
of this work. See `PHASE-6-CONTEXT.md` §32 for the exact external setup
steps required before a real deployment.

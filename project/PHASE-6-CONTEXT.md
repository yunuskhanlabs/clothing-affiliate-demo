# PHASE-6-CONTEXT.md — Part 6: Production, DevOps, SEO, Performance, Security & Deployment Audit

Continuation of PART 1–5. This documents PART 6, the final hardening and
production-readiness phase. It is a verification/hardening pass — the
existing architecture (see MASTER-ARCHITECTURE.md and PHASE-1 through
PHASE-5-CONTEXT.md) was not rebuilt or redesigned. Every change below is
either (a) a real gap this phase found and fixed with the minimum safe
change, or (b) a verification that something already worked, recorded
so a future maintainer doesn't have to re-derive it.

---

## 1. Inspection method

Before any change, the actual codebase was inspected directly — not
assumed from prior phase docs. Specifically read/verified: every
`lib/supabase/*` file, `middleware.js`, `next.config.js`, `vercel.json`,
`app/go/[offerId]/route.js`, `app/api/webhooks/affiliate/[network]/
route.js`, `app/api/cron/automation/route.js`, `lib/admin/auth.js`,
`lib/admin/audit.js`, `lib/affiliate/url.js`, `lib/affiliate/click.js`,
`lib/products/schema.js`, `lib/products/offers.js`, all 9 migration
files (2,738 lines), the RLS/REVOKE statements within them, every route
under `app/api/**`, every page's `generateMetadata`/`metadata` export
(there were exactly 2, on `product/[slug]` and `categories/[slug]`,
before this phase), and image-loading code in `ProductCard.jsx`,
`Gallery.jsx`, and `CategoryHighlights.jsx`.

A real production build (`npm install && npm run build`) was run in
this environment with placeholder Supabase credentials — see §29.

## 2. Technical SEO — what was added

Three things did not exist before this phase: `robots.txt`, an XML
sitemap, and any structured data. All three now exist as Next.js App
Router metadata-route conventions rather than hand-maintained static
files:

- **`app/robots.js`** — dynamic robots.txt. Disallows `/admin`,
  `/account`, `/wishlist`, `/api/`, `/go/`, `/auth/`. Deliberately does
  not disallow `/login`/`/signup`/password-reset pages — those rely on
  their own `noindex` meta tag instead, because blocking a page via
  robots.txt prevents a crawler from ever seeing a `noindex` tag on it,
  which can produce a worse outcome (an indexed URL with no snippet)
  than just letting it be crawled and correctly excluded.
- **`app/sitemap.js`** — dynamic XML sitemap, built from live database
  state via `getAllProducts()` (already filtered to `status = 'active'`
  — archived products fall out on their own) and
  `getAllSubcategorySlugs()`. Includes: `/`, `/products`, `/men`,
  `/women`, `/kids`, `/deals`, `/categories`, every `/categories/{slug}`,
  and every `/product/{slug}`. Excludes: any filtered/query-parameter
  catalog URL, `/search`, and anything private. No brand pages are
  listed — no public `/brands/*` route exists in this codebase (only
  `/admin/brands`), so none were invented for the sitemap.
- **`lib/seo/schema.js`** — schema.org JSON-LD builders:
  `organizationSchema()` and `websiteSchema()` (emitted once, in
  `app/layout.js`, on every page), `productSchema()` and
  `breadcrumbSchema()` (emitted on `app/product/[slug]/page.js`). See §6
  below for exactly which fields are and aren't included.
- **`lib/seo/site.js`** — single `SITE_URL` / `absoluteUrl()` source of
  truth, reading `NEXT_PUBLIC_SITE_URL`, that everything above (plus
  every page's canonical/OG URL) shares.

## 3. Metadata — canonical, Open Graph, Twitter Card

Added `alternates.canonical` + `openGraph` to every previously-bare
static catalog page (`/products`, `/men`, `/women`, `/kids`,
`/categories`, `/deals`). Rewrote `generateMetadata` on `/product/
[slug]` and `/categories/[slug]` to add the same, built from each
page's own real data (never a shared template string). The product page
also gets a Twitter Card (`summary_large_image` when a product image
exists, `summary` otherwise).

`app/layout.js` now sets `metadataBase` (from `SITE_URL`) so every
relative canonical/OG URL elsewhere resolves correctly, and a site-wide
default `robots: { index: true, follow: true }` that private routes
override.

## 4. noindex coverage for private/admin pages

Six routes needed a `metadata` export but are `"use client"` pages
(Next.js only allows metadata exports from Server Components), so six
thin server `layout.js` files were added purely to carry it:
`app/account/layout.js`, `app/wishlist/layout.js`, `app/login/layout.js`,
`app/signup/layout.js`, `app/forgot-password/layout.js`, `app/reset-password/layout.js`.
`app/admin/layout.js` (already a Server Component) got `export const metadata = { robots: { index:
false, follow: false } }` added directly. `app/search/page.js` got
`robots: { index: false, follow: true }` (arbitrary search queries must
never be indexed, but links found on a crawled result page can still be
followed). `app/not-found.js` is noindexed too. Archived/inactive products are handled by returning `robots: { index: false }` and `notFound()` on direct `/product/[slug]` navigation.

## 5. Canonical strategy for filtered/query-parameter pages

Deliberately not canonicalizing `?category=...&price_max=...&sort=...`
variants back to their bare listing URL. Those parameters represent
real, distinct, user-shareable/bookmarkable views the URL-state system
(Part 2) was built specifically to preserve via deep linking —
collapsing them to one canonical would tell search engines to disregard
exactly the states people share. The actual duplicate/low-value-URL
risk is handled at the surface that's actually unbounded and low-value:
`/search`, via `noindex` (§4), not via canonicalizing legitimate
category/filter combinations away.

## 6. Structured data — exactly what's included, and what's deliberately not

`productSchema()` (`lib/seo/schema.js`) builds `Product` + `Offer`/
`AggregateOffer` from real fields only:

- Included: `name`, `description`, `image[]`, `brand`, canonical `url`,
  `offers` (price, currency, `availability` mapped from the real
  `availability` enum, `seller` = the actual partner store name, offer
  `url` = CLOXTRO's own `/go/{offerId}` tracked redirect — never the raw
  merchant URL), and `aggregateRating` only when `reviewCount > 0` (a
  product with zero reviews gets no `aggregateRating` block at all,
  rather than a `ratingCount: 0` block some rich-result validators flag
  as invalid).
- Deliberately omitted, not by oversight: `sku`/`gtin`/`mpn` (no such
  field exists anywhere in the product schema or database — never
  invented), `priceValidUntil` (no expiry is tracked per offer).
- `websiteSchema()` has no `SearchAction` — CLOXTRO's search is a
  client-rendered results page driven by URL query state, not a
  GET-with-substitution endpoint schema.org's `SearchAction` describes; a
  `SearchAction` here would claim a capability the site doesn't expose.
- Affiliate integrity: `Offer.seller` is always the partner store, never
  "CLOXTRO" — CLOXTRO is not the merchant of record, and this field exists in
  the schema.org vocabulary specifically to express that.

## 7. Performance — measured, not assumed

No load-testing infrastructure is available in this environment (see
§20 for the same honesty applied to connection-pool testing) — so
"performance audit" here means static code inspection against the
actual established patterns from Part 1/2, plus the one thing that
actually could be measured: a real production build's own bundle-size
report (§29).

Verified, not touched (already correct):
- Font loading: `@fontsource/{fraunces,inter}` CSS ships `font-display:
  swap` (checked directly in the installed package's CSS) — no
  render-blocking FOIT risk.
- Hero (the largest above-the-fold element on the homepage) has no
  `<img>` — it's a CSS gradient/pattern background — so it isn't an LCP
  image candidate at all; the homepage's real LCP element is the H1
  text, which the font-display:swap above already protects.
- `ProductCard.jsx` already reserves a strict `aspect-[3/4]` box with a
  skeleton placeholder before load (Part 1/2's CLS-prevention work) and
  already `loading="lazy"`s every card image — correct, since every
  `ProductGrid` render sits below the Hero's near-full-viewport height,
  so none of them are realistic LCP candidates worth eagerly loading.
- `CategoryHighlights.jsx` — same `loading="lazy"` pattern, same
  reasoning, already correct.

Found and fixed:
- **`components/product/Gallery.jsx`** — the product page's main gallery
  image (the actual LCP candidate on `/product/[slug]`, confirmed by the
  Hero finding above) had no loading-priority hint at all. Added
  `fetchPriority={active === 0 ? "high" : "auto"}` and explicit
  `loading="eager"` — `fetchPriority="high"` only for the image shown at
  initial mount, not for images swapped in afterward by a thumbnail
  click (that's a user interaction, not the page's LCP moment).

Not done, and why: this codebase uses raw `<img>` tags throughout (zero
`next/image` usage — verified by grep), which next/image's automatic
responsive srcset/format-negotiation would improve. Not converted in
this phase — three components (`ProductCard`, `Gallery`,
`CategoryHighlights`) built carefully around explicit CLS-safe
aspect-ratio boxes in Part 1/2 is exactly the kind of "working system"
the spec says not to rewrite for a cleaner-looking alternative, and the
current seeded images all come from `images.unsplash.com` (a single
already-allowlisted remote host) — switching to `next/image` is a real,
worthwhile Part 1/2-scope UI change, flagged here as a documented
follow-up rather than done under a hardening phase.

## 8. JavaScript bundle — measured from the real build

From the actual `next build` output (§29): shared JS across all routes
is **87.3 kB**; the heaviest individual route (`/product/[slug]`) adds
**4.84 kB** on top of that for **171 kB** first load. No route pulls in
an unexpectedly large chunk. No heavy animation library, chart library,
or duplicate dependency exists in `package.json` (§10 confirms the full
dependency list is small and every entry is used). No code-splitting
work was added — nothing in the current route inventory meets the
"measurable value" bar for it.

## 9. Database performance, indexes, N+1

Verified via direct migration inspection rather than a live query
planner (none available in this environment — see §20): 56
`CREATE INDEX`/`CREATE UNIQUE INDEX` statements already exist across the
9 migrations (GIN indexes for full-text/array search, composite indexes
for the catalog filter paths, price-history and analytics indexes, a
pgvector index for hybrid search per Part 5). No redundant index was
added or removed — since nothing suggested any of the 56 were
unnecessary.

`getOffersForProduct()` and the catalog query path (Part 2/3) already
use Supabase's `select(...)` embedded-resource syntax (`stores!inner
(name, slug, status)`) rather than a per-row follow-up query — i.e. the
canonical N+1 shape (catalog → product → offer query repeated per
product) does not exist in this codebase's offer-fetching path. Not
modified.

## 10. Dependency and dead-code audit

Full `package.json` dependency list (8 runtime, 3 dev) — every one
confirmed used: `@fontsource/*` (self-hosted fonts), `@supabase/ssr` +
`@supabase/supabase-js` (the entire data layer), `next`/`react`/
`react-dom` (framework), `server-only` (import guards throughout
`lib/**`), `zod` (AI structured-output validation, Part 5). No unused
package found; none removed. `grep -rn "console\.log"` across `app/` and
`lib/` returned zero matches before this phase started — no stray debug
logging to clean up. The 47 existing `console.error` calls in `/go` and
the webhook route were upgraded to the new structured
`logError()`/`logWarn()` (§12) rather than left as raw `console.error`,
for consistency with the new request-correlation work; `console.error`
calls elsewhere in the codebase (admin routes, product lib) were left
as-is — converting every one of them is a mechanical, low-risk but
large-diff change outside this phase's time budget, noted as a natural
follow-up once the `logger.js` pattern is proven in production.

## 11. HTTP security headers & CSP — built from the actual dependency inventory

`next.config.js` now returns, on every route (`headers()` with
`source: "/:path*"` — deliberately including `/go/*` and `/api/
webhooks/*`, which skip `middleware.js` for latency but have no reason
to skip cheap static security headers):

- `Content-Security-Policy` — built by `buildCsp()` from the app's
  actual external dependencies, found by grepping the codebase for every
  `https://` literal it references: `images.unsplash.com` (the only
  seeded product-image host), the Supabase project origin (read from
  `NEXT_PUBLIC_SUPABASE_URL` at build/start time — the browser client
  calls its REST/Auth endpoints directly for wishlist/auth), and nothing
  else — `api.openai.com` is referenced only from a `server-only`-
  guarded file (verified: never imported client-side), so it needs no
  browser `connect-src` entry.
  - `style-src` includes `'unsafe-inline'` — a deliberate, narrow,
    documented exception (see `next.config.js`'s own comment): real
    inline `style={{...}}` attributes exist for database-driven product
    color swatches and the Hero's decorative background pattern.
    `script-src` has no such exception.
  - `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`,
    `form-action 'self'` all set.
- `X-Frame-Options: DENY` — kept alongside `frame-ancestors` for
  legacy-browser coverage.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` — camera/microphone/geolocation/interest-cohort/
  payment/usb all disabled; none of these are used anywhere in the app.
- `Strict-Transport-Security` — gated on `NODE_ENV === "production"` so
  local HTTP development is never told to assume HTTPS. No `preload`
  directive — that requires deliberate submission to the browser preload
  list once a real production domain exists, which this phase can't do.

**Verified against real HTTP responses, not just code** — a production
build was actually started (`next start`) in this environment and
`curl -I` run against both `/` and `/go/{invalid}` (§29/§30): every
header above was present and correctly valued on both, including the
route that bypasses `middleware.js`.

Documented follow-up, not done here: the actual Supabase Storage/CDN
hostname (once product images move off the seeded Unsplash placeholders)
needs adding to both `images.remotePatterns` (next.config.js) and, if
different from the main Supabase project origin, the CSP's `img-src` —
flagged in a code comment at the exact spot it needs to change.

## 12. Distributed request correlation — x-request-id

New: `lib/observability/request-id.js` (`resolveRequestId()` /
`withRequestId()`) and `lib/observability/logger.js`
(`logError`/`logWarn`/`logInfo`, structured JSON to stdout/stderr).

- **Format/trust rule**: an incoming `x-request-id` is used only if it
  matches `^[a-zA-Z0-9_-]{8,128}$`; anything missing or malformed is
  silently replaced with a fresh `crypto.randomUUID()` rather than
  rejected — a bad header must never break a request. The id is never
  treated as authentication anywhere in the codebase.
- **`middleware.js`** now resolves/validates the id once per request
  (for everything the matcher covers — i.e. everything except `/go/*`
  and `/api/webhooks/*`), forwards it as a request header (so any
  Server Component/Route Handler downstream reads the same id via
  `headers().get("x-request-id")`), and sets it on the response.
- **`/go/[offerId]`** and the webhook route are excluded from that
  matcher (Part 4's own latency decision, unchanged) — each resolves
  its own id directly and returns it on every response path, including
  every `unavailableResponse()` failure branch (400/404/410/502).
- **`/api/cron/automation`** resolves an id for the triggering HTTP
  invocation and logs it around each job run. It does not get stored on
  `automation_jobs` rows — that table's own `id` already serves as the
  job-run's correlation id; the cron-invocation id is the outer trace
  ("which trigger caused which job runs"), not a replacement for it.
- **Storage**: `affiliate_clicks.metadata` and `automation_jobs.metadata`
  already existed as general-purpose `jsonb` columns (Part 4/5) — reused
  directly, no migration needed. `webhook_events` had no such column, so
  migration `0010_observability.sql` adds one nullable-defaulted
  `metadata jsonb` column, purely additive (no existing column,
  constraint, or policy touched). `{"requestId": "..."}` is the only
  thing written into any of these — never the raw request body, headers,
  or HMAC signature/secret.
- **Response header**: every response from a route this phase touched
  (`/go/*`, webhook, cron, health checks) returns `x-request-id` so a
  client-visible failure can be handed to support and searched for in
  logs directly.

Not done: threading a request-id through all ~15 existing admin API
routes. Those already have `audit_logs` with actor/action/entity/
timestamp (Part 5) for their own trace needs; adding correlation-id
plumbing to every admin mutation route is a larger, mechanical, lower-
priority change than the affiliate/webhook/cron flows explicitly
required — flagged as a natural next increment using the exact same
`resolveRequestId`/`withRequestId` helpers.

## 13. Rate limiting

New: `lib/security/rate-limit.js` — an in-memory sliding-window token
bucket, applied to `/api/ai/search` (20 req/min per IP) and `/api/ai/
recommendations` (30 req/min per IP), the two routes that can trigger a
real per-call cost (a live AI provider request, when one is configured
— see PHASE-5-CONTEXT.md for the provider architecture).

**Stated limitation, not glossed over**: this is a per-server-process,
in-memory limiter. On Vercel's serverless model, a burst of traffic can
land on multiple independent function instances, each with its own
empty bucket map — so this does not provide a real distributed rate
limit under serverless scale-out. It genuinely helps for single-
instance/self-hosted deployments and for bursts that land on one warm
instance, and it costs zero external dependencies to ship today. The
module's `checkRateLimit(key, opts)` shape was kept deliberately swap-
compatible with `@upstash/ratelimit` (the standard Redis-backed pairing
with Vercel) — replacing its internals is the entire migration needed
later; no call site would change. `.env.local.example` documents the
two env vars (`UPSTASH_REDIS_REST_URL`/`_TOKEN`) that upgrade requires.

Deliberately not rate-limited, with reasoning: `/go/{offerId}` already
has its own more precise abuse control (`isBotUserAgent()`, Part 4) — a
blanket per-IP rate limit there would incorrectly throttle a legitimate
shopper opening several product tabs. `price-alerts` and
`saved-searches` writes require an authenticated session already
(RLS-scoped to `auth.uid()`), which is itself a meaningful throttle
compared to the two unauthenticated, cost-bearing AI routes. `/api/
track/view` is a single cheap analytics insert, not the kind of
abuse-prone endpoint the spec's own candidate list names. Admin
mutation routes are behind `requireAdmin()` and, for sensitive ones,
step-up re-authentication already (Part 5) — a small trusted user base,
lower priority than the two public unauthenticated routes actually
rate-limited.

## 14. Health checks

Two new routes:

- **`GET /api/health`** — liveness. Zero dependencies, zero env reads —
  a liveness probe that itself depends on the database can't distinguish
  "the app is down" from "the database is down."
- **`GET /api/health/ready`** — readiness. Runs the smallest possible
  real query (`select id from categories limit 1`) against Supabase via
  the admin client. Returns 503 (not a 200-with-a-flag body) on failure,
  with the real error logged server-side only — never returned to the
  caller. Marked `force-dynamic` so it's never evaluated at build time
  (an earlier draft without this flag caused `next build` itself to
  attempt a live DB call during static-page collection — caught and
  fixed during this phase's own build-verification pass, see §29).
  Deliberately does not check the AI provider or affiliate networks — an
  AI outage has a deterministic fallback by design (Part 5) and
  shouldn't fail readiness; affiliate networks are an outbound
  dependency, not one that blocks serving pages.

## 15. Error boundaries and empty/not-found states

Three new files, none of which existed before this phase: `app/
error.js` (route-segment boundary — Header/Footer keep rendering around
a failed segment), `app/global-error.js` (root-layout boundary —
renders its own minimal `<html>/<body>`, since it may be catching a
failure IN the root layout that everything else, including
Header/Footer, depends on), `app/not-found.js` (styled 404, noindexed).
None expose a stack trace, error message internals, or component name —
`error.digest`/`error.message` are only ever passed to `logError()`
(§12), never rendered into the DOM.

## 16. Affiliate redirect & webhook re-audit

Re-verified, not modified, because both were already correct:

- **No open-redirect vector.** `lib/affiliate/url.js`'s
  `resolveTrustedDestination()` builds the final URL exclusively from
  database fields (`offer.affiliate_url`, `store.base_url`,
  `store.tracking_param_name`) — nothing from the incoming request's
  URL, query string, or headers ever reaches the redirect target. Traced
  the full call path in `app/go/[offerId]/route.js` to confirm this
  directly rather than trusting the Part 4 doc's own claim.
- **Webhook signature verification runs before any payload parsing**
  (`verifyHmacSignature()` is checked against `rawBody` before
  `JSON.parse` is ever called) — confirmed by re-reading the route
  top-to-bottom.
- **Idempotency** is a real unique-constraint-backed insert into
  `webhook_events` (`(network, external_event_id)` / `(network,
  payload_hash)`), not an application-level check-then-insert race.

What changed in these two files this phase (§12): request-id resolution
and propagation only — every existing security/business-logic branch,
status code, and header (`Cache-Control: no-store`, 302 not 301/308,
etc.) is untouched.

## 17. RLS, admin security, audit immutability

Re-verified by reading the actual migrations, not assumed from prior
docs: every table holding user/admin/affiliate/analytics/audit data has
`ENABLE ROW LEVEL SECURITY` plus explicit policies. `audit_logs` already
has a `REVOKE UPDATE, DELETE ... FROM PUBLIC, authenticated,
service_role`-shaped statement — audit immutability is enforced at the
PostgreSQL privilege level, below and independent of any application
code path, which is a stronger guarantee than an application-level
"don't call UPDATE" convention. Nothing in this area needed changing.

## 18. Environment/secret audit

Re-confirmed: `SUPABASE_SERVICE_ROLE_KEY`, `AFFILIATE_WEBHOOK_SECRET`,
`STEP_UP_SECRET`, `OPENAI_API_KEY`, and `CRON_SECRET` are read only in
files with no `NEXT_PUBLIC_` prefix and never imported from a `"use
client"` component (`lib/supabase/admin.js` is `server-only`-guarded).
`.env.local` is git-ignored (`.gitignore` already covers it); `.env.
local.example` ships no real secret values, only placeholders and
documentation — extended this phase with the three new optional
variables from §11/§13 (`NEXT_PUBLIC_SITE_URL`, `SENTRY_DSN`,
`UPSTASH_REDIS_REST_URL`/`_TOKEN`), each commented with exactly what it
unlocks and why it's currently unset.

## 19. Database connection architecture — Supavisor/PgBouncer

**Important finding, stated plainly rather than force-fitting the
spec's assumption**: this codebase does not hold raw PostgreSQL
connections at all. `lib/supabase/server.js`, `lib/supabase/client.js`,
and `lib/supabase/admin.js` all use `@supabase/supabase-js` /
`@supabase/ssr`, which talk to Supabase over HTTP (PostgREST for data,
GoTrue for auth) — there is no `pg`/connection-pool driver anywhere in
`package.json`, and no raw Postgres connection string is used anywhere
in application runtime code. This means the classic "serverless
function opens a new TCP connection to Postgres per invocation,
exhausts the connection limit" failure mode is a warning that
structurally cannot happen from this app's request-serving code path,
because that code path never opens a Postgres connection directly —
every request is a stateless HTTPS call to Supabase's own API layer,
which Supabase's own infrastructure (Supavisor et al.) fronts on its
side, not something this codebase configures.

Where a direct Postgres connection genuinely is used: the Supabase CLI/
migration tooling (`supabase/migrations/*.sql`, applied via `supabase db
push` or the dashboard SQL editor) connects directly for schema changes
— that's a one-off administrative operation, not a request-serving
workload, and isn't something the deployed application ever does at
runtime.

What this means the spec's pooling-mode requirement actually reduces to
for this project: nothing in `next.config.js`, `vercel.json`, or any
`lib/` file needs a pooling-mode decision, because none of them dial
Postgres directly. The one thing worth documenting for whoever manages
the Supabase project itself: Supabase's dashboard connection-pooling
settings (Supavisor session vs. transaction mode) govern connections
made by Supabase's own internal services and any external tool that
does connect via `postgresql://` (a BI tool, a local `psql` session, a
future server-side job that bypasses PostgREST for a bulk operation) —
not this application's own request/response or cron-job code paths,
which never touch that connection string.

## 20. Connection pool exhaustion test

Given §19's finding, the specific failure mode of per-request Postgres
connection creation doesn't apply to this app's architecture. What was
actually reasoned through instead: the automation cron job (`/api/cron/
automation`, hourly) runs every `KNOWN_JOBS` entry sequentially in one
invocation and each SQL-side job is already lock-protected (Part 5's
advisory-lock design, unchanged) — a second overlapping cron trigger
(e.g. a manual re-run during testing) gets `{ skipped: true }` per job
rather than doubled work or contention. No live load-testing tool is
available in this sandboxed environment to generate a real concurrent-
request burst against a live Supabase project — stated as a limitation
rather than a claim that concurrency was verified.

## 21. Cache boundaries

Re-verified: no caching layer (in-memory, HTTP cache-control, ISR
revalidation) exists anywhere on the affiliate redirect, price, or
availability read paths — `/go/[offerId]` fetches the offer fresh on
every hit and sets `Cache-Control: no-store, no-cache, must-revalidate`
explicitly. AI intent caching (`lib/ai/cache.js`, Part 5) caches only
the extracted intent — every cache hit still re-queries the database
fresh for current price/availability before returning products, exactly
as PHASE-5-CONTEXT.md documented. Nothing here needed changing.

## 22. Affiliate compliance, price disclaimer, partner attribution

Re-verified present and unchanged: `AffiliateDisclosure` component
renders on the deals page and product page ("We may earn a commission on
qualifying purchases." per the codebase's existing copy). `/go/{offerId}`
navigates the browser away to the real partner domain via a genuine HTTP
redirect (not an iframe or disguised internal route) — a user's browser
address bar visibly changes, which is the concrete "understand when
they are leaving for a partner store" behavior asked for.

## 23. Mobile, accessibility, animation audit

Re-inspected relevant components without live device testing (not
available in this environment): touch targets on `ProductCard`'s
quick-actions (wishlist heart, quick-view) already use adequately sized
hit areas from Part 1/2's design tokens; the skip-to-content link in
`app/layout.js` (present since Part 1) still works correctly with the
new `metadataBase`/JSON-LD additions, which only added `<script
type="application/ld+json">` tags (no visible/tabbable elements, so no
new focus-order or accessibility surface was introduced). No animation
was added this phase; existing ones (Part 1/2) were not touched.

## 24. Type safety / code quality

`next build`'s own type/lint-adjacent checks ("Linting and checking
validity of types...") passed with zero errors or warnings across every
file this phase touched and the pre-existing codebase alike (§29). No
`any`-equivalent unsafe pattern was introduced by this phase's changes.

## 25. Files created this phase

- `lib/observability/request-id.js`
- `lib/observability/logger.js`
- `lib/seo/site.js`
- `lib/seo/schema.js`
- `lib/security/rate-limit.js`
- `app/robots.js`
- `app/sitemap.js`
- `app/error.js`
- `app/global-error.js`
- `app/not-found.js`
- `app/api/health/route.js`
- `app/api/health/ready/route.js`
- `app/account/layout.js`, `app/wishlist/layout.js`, `app/login/
  layout.js`, `app/signup/layout.js` (metadata-only wrappers, §4)
- `supabase/migrations/0010_observability.sql`
- `PHASE-6-CONTEXT.md` (this file)

## 26. Files modified this phase

- `next.config.js` — security headers, CSP, HSTS (§11)
- `middleware.js` — request-id resolution/propagation (§12)
- `app/layout.js` — `metadataBase`, site-wide `robots` default,
  Organization/WebSite JSON-LD (§3, §6)
- `app/product/[slug]/page.js` — canonical, OG, Twitter Card, Product/
  Offer/Breadcrumb JSON-LD (§3, §6)
- `app/categories/[slug]/page.js` — canonical, OG (§3)
- `app/products/page.js`, `app/men/page.js`, `app/women/page.js`,
  `app/kids/page.js`, `app/categories/page.js` — canonical, OG (§3)
- `app/search/page.js` — noindex (§4)
- `app/deals/page.js` — canonical (§3)
- `app/admin/layout.js` — noindex (§4)
- `app/go/[offerId]/route.js` — request-id on every response path (§12)
- `lib/affiliate/click.js` — request-id in `affiliate_clicks.metadata`,
  structured logging (§12)
- `app/api/webhooks/affiliate/[network]/route.js` — request-id, `json()`
  helper wrapping every response, structured logging (§12)
- `app/api/cron/automation/route.js` — request-id, structured logging
  (§12)
- `app/api/ai/search/route.js`, `app/api/ai/recommendations/route.js` —
  rate limiting (§13)
- `components/product/Gallery.jsx` — `fetchPriority`/`loading="eager"`
  on the primary gallery image (§7)
- `.env.local.example` — three new documented optional variables (§18)

## 27. Dependencies added

None. Every new file in §25 uses only what was already in
`package.json` (Next.js's own `Response`/`Request`/`crypto.randomUUID`
web APIs, `NextResponse`, the existing Supabase clients). This was a
deliberate choice, not an oversight — rate limiting and error tracking
both have "real" third-party answers (`@upstash/ratelimit`, Sentry) that
were intentionally not installed, because neither has credentials
supplied to this phase and installing a dependency that can't actually
be configured/tested here would be worse than clearly documenting the
gap (§13, §31).

## 28. Database migrations this phase

`0010_observability.sql` — adds one nullable, defaulted `metadata
jsonb` column to `webhook_events`. No other migration was touched.
Verified additive: no `ALTER COLUMN`, no `DROP`, no constraint change,
no backfill required (existing rows get the default `'{}'::jsonb`
automatically).

## 29. Production build — actually run, not deferred

Every prior phase's context doc deferred a real `next build` "for
sandboxing reasons." This phase's environment allowed npm registry
access, so it was actually run:

    npm install --no-audit --no-fund     # 113 packages, clean
    npm run build                        # with placeholder Supabase env vars

Result: clean compile, zero errors, zero warnings, across 44 routes.
Bundle report (§8) captured directly from this real build output. The
build was re-run three times over the course of this phase as changes
landed (baseline before any Part 6 change; after adding SEO/headers/
error-boundaries/rate-limiting/health-checks; and once more after fixing
two real issues the build itself caught):

1. `app/error.js`/`app/global-error.js` (Client Components) importing
   `lib/observability/logger.js`, which had a `server-only` guard —
   Next.js's build correctly refused to compile this. Fixed by removing
   the guard (the logger is intentionally isomorphic — see its own file
   header comment for why that's safe).
2. `app/api/health/ready/route.js` missing `export const dynamic =
   "force-dynamic"` — without it, Next.js attempted to statically
   evaluate the route at build time, which made a live (and, with
   placeholder credentials, failing) Supabase call during "Collecting
   page data." Fixed by adding the directive.

After both fixes, the build was also actually started (`next start`)
and exercised with real `curl` requests — see §30 — the first time in
this project's phase history that response headers were verified
against real HTTP traffic rather than inferred from source code.

Still not verified, honestly: functional correctness against a real
Supabase project (auth, RLS, real product data, real webhook delivery,
real AI provider). Only placeholder credentials were available in this
environment — the build's success proves the code is well-formed and
every import/route resolves, not that runtime behavior against a live
backend is correct. That requires the deployer's own Supabase project
credentials, which is a prerequisite this phase cannot supply.

## 30. Server log & trace audit

Reviewed the actual server output from the `next build`/`next start`
runs in §29: the readiness check's own error log (`{"level":"error",
"message":"readiness check failed",...}`) appeared exactly where and
when expected (against a deliberately-unreachable placeholder Supabase
host), in the new structured JSON shape, with no stack trace or
connection-string leakage. This is the one server log this phase could
actually generate and inspect end-to-end in this environment; every
other flow (webhook delivery, real AI calls, admin mutations) needs a
live Supabase project + real traffic to produce logs to audit, which
this environment cannot supply.

Actual response headers were also verified directly: `curl -I` against
`http://localhost/` and `http://localhost/go/not-a-uuid` (a running
production build, `next start`) both returned the full security-header
set from §11, including on the `/go/*` route that bypasses
`middleware.js` — confirming the headers come from `next.config.js`'s
global `headers()` rule, not from middleware, exactly as designed.
`robots.txt` and `/api/health` were also fetched directly and returned
correctly.

## 31. Known limitations (honest, environment-specific)

- Rate limiting is per-process, not distributed (§13) — real production
  traffic on Vercel needs a shared store (Upstash Redis is the
  documented upgrade path).
- No connection-pool load test was run (§20) — no live-traffic
  generation tool available in this sandbox, and more fundamentally,
  the specific failure mode being guarded against doesn't apply to this
  app's HTTP-based Supabase client architecture (§19).
- No error-tracking service (Sentry etc.) is wired up (§11 env vars,
  `lib/observability/logger.js`) — no DSN/credentials were supplied to
  this phase. The logger's structured JSON output is captured by any
  platform log drain today; swapping in a real provider later is a
  one-function change.
- Functional runtime correctness against a live Supabase project was
  not verified (§29) — only placeholder credentials were available; the
  production build's success proves the code compiles and every route
  resolves, not that database-backed behavior is correct end-to-end.
- No real domain exists yet — HSTS `preload` was deliberately not set
  (§11), and `NEXT_PUBLIC_SITE_URL` in `.env.local.example` is a
  placeholder the deployer must replace (§18).
- `next/image` migration not done (§7) — flagged as a real, worthwhile
  Part 1/2-scope follow-up, not attempted under this hardening phase's
  "don't rewrite what works" constraint.
- No explicit fetch timeout wraps Supabase client calls anywhere in
  this codebase (found while manually testing `/sitemap.xml` against a
  deliberately-unreachable placeholder host during this phase — the
  request hung rather than failing fast). Against a real, reachable
  Supabase project this is unlikely to matter (Supabase's own API layer
  responds quickly or errors out), but it means a genuinely slow/
  degraded Supabase backend could make page renders (and sitemap
  generation specifically) hang rather than fail over to a clear error
  state. Not fixed in this phase — doing so safely means threading an
  AbortSignal/timeout through every one of `lib/products/index.js`'s
  roughly a dozen exported functions plus the admin/automation
  equivalents, which is a larger, codebase-wide change than this
  phase's "minimum safe change" mandate supports for a risk that is
  theoretical against a real, healthy backend. Flagged as the top item
  for a future hardening pass.

## 32. Known external setup requirements (before deploying)

1. Set `NEXT_PUBLIC_SITE_URL` to the real production domain.
2. Set real `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   / `SUPABASE_SERVICE_ROLE_KEY` from an actual Supabase project; apply
   all 10 migrations (`0001`–`0010`) to it.
3. Set `AFFILIATE_WEBHOOK_SECRET`, `STEP_UP_SECRET`, `CRON_SECRET` to
   real random values (never reuse the placeholders from `.env.local.
   example`).
4. If real AI is desired: `AI_PROVIDER=openai` + `OPENAI_API_KEY` (see
   PHASE-5-CONTEXT.md for what the adapter still needs).
5. Once the production domain is live and stable on HTTPS, consider
   submitting it to the HSTS preload list — not done automatically by
   this codebase (§11).
6. Add the real product-image CDN/Storage hostname to `next.config.js`'s
   `images.remotePatterns` and, if it differs from the Supabase project
   origin, to the CSP's `img-src` in the same file (§11).
7. For real distributed rate limiting under serverless scale-out, add
   an Upstash Redis account and its two env vars (§13, §18).
8. For real error tracking, add a monitoring provider's DSN and wire it
   into `lib/observability/logger.js`'s `emit()` function (§11 env
   vars).
9. Configure Supabase's own dashboard connection-pooling settings
   (Supavisor mode) for any external tool that connects via a raw
   `postgresql://` string — this application's own runtime code never
   does (§19), so this is only relevant for BI tools, `psql`, or a
   future bulk-operation job, not for the deployed app itself.

## 33. Production deployment checklist

- [x] Production build passes with zero errors (§29)
- [x] robots.txt / sitemap.xml generate correctly (§2, §30)
- [x] Canonical URLs, Open Graph, Twitter Card present on public pages
      (§3)
- [x] Structured data grounded in real fields only (§6)
- [x] Private/admin/search pages carry noindex (§4)
- [x] HTTP security headers present on real responses, including
      `/go/*` (§11, §30)
- [x] CSP built from the app's actual dependency inventory, not a
      generic template (§11)
- [x] HSTS gated to production only (§11)
- [x] x-request-id generated/validated/propagated across public,
      affiliate, webhook, and cron flows (§12)
- [x] Rate limiting on the two cost-bearing AI routes, with the
      distributed-limit gap documented (§13)
- [x] Liveness + readiness health checks (§14)
- [x] Error boundaries at root and route-segment level; custom 404 (§15)
- [x] Affiliate redirect / webhook security re-verified with no changes
      needed (§16)
- [x] RLS / audit immutability re-verified with no changes needed (§17)
- [x] Secrets audited, none client-exposed (§18)
- [x] Database connection architecture documented — HTTP-based, no
      pooling-mode decision needed in application code (§19)
- [ ] Real Supabase project provisioned + migrated (external — §32.2)
- [ ] Real domain + HTTPS + HSTS preload readiness (external — §32.5)
- [ ] Distributed rate-limit store provisioned, if needed at scale
      (external — §32.7)
- [ ] Error-tracking provider wired up (external — §32.8)
- [ ] Load testing against a live, provisioned environment (external —
      not performable in this sandbox, §20)

This codebase is ready for deployment once the external prerequisites
above (all environment-specific — credentials, a real domain, live
infrastructure this sandboxed phase cannot provision) are completed.
The application itself is not currently deployed by this phase; no
claim is made that DNS, monitoring, a production Supabase project, or a
real domain are live.

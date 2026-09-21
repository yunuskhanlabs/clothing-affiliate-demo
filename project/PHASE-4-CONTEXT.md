# PHASE-4-CONTEXT.md — Affiliate Engine, Tracking, Price Comparison

Continuation of PART 1–3. This document is the handoff for PART 5.

## 1. Affiliate partner architecture

Extended, not duplicated: `stores` (0001) gained four columns —
`affiliate_network`, `tracking_param_name`, `tracking_param_template`,
`network_ids` (jsonb) — and a new `suspended` value on `entity_status`
(§5, §6). No new "affiliate_partners" table was created. See
`0004_affiliate_engine.sql` §1–2.

## 2. Affiliate network architecture

`stores.affiliate_network` (text, e.g. `direct` | `generic`) distinguishes
the merchant from how it's reached. `stores.network_ids` (jsonb) holds
whatever identifiers that specific integration needs (merchant id,
campaign id, publisher id) — only populated for the keys actually used
(§6). The dev seed (`0005_affiliate_dev_seed.sql`) configures five
different combinations to prove this isn't hardcoded.

## 3. Offer architecture

Unchanged structurally from Part 3's `offers` table. Part 4 adds:
`product_listing.offer_id` (the winning offer's id, for CTA linking) and
a deterministic third sort key (`o.id asc`) in its best-offer LATERAL
join, fixing an exact-price-tie ambiguity Part 3 left open (§33.5).

## 4. Affiliate URL architecture

`lib/affiliate/url.js`. `resolveTrustedDestination(offer, store)` picks
`offer.affiliate_url` if it's a syntactically valid absolute URL, else
falls back to `store.base_url`, else returns `null` (→ redirect refuses
to proceed, §11/§42). `injectTrackingParam()` uses the real `URL` API
(`searchParams.set`), so existing query parameters on a merchant URL are
preserved rather than clobbered by a blindly-appended `?` (§9).

## 5. Dynamic ClickID/SubID configuration

Per-store, via `stores.tracking_param_name` (e.g. `subid1`, `clickid`,
`custom_id`, `aff_sub`) — read at redirect time, never hardcoded in
`app/go/[offerId]/route.js` (§9).

## 6. ClickID generation strategy

`crypto.randomUUID()`, generated server-side inside the redirect route
only (§51 — never accepted from a client). Stored as
`affiliate_clicks.click_uuid` (unique) and injected verbatim into the
merchant URL's configured parameter.

## 7. Secure redirect flow

`app/go/[offerId]/route.js`:
`validate offerId is a UUID → look up offer+store+product (service-role
client) → verify offer.status === 'available', store.status === 'active',
product.status !== 'archived' → resolve trusted destination → generate
ClickID → record click (best-effort) → inject tracking param → 302`.
Every failure path renders a minimal inline "offer unavailable" HTML page
(never a raw error, never internal details) instead of redirecting.

## 8. Redirect HTTP status

`302` (temporary) via `NextResponse.redirect(url, { status: 302 })`.
Never 301/308 (§41).

## 9. Redirect cache-control

`Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate` +
`Pragma: no-cache`, set on every response the route returns — success
and every failure path alike (§41).

## 10. Open-redirect protection

The destination is never taken from a query parameter or any
client-supplied value — only from the `offers`/`stores` rows looked up by
the path's `offerId`, which is itself validated as a UUID before any
database call (§11).

## 11. Click event model

`affiliate_clicks` (0004 §4). Raw events, never deleted/deduplicated
(§15). `id` (internal PK) is separate from `click_uuid` (the
externally-meaningful, network-facing ClickID) — a deliberate separation,
not redundancy.

## 12. Bot/crawler classification

`lib/affiliate/bot-detection.js` — regex list against `User-Agent`
(~35 known crawler/scripted-client patterns). A missing User-Agent is
also classified as non-human, conservatively. This is explicitly an
analytics signal, never a security gate — a classified "bot" request is
still redirected normally; it's excluded from the two SQL analytics
functions' human-metric calculations (`is_bot = false` filters) but never
from `affiliate_clicks` itself (§12).

## 13. Human-vs-bot analytics rules

Every rate/aggregate in `partner_performance()`/`product_performance()`
(the two SQL functions in `0004_affiliate_engine.sql` §10) filters
`is_bot = false` for the human-facing numbers, while a separate
`bot_clicks`/`bot_crawler_clicks` count is returned alongside so bot
volume is visible without contaminating CTR/EPC (§12, §26, §27).

## 14. Unique-click definition

**Documented simplification** (§14 explicitly allows/requires this to be
documented and "configurable later"): "unique human clicks" = count of
`distinct coalesce(user_id::text, session_id)` among non-bot clicks
**within the queried date range** — not a rolling per-click attribution
window. A visitor who clicks the same offer twice in one query range
counts once; the same visitor clicking again in a different (later)
range's query counts again in that range. This was chosen over an
arbitrary rolling-window definition (e.g. "24h since first click") to
avoid over-engineering a business rule the spec explicitly says can be
revisited (§47).

## 15. Attribution model

`Click (click_uuid) → Offer → Partner → Product → [network webhook,
matched by click_ref] → Conversion → Commission`. `conversions.click_id`
is set only when the webhook's `click_ref` matches a known
`affiliate_clicks.click_uuid`; otherwise the conversion is still recorded
(with `external_click_ref` preserved for manual reconciliation) but
`click_id` stays null — partial attribution, not a rejected conversion
(§16, §17, §52).

## 16. Conversion model

`conversions` table (0004 §6). Nullable `offer_id`/`product_id`/`click_id`
by design — not every network guarantees product-level or click-level
correlation. Idempotency key: `unique (network, store_id,
external_transaction_id)` — a second delivery about the same transaction
UPSERTs (status legitimately progresses over time), it never duplicates.

## 17. Commission model

`commissions` table (0004 §7), **separate** from `conversions` (§3, §18
critical rule) — 1:1 with a conversion in this phase (`unique
(conversion_id)`). A conversion can exist with zero commission rows (no
amount reported yet) — commission rows are only written when
`commission_amount` is present in the webhook payload; amounts are never
fabricated (§18, §19).

## 18. Commission lifecycle

`pending → approved → paid`, or `pending → rejected`
(`commission_status` enum). The generic adapter also accepts a `"paid"`
event status from the network; the route handler maps that to
`conversion.status = 'approved'` + `commission.status = 'paid'` (since
`conversion_status` itself only has pending/approved/rejected — "paid" is
a commission-only concept, §18). `approved_at`/`paid_at` are stamped when
those transitions happen.

## 19. Webhook/HMAC verification

`lib/affiliate/webhook-verify.js`. HMAC-SHA256 over the **raw** request
body (`request.text()`, never re-serialized JSON), compared with
`crypto.timingSafeEqual` (constant-time, §20). Header contract (documented,
not any specific real network's actual convention — none was integrated
this phase, §22): `x-cloxtro-signature: <hex>` (required),
`x-cloxtro-timestamp: <unix seconds>` (optional). Verification happens
**before** the JSON body is even parsed — an invalid signature never
reaches business logic.

## 20. Replay protection

Two independent layers: (a) `isWithinReplayWindow()` — a 5-minute
signed-timestamp check, only applied when the network sends one (§21
"do not invent a timestamp rule that conflicts with the documented
protocol" — a network without timestamps just skips this check); (b) the
`webhook_events` idempotency ledger, keyed on `(network,
external_event_id)` when provided, else `(network, sha256(raw_body))` —
catches a literal replay of the same delivery regardless of timing.

## 21. Idempotency strategy

Two distinct guarantees, at two different granularities (see table
comments in `0004_affiliate_engine.sql` §6, §8 for the full reasoning):
`webhook_events` stops re-processing an **identical delivery**;
`conversions`' unique constraint stops **two different deliveries about
the same transaction** from becoming two conversion rows. Both are
database-enforced unique constraints/indexes, not application-only checks
(§23).

## 22. Network adapter architecture

`lib/affiliate/network-adapters/`. `index.js` is a registry keyed by the
`[network]` URL segment; the route handler only ever calls
`adapter.normalize(payload)` and never parses a network's field names
itself. Only `generic.js` is implemented this phase — a documented,
reasonable normalized shape (see that file's header comment for the exact
expected payload) that a real network integration (Impact, CJ, Admitad,
...) can be written against later without touching the route, the
idempotency logic, or the conversion/commission upsert (§22).

## 23. Analytics events

Implemented: `product_view` (`product_views` table) and `affiliate_click`
(`affiliate_clicks` table) — the two events actually needed for CTR/EPC.
Deliberately NOT implemented this phase (§24 "do not collect every
possible UI interaction"): `wishlist_add`, `search`, `filter_change` as
dedicated analytics events — Part 2/3 already have their own
purpose-built mechanisms for wishlist/search (wishlist_items,
saved_searches) that don't need a parallel analytics event to be useful.

## 24. Product view tracking

`POST /api/track/view` (`app/api/track/view/route.js`), called from
`lib/analytics/trackView.js`'s `trackProductView()` inside
`ProductDetailClient`'s existing view-tracking `useEffect` — fired with
`fetch(..., { keepalive: true })`, never awaited, errors swallowed (§25).
This is a second, independent call alongside Part 2/3's existing
`recordProductView()` (which drives the "recently viewed" feature) — the
two serve different purposes and were kept separate rather than merged.

## 25. CTR calculation

`CTR = human affiliate clicks / human product views × 100`, computed
inside `partner_performance()`/`product_performance()` (SQL, §10 of the
migration). Returns `NULL` (not `0`, not an error) when views are zero
(§26, §27 "do not divide by zero"). "Product views" in
`partner_performance` is scoped to products that have at least one offer
with that store (views themselves aren't store-specific) — documented in
the function's own comment since it's a judgment call.

## 26. EPC calculation

`EPC = total commission (all statuses combined — an "estimated" figure,
not "approved-only") / human affiliate clicks`. Also `NULL` on a zero
denominator. The functions don't currently split EPC into
estimated/approved/paid variants separately (§27 allows but doesn't
require this) — a documented scope cut; the underlying `commissions.status`
column has everything needed to add that breakdown in Part 5 without a
schema change.

## 27. Partner analytics

`partner_performance(store_id, from, to)` — product views (scoped as
above), human clicks, unique human clicks, bot clicks, conversions,
pending/approved/paid commission totals, CTR, EPC. Exposed via
`GET /api/admin/analytics/partner?storeId=&from=&to=`, admin-gated twice
(route-level `profiles.role` check + database-level `revoke execute ...
from public/anon/authenticated` on the function itself — see §30 below).

## 28. Product analytics

`product_performance(product_id, from, to)` — views, human/bot clicks,
conversions, total commission, CTR, EPC, and the current best offer id.
Exposed via `GET /api/admin/analytics/product?productId=&from=&to=`, same
admin-gating.

## 29. Price comparison

`lib/products/offers.js`'s `getOffersForProduct(productId)` — every
`active`-store offer for a product, sorted and flagged. Rendered by
`components/product/OfferComparison.jsx` on the product detail page
(only shown when a product has more than one offer).

## 30. Best-price logic

Deterministic, three-key sort, implemented identically in two places
(documented rather than shared as one function, since one runs in SQL and
one in JS — see below): (1) `status === 'available'` before anything
else, (2) lowest `price`, (3) `offer id` as a stable tie-breaker (§33.5).
Implemented in: `product_listing`'s LATERAL join (SQL, for grid/detail
"current price"), `product_performance()`'s `best` CTE (SQL, for
analytics), and `getOffersForProduct()` (JS, for the comparison table) —
three call sites, same three-key rule, cross-referenced in comments at
each site so a future change to the rule is easy to find and apply
everywhere. **Never reads commission/conversion data** — structurally
guaranteed, since `getOffersForProduct()`'s query doesn't join those
tables at all (§35).

## 31. Price-history integration

`lib/products/price-history.js`'s `getRecentPriceDrop(offerId)` reads
Part 3's existing `price_history` table (trigger-populated only — §36, no
second history mechanism introduced). Returns a genuine drop only when
the single most recent history row for that offer, within the last 14
days, was a decrease. Deliberately does NOT attempt a "lowest price ever"
claim (§36 — would need full historical coverage this phase doesn't
guarantee).

## 32. Affiliate disclosure integration

Unchanged component (`components/product/AffiliateDisclosure.jsx`, Part
2). Rendered on: product detail (directly below the CTA, above the new
offer-comparison table), `/deals` (Part 2, still in place). Not
duplicated inside `OfferComparison` itself since it already sits directly
below the page's existing disclosure (§38 "appropriately associated,"
not "repeated everywhere").

## 33. Privacy/data-minimization decisions

- `affiliate_clicks.session_id`/`product_views.session_id` are random
  UUIDs in a first-party cookie (`lib/affiliate/session.js`) — never IP
  address, never a fingerprint (§13, §43).
- `user_agent`/`referrer` are stored truncated to 500 chars, as a
  classification/diagnostic signal, not retained in full for any other
  purpose.
- No geolocation, no device fingerprinting was added.
- Webhook `raw_payload` stores the network's own JSON body (which never
  contains our verification secret — that travels in a header) —
  intentionally not further redacted, since the payload is
  business/transaction data (order value, status), not PII about the
  end customer in the adapter contract defined here.

## 34. RLS policies

`affiliate_clicks`, `product_views`, `conversions`, `commissions`,
`webhook_events` — RLS enabled, **admin-only SELECT**, **no INSERT/UPDATE
/DELETE policy for any role** (writes only ever happen via the
service-role client from trusted server code — see 0004 §9's comment for
the full reasoning, mirroring how Part 3 treated `price_history`).
`partner_performance()`/`product_performance()` additionally have their
default PUBLIC execute privilege revoked and re-granted only to
`service_role`, since being `SECURITY DEFINER` would otherwise let any
authenticated/anon caller invoke them directly via RPC regardless of the
underlying tables' RLS (§44).

## 35. Affiliate analytics indexes

`(offer_id, created_at)`, `(product_id, created_at)`, `(store_id,
created_at)` on both `affiliate_clicks` and (product-scoped) on
`product_views`; `is_bot` on both; a partial index on
`(offer_id/product_id, session_id, created_at) where is_bot = false` for
the unique-visitor derivation; `(store_id, created_at)`,
`(status, created_at)` on `conversions`/`commissions`. All chosen to
match the actual query dimensions in §46 of the phase spec — see
`0004_affiliate_engine.sql` §4–7 for the index list with rationale
comments at each one.

## 36. Aggregation strategy

Database-side only (§47) — `partner_performance()`/`product_performance()`
are plain SQL functions doing set-based aggregation with CTEs, not
materialized views (not justified at this data scale, §47 "do not
over-engineer prematurely") and not browser-side reduction of raw rows.

## 37. Timezone strategy

All new timestamp columns are `timestamptz`, matching Part 3's
established convention (§48). Date-range parameters to the analytics
functions are plain ISO timestamps (UTC on the wire); no
browser-local/server-local mixing was introduced.

## 38. Rate-limit/fraud foundation

**Not implemented** in this phase — no rate-limiting infrastructure
existed in Part 1–3 to build on, and adding one (e.g. a Redis-backed
limiter) was judged out of scope for "prepare a clean integration point
and document the limitation" (§49, explicitly allowed). The integration
point: `app/go/[offerId]/route.js`'s top-level `GET` handler is the
single choke point every affiliate click passes through — a rate limiter
would wrap that handler. `affiliate_clicks.is_bot` + `session_id` +
`created_at` already provide what a simple frequency-based fraud signal
(§50) would need to query against, without any additional schema.

## 39. Error handling

Every failure path in `/go/[offerId]` returns a safe, generic HTML page
(never a raw error, never which specific check failed) with an
appropriate status (400 malformed id, 404 unknown offer, 410 gone/
inactive, 502 no valid destination). The webhook route returns JSON
errors with similarly generic messages (401 for any auth failure — never
distinguishing "missing header" from "bad signature" from "unconfigured
secret," §54).

## 40. Files created

```
supabase/migrations/0004_affiliate_engine.sql
supabase/migrations/0005_affiliate_dev_seed.sql
supabase/migrations/0006_catalog_search_offer_id.sql

lib/affiliate/bot-detection.js
lib/affiliate/session.js
lib/affiliate/url.js
lib/affiliate/click.js
lib/affiliate/webhook-verify.js
lib/affiliate/network-adapters/index.js
lib/affiliate/network-adapters/generic.js
lib/products/offers.js
lib/products/price-history.js
lib/analytics/trackView.js

app/go/[offerId]/route.js
app/api/track/view/route.js
app/api/webhooks/affiliate/[network]/route.js
app/api/admin/analytics/partner/route.js
app/api/admin/analytics/product/route.js

components/product/OfferComparison.jsx
```

## 41. Files modified

- `lib/products/mappers.js` — added `offerId` to both
  `mapListingRowToProduct` and `mapDetailToProduct` (additive; existing
  fields untouched).
- `components/product/ProductCTA.jsx` — now a real `<a href="/go/{offerId}">`
  instead of a local-state-only button; same visual/interaction contract.
- `components/product/ProductCard.jsx` — the slide-in "View Deal" CTA now
  links to `/go/{offerId}` directly (§39); the card-image tap still opens
  the product page, unchanged.
- `components/product/ProductDetailClient.jsx` — accepts new `offers`/
  `priceDrop` props, renders `OfferComparison` + a price-drop badge, fires
  `trackProductView()` alongside the existing `recordProductView()`.
- `app/product/[slug]/page.js` — fetches `getOffersForProduct()` and
  `getRecentPriceDrop()` alongside the existing `Promise.all` fetches.
- `middleware.js` — matcher now also excludes `/go/*` and
  `/api/webhooks/*` (§55 performance; see that file's updated comment).
- `.env.local.example` — added `AFFILIATE_WEBHOOK_SECRET`.

## 42. Dependencies added

None. HMAC uses Node's built-in `node:crypto`; ClickID generation uses
the global `crypto.randomUUID()` (Node 19+/20+, available in this
project's runtime).

## 43. Known limitations

- Commission is modeled 1:1 with a conversion (`unique(conversion_id)` on
  `commissions`). A network that reports commission adjustments as
  separate line items over time would need this relaxed to 1:many in a
  later phase — documented rather than modeled now (§22 scope).
- Only the `generic` network adapter exists; no real affiliate network
  (Impact/CJ/Admitad/etc.) was integrated, per §22's explicit "do not
  build every network integration now."
- Rate limiting / fraud detection is a documented integration point, not
  an implementation (§38 above, §49 explicitly allows this).
- "Unique clicks" uses a per-query-range distinct-visitor definition, not
  a rolling per-click window (§14 above) — flagged as a deliberate,
  revisitable simplification.
- EPC is a single blended figure (all commission statuses), not split
  into estimated/approved/paid variants.
- Migrations were **not** run against a live Postgres/Supabase instance
  in this environment (no network access to run `supabase db push` or
  connect to a database) — same limitation noted in Part 2/3's handoffs.
  Please run `supabase db push` (or apply the three new migration files
  in order: 0004 → 0005 → 0006) and exercise the Part 4 test matrix
  (§57–§64 of the phase spec) against a real project before deploying.

## 44. Known issues

None identified in manual review beyond the "not run against a live
database" limitation above — please run the redirect/webhook/security
test matrix from the phase spec locally, especially: an exact-price-tie
between two offers (tests the new deterministic tie-break), a webhook
replay with a modified payload (should be rejected even with a
resent-but-stale signature), and an inactive/suspended store's offer
(should refuse to redirect).

## 45. Exact requirements for PART 5

- `is_admin()`/admin-gated patterns from Part 3 continue to be the right
  model — `app/api/admin/analytics/**` already follows it; Part 5's Admin
  Panel can call these two endpoints directly for partner/product
  performance widgets rather than re-implementing the aggregation.
- `webhook_events`, `conversions`, `commissions` are read-only foundations
  for a future reconciliation dashboard (§53 of the phase spec) — no
  reconciliation UI exists yet.
- A real network adapter (when one is integrated) goes in
  `lib/affiliate/network-adapters/<name>.js` + one line in that
  directory's `index.js` registry — the route handler needs no changes.
- Rate limiting (§38/§49 above) is the clearest "not yet built" piece a
  future phase should prioritize if `/go/[offerId]` traffic grows.

## 46. Architectural decisions

- Chose to extend `product_listing`/`catalog_search` (views/functions)
  with `offer_id` rather than have the frontend make a second query to
  learn which offer is "current" — keeps `ProductCard` a single-fetch
  component, consistent with Part 2/3's existing pattern.
- Chose one `getOffersForProduct()` JS implementation (not a SQL view) for
  the comparison table, since the product detail page already does its
  data-fetching in JS/Server Components and the query is a single
  product's offers (a handful of rows) — not the kind of scale that
  benefits from a database view the way the multi-thousand-row catalog
  listing does.
- Chose a single generic HMAC header contract (`x-cloxtro-signature` /
  `x-cloxtro-timestamp`) rather than pre-guessing a specific real network's
  exact header names, since no real network was integrated this phase —
  documented as such rather than presented as a real network's protocol.

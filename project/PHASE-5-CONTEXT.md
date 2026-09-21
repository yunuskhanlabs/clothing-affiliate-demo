# PHASE-5-CONTEXT.md — Admin Panel, Automation, AI

Continuation of PART 1–4. This is the handoff for PART 6 (final SEO/
performance/security/deployment audit — nothing else should be built
until then).

## 1. Admin architecture

`app/admin/**` — a route group with its own `layout.js` (auth-gates via
`requireAdmin()`, redirects non-admins) wrapping `AdminShell`
(`components/admin/AdminShell.jsx` — sidebar + topbar, responsive drawer
on mobile). Built from the same Tailwind design tokens as the storefront
(`bg-ink`, `text-tag`, etc.) but visually distinct (dense operational
layout vs. the marketing storefront), per §7.

## 2. Admin routes

All 14 route areas from §4 of the phase spec now exist:
`/admin` (dashboard), `/admin/products` (+ `/admin/products/[id]`),
`/admin/categories`, `/admin/brands`, `/admin/offers`, `/admin/partners`
(+ `/admin/partners/[id]`), `/admin/deals`, `/admin/content` (+
`/admin/content/[id]`, with structured product linking), `/admin/analytics`
(per-partner/per-product drill-down on top of the Part 4 endpoints),
`/admin/conversions`, `/admin/commissions`, `/admin/automation` (jobs +
DLQ), `/admin/ai` (live intent-pipeline test console, §67/§90),
`/admin/audit-logs`, `/admin/settings` (read-only — see §67 note).

## 3. Admin authorization

`lib/admin/auth.js`'s `requireAdmin()` is the single check every
`/api/admin/**` route calls — reads the real session
(`getSupabaseServerClient()`), checks `profiles.role === 'admin'`. This
is a convenience/fast-fail layer, **not the security boundary** (§5, §6):
the actual boundary is PostgreSQL RLS (`is_admin(auth.uid())` policies
from Part 3, already in place on every catalog table) plus the new
admin-only-SELECT / no-write-for-any-role policies on `audit_logs`,
`automation_jobs`, `automation_dlq`, `ai_intent_cache`,
`product_embeddings` (Part 5). A normal authenticated user calling an
admin mutation route directly, bypassing the frontend entirely, is
rejected at both layers independently.

## 4. Step-up authentication

`lib/admin/step-up.js` — a stateless, HMAC-signed, 10-minute token issued
by `POST /api/admin/step-up` after re-verifying the admin's password via
`supabase.auth.signInWithPassword()`. Required (checked via
`hasValidStepUp(request, userId)`) on: partner tracking/credential
changes (`PATCH /api/admin/partners/[id]` when the payload touches
`affiliate_network`/`tracking_param_name`/`tracking_param_template`) and
bulk product mutations (`POST /api/admin/products/bulk`). Ordinary
low-risk edits (a single product's name, a partner's display name) do
**not** require it (§94). The password itself is never logged; only
`step_up_used: true/false` is recorded in the audit entry.

## 5. RLS/security

No table introduced this phase has a public/authenticated write policy
except `automation_dlq` (admin UPDATE allowed — an operational queue, not
a security record) and the catalog tables' pre-existing Part 3
`is_admin()` write policies (products/offers/stores/etc. — unchanged).
`audit_logs`, `automation_jobs`, `ai_intent_cache`, `product_embeddings`
have writes revoked from every session-based role, including
`service_role` for `audit_logs` specifically (§20 below).
`partner_performance()`/`product_performance()` (Part 4) and the new
`platform_performance()`/`platform_daily_trend()` all have their default
PUBLIC execute privilege revoked and re-granted only to `service_role`.

## 6. Dashboard

`GET /api/admin/dashboard?range=today|7d|30d|month` →
`platform_performance()` + `platform_daily_trend()` (both SQL, §10 of
`0007_admin_audit_deals_content.sql`) + a bounded (5,000-row) in-memory
tally of top products/partners by human clicks in-range. Catalog counts
(total/active/out-of-stock/archived products, total offers, active
partners) are point-in-time, not date-ranged — a product's current
status is what it is "today" regardless of the selected range.

## 7. Analytics

Definitions unchanged from Part 4: `CTR = human clicks / human views ×
100`, `EPC = commission / human clicks`, both `NULL` (never a fabricated
0%) on a zero denominator. Pending/approved/paid commission are always
three separate numbers on the dashboard, never summed into one "revenue"
figure (§10 "never present pending as paid"). Bot/crawler clicks are
shown as a separate count, never mixed into the human figures used for
CTR/EPC.

## 8. Product management

`app/api/admin/products/**` (list+search+create, get/update/archive,
bulk). Admin search uses `ILIKE` against `products.name`, accelerated by
the `idx_products_name_trgm` GIN trigram index (§69 — plain database
query, no AI). Products are never hard-deleted — `DELETE
/api/admin/products/[id]` sets `status = 'archived'`.

## 9. Variant management

Folded into the product edit endpoint (`PATCH
/api/admin/products/[id]`, `variants` array) rather than a separate
sub-resource — the payload is treated as the full desired set: existing
rows (`id` present) are updated, new rows (no `id`) inserted, and rows
missing from the payload are deleted. Uses `product_variants` directly —
no parallel variant model was introduced (§13).

## 10. Image management

Same pattern as variants, on `product_images` (`images` array in the
same PATCH payload) — add/remove/reorder/set-primary/alt-text all flow
through this one array replacement. The 3:4/CLS-safe rendering
architecture from Part 2 is untouched; this only writes rows the public
gallery already knows how to render (§14).

## 11. Category management

`app/api/admin/categories/**` — create/list/update. `DELETE` refuses
outright (409) if any product still references the category as its
`department_id`/`subcategory_id`, rather than attempting an automatic
migration (§15 "safe migration strategy" — the safe default here is "an
admin reassigns products first," not an automatic reassignment this code
would have to guess at).

## 12. Brand management

`app/api/admin/brands/**` — straightforward create/list/update,
including `status` (active/inactive) toggling. No delete endpoint exists
(status toggle is the "retire a brand" mechanism, matching §16 "preserve
existing brand relationships").

## 13. Partner management

`app/api/admin/partners/**`. `PATCH /api/admin/partners/[id]` splits
fields into `ORDINARY_FIELDS` (name, slug, base_url, logo_url, status —
no step-up) and `SENSITIVE_FIELDS` (affiliate_network,
tracking_param_name, tracking_param_template, network_ids — step-up
required, §6/§17/§19). Partners are never deleted, only deactivated/
suspended via `status` (Part 4 already added the `suspended` enum value).

## 14. Offer management

`app/api/admin/offers/**`. Price/availability updates write directly to
`offers.price`/`offers.status` — **the Part 3 trigger
(`trg_offers_price_history`, completely unmodified) is what populates
`price_history`**; this code never inserts into that table itself (§18).
`last_updated_at` is bumped on every PATCH so the storefront's stale-data
signal (§77, see `getRecentPriceDrop`/§32 below) has an accurate
"confirmed as of" timestamp.

## 15. Affiliate tracking configuration

Configured per-store via the partner edit screen/`SENSITIVE_FIELDS`
above (§19) — not a separate settings page. `GET
/api/admin/offers/[id]/test-url` (§20) validates an offer's full
affiliate configuration (offer active, partner active, URL resolves,
tracking param configured, final URL constructs cleanly) by calling the
exact same `lib/affiliate/url.js` functions the real `/go/[offerId]`
redirect uses — a passing test is a genuine guarantee, not a
reimplementation that could drift. It **never** calls
`recordAffiliateClick()` — the test click_id is the literal string
`TEST-00000000-...`, and no `affiliate_clicks` row is ever written by
this endpoint (§20 "do not accidentally generate fake production
analytics").

## 16. Deal management

`deals` table + `app/api/admin/deals/**` + `/admin/deals` UI (§21-§23).
A deal row is `{ offer_id, label, headline, starts_at, ends_at,
is_active }` — **no price column exists on this table at all**, which is
what makes it structurally impossible for "Featured"/"Sponsored" to leak
into a false "Best Price" claim (§23) — there's nothing to leak. The
public-facing `get_active_deals()` SQL function re-validates offer/
product/store eligibility live on every read (§22) rather than trusting
the deal row alone.

## 17. Content management

`content_articles` + `content_article_products` (join table) +
`app/api/admin/content/**` (§24, §25). No dedicated `/admin/content` UI
page was built this phase (API-only — see §61). Product references are
structured (`content_article_products`, ordered by `position`), not
hardcoded URLs in the article body, so a product's current price/
availability stays live wherever an article references it.

## 18. Product/content linking

Same join table as §17 — `PATCH /api/admin/content/[id]` accepts a
`productIds` array and fully replaces the article's linked products
(delete-then-reinsert, matching the variants/images pattern in §9/§10).

## 19. Audit logging

`audit_logs` + `log_admin_action()` SECURITY DEFINER function +
`lib/admin/audit.js`'s `logAdminAction()` wrapper, called from every
mutation route in this phase after the mutation succeeds. Records actor
id + email (captured at write time), action, entity type/id,
non-sensitive metadata, and whether step-up was used. **Never** logs
passwords, API keys, HMAC secrets, or tokens — callers only ever pass
already-vetted field names/non-sensitive values (§26).

## 20. Database-level audit immutability

This is enforced by **PostgreSQL privilege**, not application
convention (§27): `revoke update, delete, insert on audit_logs from
authenticated, anon, service_role` (see `0007_admin_audit_deals_content.sql`
§1) — note `service_role` is included, closing the gap RLS alone would
leave open (service-role bypasses RLS entirely, so RLS-only immutability
would not actually stop a service-role client from mutating history). The
**only** way to add a row is `log_admin_action()`, a `SECURITY DEFINER`
function that runs with its owner's privilege regardless of the revoked
grants, and which the application never exposes for arbitrary raw SQL —
callers pass structured arguments, not free text that could be
misinterpreted as a query. Verified in §93 of the phase's test matrix
(manually — see §62 "known issues").

## 21. Automation architecture

Two job shapes, described in full in `0008_automation.sql`'s header
comment (worth reading directly): (a) pure-SQL jobs (price-drop
detection, deal recalculation, price-alert matching) where the entire
job — lock, work, and result — is one `plpgsql` function, so one Supabase
RPC call is one Postgres transaction and `pg_try_advisory_xact_lock`
genuinely covers the whole job; (b) Node-driven jobs that call an
external HTTP endpoint (offer refresh, embeddings backfill), which
**cannot** be one transaction (an open transaction can't span an
in-flight `fetch()` without violating the spec's own "do not hold
long-running transactions merely to keep an advisory lock," §31) — these
use `claim_job_run()`, a millisecond-scale advisory-lock-protected atomic
claim of a `'running'` marker row, with a staleness window standing in
for "is this job still actually running."

## 22. Advisory-lock strategy

`pg_try_advisory_xact_lock(hashtextextended('job:' || job_name, 0))` —
non-blocking, deterministic per-job-name key, exactly the
`job:offer_refresh` / `job:price_drop_detection` convention the phase
spec names (§31). Genuinely race-free for the pure-SQL jobs (Postgres
itself serializes the lock acquisition). For the claim-row pattern, the
race-free guarantee covers the *claim* only — see §21 above for why that
distinction is honest rather than a full equivalent.

## 23. Job execution

A real scheduler is now wired: `vercel.json` schedules Vercel Cron to call
`GET /api/cron/automation` hourly (`0 * * * *`). That route is
authenticated by a shared `CRON_SECRET` bearer token (Vercel sends this
automatically once `CRON_SECRET` is set as a project environment
variable) — it deliberately does NOT use `requireAdmin()`, since a cron
invocation has no browser session; the shared secret is the trust
boundary instead, matching §29's "use the project's available
scheduled-job mechanism." The route runs every job in `KNOWN_JOBS`
sequentially and is safe to invoke more often than scheduled, or
concurrently with a manual trigger, since every job is independently
lock-protected (§31) — an overlapping run just gets `{ skipped: true }`.
`POST /api/admin/automation { job }` remains the manual/admin-triggered
path (used by `/admin/automation`'s "Run now" button) — both paths call
the exact same `runJob()` in `lib/automation/jobs.js`.

## 24. Idempotency

Pure-SQL jobs: `run_price_drop_detection()` uses
`on conflict (offer_id, label) do nothing` (deals' own unique
constraint); `run_deal_recalculation()` only ever sets `is_active =
false` for offers that are ALREADY ineligible — running it when nothing
changed updates zero rows; `run_price_alert_check()` uses
`on conflict (alert_id, offer_id, matched_price) do nothing`. Node jobs:
`runOfferRefresh()`/`runEmbeddingsBackfill()` only ever update existing
rows' `last_updated_at`/`embedding` — no insert of a new business record
happens on a re-run with unchanged inputs (embeddings backfill
additionally skips unchanged products via `source_hash` comparison,
§30).

## 25. Retry strategy

`lib/automation/retry.js`'s `withBackoff()` — up to 5 attempts by
default, `classifyFailure()` splits transient (429, 5xx, timeout/reset)
from permanent (other 4xx) per §33's own examples, and a permanent
failure throws immediately rather than retrying (fails fast to DLQ).

## 26. Exponential backoff

`delay = min(base * 2^attempt, maxMs)`, base 500ms, max 30s, **full
jitter** (`random(0, delay)`, AWS's recommended jitter strategy — chosen
over +/- jitter because it spreads retries more evenly and avoids
synchronized retry storms across concurrent callers, which +/- jitter
around a shared mean can still produce).

## 27. Dead-letter queue

`automation_dlq` + `lib/automation/dlq.js`. `enqueueDlqItem()` redacts
any key whose name suggests a credential (`authorization`, `api_key`,
`secret`, `token`, `password`, ...) from `payload` before insert, as a
defense-in-depth layer beyond "callers shouldn't pass these in the first
place" (§32). Status is `dead_lettered` immediately for a permanent
failure or after 5 attempts for a transient one, else `retrying`.

## 28. DLQ replay

`PATCH /api/admin/dlq/[id] { action: "replay" }` — wired for both job
types that actually enqueue DLQ items this phase: `offer_refresh`
(`replayOfferRefreshItem()`, re-runs the single store's liveness check)
and `embeddings_backfill` (`replayEmbeddingsBackfillItem()`, re-runs
embedding generation for the one product). Both are idempotent by
construction — the offer-refresh replay only updates `last_updated_at`,
the embeddings replay upserts on the `product_id` primary key — so
replaying twice is harmless (§34). The pure-SQL jobs (price-drop
detection, deal recalculation, price-alert check) never enqueue DLQ items
in the first place (they either fully succeed or the whole RPC call
errors back to the caller), so there is nothing job-specific to replay
for them yet — a documented, narrower scope than "every job type," not an
oversight. Every replay/resolve/ignore action is audit-logged (§34
"record the replay action in the audit log").

## 29. Network adapters

Two adapter-shaped seams exist, deliberately not unified into one
`AffiliateProvider` interface this phase (§37 names that shape as a
target, not a requirement to build immediately, and §36/§22 both
explicitly permit deferring full integration): Part 4's
`lib/affiliate/network-adapters/` (conversion webhook payload
normalization, unchanged) and the offer-refresh job's per-store HTTP
liveness check (`lib/automation/jobs.js`). No real affiliate network's
actual product-feed API was integrated (none was available to build
against) — see §61 "known limitations."

## 30. Product/offer refresh

`runOfferRefresh()` — for each `active` store, a bounded `HEAD` request
to its `base_url` (via `withBackoff`), updating `last_updated_at` on that
store's available offers on success, or enqueuing a DLQ item on
exhaustion. This is a genuine, real HTTP call (not simulated) —
demonstrating the full idempotent/locked/retried/DLQ'd pattern
end-to-end — but it does **not** fetch or apply real price/availability
data from an external feed, since no real affiliate network endpoint was
available to integrate against this phase. See §61.

## 31. Stale-data handling

`offers.last_updated_at` is the source for "price last confirmed" — set
on every admin price edit (§14) and every successful refresh-job pass
(§30). No dedicated storefront UI banner was added this phase to surface
staleness (§77 names this as a UX pattern to apply "according to the
site's UX," not a hard requirement) — the data needed to build one
(`last_updated_at`) is already there for Part 6 or a follow-up to use.

## 32. Price-drop automation

`run_price_drop_detection()` (§21 above) — tags an offer with a
`todays_deal` label when the most recent `price_history` entry in the
last 24h shows a drop of at least 15% (both thresholds are function
parameters, not hardcoded). Reads `price_history` only — never computes
its own notion of "drop" from `discountPercentage` (which is MRP-vs-
current, a different concept, §37).

## 33. Price-alert processing

`run_price_alert_check()` + new `price_alert_matches` table — matches
Part 3's `price_alerts` against currently-available offers at/under the
target price, records a match idempotently. **Sending an actual
notification is out of scope**, exactly matching Part 3's own note on
`price_alerts` ("foundation only") — `notified_at` stays null until a
future notification worker is built.

## 34. AI architecture

`lib/ai/` — provider-agnostic (`getAiProvider()` in `lib/ai/provider.js`
selects `local` (default, always available) or `openai` (documented seam,
inactive without a key) via `AI_PROVIDER`). AI never becomes the source
of truth for price/availability/commission/affiliate URL/product
identity (§45) — `runAiSearch()`/`runIntentQuery()` in
`lib/ai/search-pipeline.js` only ever produce a **filter object**, which
is then used to query `product_listing`/`hybrid_search()` fresh — the
returned products/prices/offers are always current database reads, never
anything the AI "said."

## 35. AI structured-output schema

`lib/ai/schema.js` — `INTENT_JSON_SCHEMA` (native structured-output
format, passed to the OpenAI adapter's `response_format`) and
`IntentSchema` (Zod, `.strict()` so an unrecognized/injected field like
`"sql": "DROP TABLE products"` is a hard validation failure, not silently
ignored data, §48/§92).

## 36. Zod validation

`validateIntent()` — the **only** gate between raw AI/provider output and
`runIntentQuery()`. Bounds every numeric field (price 0–1,000,000,
rating 0–5, discount 0–100, outfit_count 1–6) and enum fields (sort,
gender) explicitly — `price_max = -999999` (§92's example) fails
`.min(0)` and never reaches query-building code.

## 37. AI validation-failure handling

`extractValidatedIntent()` in `lib/ai/search-pipeline.js` — one retry on
provider-throw or Zod failure, then falls back to
`queryProductCatalog()` (plain deterministic FTS) if both attempts fail
(§49). No exception from a malformed AI response ever reaches
`app/api/ai/search/route.js`'s caller — that route additionally wraps
everything in a defensive outer `try/catch` returning empty results
rather than a 500.

## 38. AI model tiering

`lib/ai/provider.js`'s `MODEL_TIERS` — `lightweight` (used for all intent
extraction this phase, both providers) and `heavy` (documented, not used
anywhere — no task in this phase needed higher reasoning quality than
structured intent extraction, §50). The OpenAI adapter reads its model
name from `OPENAI_INTENT_MODEL` (env var, default `gpt-4o-mini`) rather
than hardcoding one, per §50's own instruction.

## 39. Intent caching

`lib/ai/cache.js` — `ai_intent_cache`, keyed by
`sha256(normalized_query :: schema_version :: provider_name)`. Stores
**only** the validated structured intent object — no column on that
table could hold price/availability/affiliate data even by mistake
(§52), and every cache hit is still followed by a fresh
`hybridSearch()`/`queryProductCatalog()` call (§52's "Cached Intent ->
Fresh Database Query" diagram, implemented literally).

## 40. Intent cache invalidation/versioning

The cache key embeds `SCHEMA_VERSION` (`lib/ai/schema.js`) and the
provider name — changing either produces a different key automatically,
so old entries are simply never matched again rather than needing manual
deletion (§53). TTL is a fixed 6 hours (`CACHE_TTL_SECONDS`) — bounded,
not "effectively permanent." `purge_expired_intent_cache()` (SQL
function, 0009) is available for periodic cleanup but isn't itself
required for correctness (expired rows are already never served, per the
explicit expiry check in `getCachedIntent()`).

## 41. AI latency measurements

`runAiSearch()` records `diagnostics.latencyMs` (wall-clock, measured —
not assumed, §54) around the full extract-validate-query pipeline and
returns it in the API response. No specific number is claimed or
promised in this document — §54 explicitly says to measure rather than
promise sub-100ms for uncached calls, and this environment has no way to
benchmark a real network-bound provider call anyway (the default `local`
provider has no network round-trip, so its latency is dominated by the
database query, not model inference).

## 42. PostgreSQL FTS architecture

**Completely untouched** — `product_listing.search_vector`,
`catalog_search()` (0003, extended only to add `offer_id` in Part 4's
0006, not touched again this phase) remain exactly as Part 3 built them.

## 43. pgvector architecture

`product_embeddings` table, `vector(384)`, HNSW index
(`vector_cosine_ops`, library defaults m=16/ef_construction=64) — chosen
over IVFFlat specifically because this dataset is small and starts empty
(IVFFlat's clustering quality depends on having enough training vectors
present at index-build time, which is awkward for an asynchronously-
backfilled table); HNSW has no such sensitivity. **384 dimensions**
because that's a common small-model embedding size (e.g.
all-MiniLM-L6-v2-class models) — chosen as a reasonable placeholder
target, not because a specific model was actually wired up (see §61,
`lib/ai/embeddings.js`'s own header comment).

## 44. Hybrid search

`lib/search/hybrid.js`'s `hybridSearch()` → `hybrid_search()` SQL
function (0009). Filters (category/subcategory/price) are applied inside
the SQL function's own `scoped` CTE, **before** either FTS or vector
ranking runs (§43 "must never override factual filters") — a
semantically-similar-but-over-budget or wrong-category product is
excluded before ranking even considers it, not ranked-then-filtered.
Falls back to `queryProductCatalog()` (plain FTS) on any RPC error or
embedding-generation failure (§44).

## 45. RRF ranking

`hybrid_search()`'s `fused` CTE: `rrf_score = coalesce(1/(k+fts_rank), 0)
+ coalesce(1/(k+vector_rank), 0)`, `k = 60` (a `p_rrf_k` parameter, not
hardcoded past the function boundary). A row present in only one of the
two ranked lists still scores (via `full outer join` + `coalesce`) —
standard partial-fusion RRF behavior, not requiring a row to match both
signals.

## 46. Vector indexing

See §43. No `REINDEX` step is automated after a bulk backfill — for this
phase's dataset size, HNSW's incremental insert behavior is adequate
without one; documented as a scale consideration for later (§83's
"document the selected configuration," done here rather than deferred).

## 47. AI search pipeline

`User Query -> lib/ai/search-pipeline.js: cache check -> provider.extractIntent()
-> IntentSchema.parse() (retry once on failure) -> lib/search/hybrid.js:
hybridSearch() -> product_listing rows -> mapListingRowToProduct() ->
JSON response`. Exposed at `POST /api/ai/search`, surfaced in the
storefront via `components/catalog/AiSearchPanel.jsx` (an "Ask AI" tab
alongside — not replacing — the existing deterministic `/search` filter
UI, `components/catalog/SearchPageBody.jsx`).

## 48. AI recommendation engine

`lib/ai/recommendations.js`. `getPersonalizedRecommendations()` reads
only `product_listing` rows (never invents one, §56/§61) filtered by the
signed-in user's wishlist/recently-viewed categories; falls back to a
popularity ordering (`review_count desc`) when there's no history (§57).
Wired into the homepage's `PersonalizedShell` (now an async Server
Component, replacing Part 1's "sign in to see picks" placeholder) and
`GET /api/ai/recommendations` for client-side use.

## 49. Outfit recommendations

`getOutfitRecommendation()` — picks the cheapest available offer from
each of a small, explainable "complementary subcategories" list (e.g.
t-shirts + jeans), respecting a per-item budget slice when a total budget
is given. The total price is a real sum of real selected offers' prices
— never an invented bundle price (§59). `GET
/api/ai/recommendations?mode=outfit&budget=1500&pieces=2`.

## 50. AI fallback

Every AI-dependent path has a defined non-AI fallback: search ->
deterministic `catalog_search()` (§37, §44); recommendations -> popularity
ordering (§48); hybrid search -> FTS-only (§44). No storefront feature
requires AI/pgvector to be available (§62).

## 51. AI cost control

Local provider makes no external API call at all (default). Intent
caching (§39) means a repeated normalized query never re-invokes even a
configured real provider. `runAiSearch()` only calls the provider when
there's no cache hit — never on every keystroke (the UI only submits on
form submit, not on-change).

## 52. AI privacy

`POST /api/ai/search` sends only the raw query string onward — no user
id, session id, or browsing history (§64). `GET /api/ai/recommendations`
reads wishlist product ids scoped to the caller's own account via RLS,
and recently-viewed ids come from the client's own localStorage (already
established in Part 2) rather than a server-side tracking table.

## 53. AI prompt-injection protection

`IntentSchema.strict()` rejects any field the schema doesn't explicitly
define (§65, §92's `"sql": "DROP TABLE products"` example) — the parsed
object either matches the exact allowed shape or the whole extraction is
treated as a failure and falls back. The AI never constructs SQL, ever
(§55) — `runIntentQuery()` only reads named, typed, bounded fields off
the validated object into parameterized Supabase query-builder calls.

## 54. AI security

Summarized: structured output (JSON Schema) + independent Zod
re-validation (§35, §36) + strict rejection of unknown fields (§53) +
no direct SQL generation (§53) + provider-failure fallback (§37, §50) +
minimized data sent to providers (§52) + never fabricates commerce facts
because it never touches commerce data directly (§34).

## 55. Cache strategy

Only two things are cached anywhere in this phase: AI structured intent
(`ai_intent_cache`, 6h TTL, versioned key) and nothing else — no price,
availability, affiliate URL, or commission value is ever cached (§84).
`deals`/categories/brands are not explicitly cached this phase (no
caching layer was added for them) — they're cheap, indexed lookups
already.

## 56. Performance

Admin product search uses the trigram GIN index (§8 above). Dashboard
aggregation is entirely database-side (`platform_performance()`,
`platform_daily_trend()`, both `SECURITY DEFINER` SQL functions) — no
raw event rows are loaded into the browser except the bounded
(≤5,000-row) top-products/partners tally, which is a deliberate,
documented scale tradeoff (§56 above notes it directly in the dashboard
route's own comment). Vector search uses HNSW (§43). No N+1 query
patterns were introduced in the admin list endpoints (each is a single
`select` with embedded relations).

## 57. Files created

```
supabase/migrations/0007_admin_audit_deals_content.sql
supabase/migrations/0008_automation.sql
supabase/migrations/0009_ai_search.sql

lib/admin/auth.js, step-up.js, audit.js
lib/automation/retry.js, dlq.js, jobs.js
lib/ai/schema.js, provider.js, cache.js, search-pipeline.js,
       recommendations.js, embeddings.js
lib/ai/providers/local.js, openai.js
lib/search/hybrid.js
lib/catalog/facets-static.js

app/admin/layout.js, page.js
app/admin/products/page.js, [id]/page.js
app/admin/categories/page.js
app/admin/brands/page.js
app/admin/offers/page.js
app/admin/partners/page.js, [id]/page.js
app/admin/deals/page.js
app/admin/content/page.js, [id]/page.js
app/admin/analytics/page.js
app/admin/conversions/page.js
app/admin/commissions/page.js
app/admin/automation/page.js
app/admin/ai/page.js
app/admin/audit-logs/page.js
app/admin/settings/page.js

components/admin/AdminShell.jsx, StepUpModal.jsx
components/catalog/AiSearchPanel.jsx

app/api/admin/step-up/route.js
app/api/admin/products/route.js, [id]/route.js, bulk/route.js
app/api/admin/categories/route.js, [id]/route.js
app/api/admin/brands/route.js, [id]/route.js
app/api/admin/partners/route.js, [id]/route.js
app/api/admin/offers/route.js, [id]/route.js, [id]/test-url/route.js, bulk/route.js
app/api/admin/deals/route.js, [id]/route.js
app/api/admin/content/route.js, [id]/route.js
app/api/admin/conversions/route.js
app/api/admin/commissions/route.js
app/api/admin/audit-logs/route.js
app/api/admin/dashboard/route.js
app/api/admin/automation/route.js
app/api/admin/dlq/route.js, [id]/route.js
app/api/admin/export/[resource]/route.js
app/api/cron/automation/route.js
app/api/ai/search/route.js
app/api/ai/recommendations/route.js

lib/admin/csv.js
vercel.json
```

## 58. Files modified

- `components/home/PersonalizedShell.jsx` — now an async Server Component
  wired to `getPersonalizedRecommendations()`, replacing the
  sign-in-only placeholder.
- `components/catalog/SearchPageBody.jsx` — added a "Search" / "Ask AI"
  mode toggle; the original deterministic search path is unchanged.
- `components/admin/AdminShell.jsx` — nav extended to all 14 route areas
  (categories, brands, content, analytics, conversions, commissions,
  settings added alongside the original six).
- `app/admin/products/page.js` — added a CSV export link.
- `app/api/admin/dlq/[id]/route.js` — replay dispatch generalized from
  `offer_refresh`-only to a small registry also covering
  `embeddings_backfill`.
- `lib/automation/jobs.js` — added `replayEmbeddingsBackfillItem()`,
  `runEmbeddingsBackfill()` registered in `KNOWN_JOBS`.
- `lib/ai/providers/local.js` — bare "outfit" (no explicit count) now
  defaults `outfit_count` to 2, so "college outfit under ₹1500" (no
  digit) still routes to the outfit bundler, matching §90's test case.
- `lib/ai/search-pipeline.js` — `runIntentQuery()` now branches to
  `getOutfitRecommendation()` when `intent.outfit_count` is present,
  instead of only ever returning a flat product list.
- `lib/ai/recommendations.js` — `getOutfitRecommendation()`'s
  complementary-piece table is now keyed by occasion (college, office,
  party, ...) instead of a single fixed pairing.
- `middleware.js` — not modified this phase (Part 4's exclusions for
  `/go/*`/`/api/webhooks/*` already stand; `/admin/*`, `/api/admin/*`,
  and `/api/cron/*` intentionally still go through session-refresh
  middleware — the cron route ignores any session anyway and relies on
  its own bearer-token check, so this is harmless, not a security gap).
- `.env.local.example` — added `STEP_UP_SECRET`, `AI_PROVIDER`,
  `OPENAI_API_KEY`, `OPENAI_INTENT_MODEL`, `CRON_SECRET`.
- `package.json` — added `zod`.

## 59. Dependencies added

`zod` (^3.23.8) — AI intent runtime validation. Nothing else; HMAC/crypto
reuse Node's built-in `node:crypto` (same as Part 4).

## 60. Database migrations

`0007_admin_audit_deals_content.sql`, `0008_automation.sql`,
`0009_ai_search.sql` — apply in that order, after 0001–0006. `0009`
requires the `vector` extension to be available on the target Postgres
instance (standard on Supabase); if unavailable, only that file's
`create extension`/`product_embeddings`/`hybrid_search` statements fail —
`0007`/`0008` are fully independent and the storefront's search already
falls back to FTS-only (§44) if `hybrid_search` doesn't exist.

## 61. Known limitations

- **No real affiliate network product-feed integration** — `runOfferRefresh()`
  performs a genuine HTTP liveness check per store (exercising the full
  lock/retry/backoff/DLQ pattern for real) but does not fetch actual
  price/availability data from an external API, since no real network
  endpoint was available to integrate against in this environment. This
  mirrors Part 4's own documented scope cut (only a `generic` webhook
  adapter, no real network wired up).
- **Embeddings are placeholder vectors, not real semantic embeddings** —
  `lib/ai/embeddings.js`'s `generateEmbedding()` is explicitly documented
  as a deterministic hash-derived stand-in (no network access to call a
  real embedding API in this environment). The entire pgvector/HNSW/RRF
  pipeline is real and functional; the *semantic quality* of vector
  ranking is not, until a real embedding model is wired in (the seam for
  doing so is one function body, documented in that file).
- **`AI_PROVIDER=local` by default** — the shipped, always-available
  intent extractor is rule-based (regex/keyword), not a language model.
  It handles the phase's own test-matrix examples (§90-92: color, price,
  fit, occasion, outfit count) but is meaningfully less capable than a
  real LLM at open-ended phrasing. The OpenAI adapter is a complete,
  documented integration seam, inactive without a key — it has not been
  exercised against the real OpenAI API in this environment either (no
  network access here to test it), so treat it as reviewed-but-unrun.
- **DLQ replay is wired for `offer_refresh` and `embeddings_backfill`
  only** (§28) — the pure-SQL jobs (price-drop detection, deal
  recalculation, price-alert check) never enqueue a DLQ item in the first
  place, so there's nothing job-specific to replay for them; this is a
  narrower, documented scope rather than a partial implementation.
- **The scheduled-execution mechanism (`vercel.json` + `/api/cron/automation`)
  assumes a Vercel deployment target** — it's the mechanism the project's
  existing stack (Next.js App Router, `@supabase/ssr`) most directly
  supports; a non-Vercel deployment would need an equivalent
  scheduler (e.g. a hosted cron service or GitHub Actions on a schedule)
  pointed at the same authenticated endpoint instead.
- **Outfit recommendation uses a small, hand-written occasion→subcategory
  table** (`lib/ai/recommendations.js`), not a learned model — reasonable
  for the catalog's current size and occasion vocabulary, but it won't
  generalize to an occasion word it doesn't recognize (falls back to a
  sensible default pairing rather than failing, §57).
- **Build was not verified with `next build`** in this environment (no
  network access to install `node_modules` — confirmed unavailable even
  on this pass: `curl` to the npm registry returns `403
  host_not_allowed`). Every file was reviewed for balanced syntax
  (braces/parens) and cross-checked import-by-import against the actual
  exports of every module it imports from, but that is static review,
  not a real bundler/type-check/runtime pass. Run
  `npm install && npm run build` before deploying, and apply migrations
  `0007`–`0009` against a real Supabase project (in order) before
  exercising the admin/automation/AI flows.
- **No dedicated variant/image drag-and-drop UI** — variant and image
  management (§13, §14) work through the product edit page's structured
  JSON-shaped fields (full-replacement arrays sent in the same `PATCH`
  as core product fields), not a polished drag-to-reorder/upload widget.
  Functionally complete, not a refined editing experience.

## 62. Known issues

None identified in manual review beyond the limitations above. The
security-critical items (audit immutability at the privilege level, RLS
on every new table, step-up gating, Zod strict-mode rejection of
injected fields) were written carefully and cross-checked against the
phase's own test matrix (§78-§96) by inspection, but — as with every
previous phase — could not be exercised against a live Postgres instance
or a running Next.js server in this sandboxed environment. Please run
the phase's actual test matrix (especially §93 audit-immutability and
§94 step-up) against a real deployment before relying on this system.

## 63. Exact requirements for PART 6

- A real SEO pass (meta tags, sitemap, structured data) — not addressed
  this phase, explicitly Part 6's territory per the phase spec's own
  scope boundaries.
- Production build verification (`next build`, in an environment with
  network access) — every phase from Part 2 onward has deferred this for
  the same sandboxing reason; Part 6 is the natural place to finally run
  it and fix whatever surfaces.
- The full end-to-end security/regression audit across all five phases
  (§78-§96 style testing) against a real, running deployment.
- A decision on whether to build a real network-adapter integration and
  a real embedding provider (§61's remaining gaps) before or after
  Part 6, since neither blocks Part 6's own SEO/performance/deployment
  scope.
- If real AI/embedding provider credentials become available, wiring
  `lib/ai/providers/openai.js` and `lib/ai/embeddings.js`'s real-model
  path should happen before any AI-quality claims are made publicly.

## 64. Architectural decisions

- **Two job-locking shapes, not one** (§21-22) — chose honesty over a
  uniform-looking-but-technically-wrong single pattern. A pure
  transaction-scoped advisory lock cannot correctly wrap a job that calls
  an external HTTP endpoint; pretending otherwise would have been the
  "stale application-only lock" anti-pattern the phase spec explicitly
  warns against, just relabeled.
- **`deals` has no price column** (§16/§23) — the single design decision
  doing the most work to satisfy §23's "never let commission/promotion
  influence Best Price" requirement structurally rather than by
  convention.
- **`audit_logs` revokes writes from `service_role` too**, not just
  `authenticated`/`anon` (§20) — because `service_role` bypasses RLS
  entirely, an RLS-only immutability story would have been theater; the
  privilege-level revoke is what actually makes "append-only" true
  regardless of which client/role ends up touching the table.
- **Local AI provider is the default, not an afterthought** — chosen so
  the entire AI feature set (search, recommendations, structured
  validation, caching) is exercisable and demonstrably safe (schema
  rejection, fallback behavior) without requiring any external API key,
  matching §62's "do not make the entire website dependent on AI
  availability" as literally as possible.

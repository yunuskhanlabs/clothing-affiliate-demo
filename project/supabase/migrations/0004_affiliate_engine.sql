-- ============================================================================
-- CLOXTRO — PART 4 — Affiliate engine: clicks, conversions, commissions
-- ============================================================================
-- Reproducible, forward-only migration. Run after 0001–0003, via
-- `supabase db push` or the SQL editor.
--
-- Per PHASE-3-CONTEXT.md §27 ("Exact requirements for PART 4"): `stores`
-- and `offers` already model Product → Offer → Partner. This migration
-- EXTENDS `stores` (new nullable columns for tracking config) and
-- `product_listing` (adds the winning offer's id + a deterministic
-- tie-break), and adds NEW tables for everything click/conversion/
-- commission-shaped. No table here duplicates anything from 0001/0002.
--
-- See PHASE-4-CONTEXT.md for the narrative explanation of every decision
-- referenced in the comments below.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PARTNER LIFECYCLE — add `suspended` (§5). `entity_status` (0001) only
--    had active/inactive; a partnership can also be temporarily suspended
--    (e.g. a network pauses a program) without being permanently
--    deactivated. Additive, non-destructive — existing rows are
--    unaffected.
-- ----------------------------------------------------------------------------

alter type entity_status add value if not exists 'suspended';

-- ----------------------------------------------------------------------------
-- 2. AFFILIATE NETWORK / TRACKING CONFIG — extends `stores` (§5, §6, §9).
--
-- Distinguishes Partner/Merchant (the `stores` row itself) from
-- Affiliate Network/Source (`affiliate_network` — e.g. "direct",
-- "impact", "cj", "admitad", "generic"). `tracking_param_name` +
-- `tracking_param_template` are the per-store "affiliate_url_template"
-- config the phase spec asks for (§9): different networks expect the
-- ClickID in different query parameters (`subid1`, `clickid`,
-- `custom_id`, ...) — this is configured per store, never hardcoded
-- globally. `network_ids` holds whatever additional identifiers a given
-- integration needs (merchant id, campaign id, publisher id) — only the
-- keys actually required by that integration are stored, per §6's "only
-- store identifiers actually required" instruction.
-- ----------------------------------------------------------------------------

alter table stores
  add column if not exists affiliate_network text not null default 'direct',
  add column if not exists tracking_param_name text not null default 'subid1',
  add column if not exists tracking_param_template text not null default '{click_id}',
  add column if not exists network_ids jsonb not null default '{}'::jsonb;

comment on column stores.affiliate_network is
  'Which affiliate source this store is reached through: direct | a named network/aggregator. Not a foreign key — the network adapter registry (lib/affiliate/network-adapters) is keyed by this string.';
comment on column stores.tracking_param_name is
  'Query-string parameter name this store''s affiliate links expect the ClickID in (e.g. subid1, clickid, custom_id, aff_sub). Configured per store — never hardcoded in redirect code.';
comment on column stores.tracking_param_template is
  'Kept for documentation/audit parity with the phase spec''s "affiliate_url_template" concept (e.g. "{click_id}"). The redirect route always injects the raw click_uuid; this column is not currently interpolated beyond that placeholder, since no integration needs more than the bare ID yet.';

-- ----------------------------------------------------------------------------
-- 3. PRODUCT_LISTING VIEW — add the winning offer's id (so a product card
--    can link its CTA straight to `/go/{offer_id}`, §39) and a
--    deterministic third sort key for the best-offer LATERAL join (§33.5
--    "if two offers have the same price, use a deterministic
--    tie-breaker" — 0001's view only sorted by availability then price,
--    which is ambiguous on an exact tie). This is a `create or replace
--    view`, not a new view — same object, extended.
-- ----------------------------------------------------------------------------

create or replace view product_listing as
select
  p.id,
  p.name,
  p.slug,
  p.description,
  b.name as brand,
  b.slug as brand_slug,
  dept.slug as category,
  sub.slug as subcategory,
  sub.name as subcategory_name,
  p.status,
  p.rating,
  p.review_count,
  p.material,
  p.fit,
  p.occasion,
  p.tags,
  p.search_vector,
  best.id as offer_id,
  best.price,
  best.original_price,
  case
    when best.original_price is not null and best.original_price > 0 and best.original_price > best.price
      then round(((best.original_price - best.price) / best.original_price) * 100)
    else 0
  end as discount_percentage,
  best.currency,
  best.status as offer_status,
  best.affiliate_url,
  st.id as store_id,
  st.name as store,
  img.url as primary_image_url,
  variant_agg.colors,
  variant_agg.sizes,
  p.created_at,
  p.updated_at
from products p
join brands b on b.id = p.brand_id
join categories dept on dept.id = p.department_id
left join categories sub on sub.id = p.subcategory_id
left join lateral (
  select o.*
  from offers o
  where o.product_id = p.id
  order by
    (o.status = 'available') desc,  -- prefer an available offer
    o.price asc,                    -- then cheapest
    o.id asc                        -- deterministic tie-break (§33.5)
  limit 1
) best on true
left join stores st on st.id = best.store_id
left join lateral (
  select url
  from product_images pi
  where pi.product_id = p.id
  order by pi.is_primary desc, pi.position asc
  limit 1
) img on true
left join lateral (
  select
    coalesce(jsonb_agg(distinct jsonb_build_object('name', v.color_name, 'hex', v.color_hex)) filter (where v.color_name is not null), '[]'::jsonb) as colors,
    coalesce(array_agg(distinct v.size) filter (where v.size is not null), '{}') as sizes
  from product_variants v
  where v.product_id = p.id
) variant_agg on true;

comment on view product_listing is
  'Read-adapter for the frontend Product shape. Part 4 addition: offer_id/store_id of the winning (best-price) offer, plus a deterministic o.id tie-break, so ProductCard can link straight to /go/{offer_id}.';

-- ----------------------------------------------------------------------------
-- 4. AFFILIATE_CLICKS — one row per redirect attempt (§12).
--
-- click_uuid is the externally-meaningful "ClickID" injected into the
-- outbound affiliate URL (§9/§10) — a separate surrogate `id` exists too
-- so other tables can reference it as a normal FK target without leaking
-- the tracking-facing identifier into every join (not that it's secret,
-- just conventional separation between "internal PK" and "external
-- correlation ID").
--
-- offer_id/product_id/store_id: RESTRICT, matching 0001's delete
-- philosophy — click history must never silently vanish because an offer
-- was archived (§8, §44).
-- user_id: SET NULL — losing the auth account shouldn't destroy the
-- click record, just anonymize which account it belonged to.
-- ----------------------------------------------------------------------------

create table affiliate_clicks (
  id               uuid primary key default gen_random_uuid(),
  click_uuid        uuid not null default gen_random_uuid(),
  offer_id          uuid not null references offers(id) on delete restrict,
  product_id        uuid not null references products(id) on delete restrict,
  store_id          uuid not null references stores(id) on delete restrict,
  user_id           uuid references auth.users(id) on delete set null,
  session_id        text,                    -- anonymous, privacy-conscious visitor id (cookie) — never IP/PII (§13, §43)
  is_bot            boolean not null default false,
  user_agent        text,
  referrer          text,
  tracking_param    text,                    -- which param name the ClickID was actually injected into, for audit
  redirect_status   text not null default 'redirected'
                       check (redirect_status in ('redirected', 'blocked', 'error')),
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  unique (click_uuid)
);

comment on table affiliate_clicks is
  'Raw click events — never deduplicated/deleted (§15). "Unique clicks" (§14) is a derived query, not a stored flag: see partner_performance()/product_performance() below, which count distinct coalesce(user_id, session_id) per scope. Bot events are preserved here and excluded only in the derived human-metric queries (§12 bot analytics rule).';

create index idx_affiliate_clicks_offer_created on affiliate_clicks(offer_id, created_at desc);
create index idx_affiliate_clicks_product_created on affiliate_clicks(product_id, created_at desc);
create index idx_affiliate_clicks_store_created on affiliate_clicks(store_id, created_at desc);
create index idx_affiliate_clicks_is_bot on affiliate_clicks(is_bot);
create index idx_affiliate_clicks_visitor on affiliate_clicks(offer_id, session_id, created_at desc) where is_bot = false;

-- ----------------------------------------------------------------------------
-- 5. PRODUCT_VIEWS — separate from affiliate_clicks (§25); denominator for
--    CTR (§26). Same raw-event-preserved / bot-flagged shape as clicks.
-- ----------------------------------------------------------------------------

create table product_views (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products(id) on delete restrict,
  user_id      uuid references auth.users(id) on delete set null,
  session_id   text,
  is_bot       boolean not null default false,
  referrer     text,
  created_at   timestamptz not null default now()
);

comment on table product_views is
  'CTR denominator (§26). Recorded via POST /api/track/view, fired client-side with keepalive and never awaited/blocking (§25 "must not degrade UX").';

create index idx_product_views_product_created on product_views(product_id, created_at desc);
create index idx_product_views_is_bot on product_views(is_bot);
create index idx_product_views_visitor on product_views(product_id, session_id, created_at desc) where is_bot = false;

-- ----------------------------------------------------------------------------
-- 6. CONVERSIONS (§17). Tolerant of partial attribution — click_id,
--    offer_id and product_id are all nullable because not every network
--    guarantees product-level or click-level correlation (§17, §52).
--
-- Idempotency (§23): unique on (network, store_id, external_transaction_id)
-- — the documented uniqueness rule. A second webhook delivery for the
-- same transaction UPSERTs (status can legitimately progress
-- pending → approved → paid across multiple deliveries), it does not
-- duplicate the row. Literal replay of the identical event is instead
-- caught one layer up, by `webhook_events` (§7 below) — the two
-- mechanisms serve different purposes: webhook_events stops re-processing
-- an identical delivery, this constraint stops two DIFFERENT deliveries
-- about the same transaction from becoming two conversions.
-- ----------------------------------------------------------------------------

create type conversion_status as enum ('pending', 'approved', 'rejected');

create table conversions (
  id                      uuid primary key default gen_random_uuid(),
  network                 text not null,
  store_id                uuid not null references stores(id) on delete restrict,
  offer_id                uuid references offers(id) on delete restrict,
  product_id              uuid references products(id) on delete restrict,
  click_id                uuid references affiliate_clicks(id) on delete set null,
  external_click_ref      text,             -- raw sub-id string the network returned, kept even if it didn't resolve to a known click_uuid (§53 reconciliation)
  external_transaction_id text not null,
  order_value             numeric(10,2),
  currency                text not null default 'INR',
  status                  conversion_status not null default 'pending',
  raw_payload             jsonb,            -- normalized webhook payload, secrets stripped (§20 "do not log secrets")
  occurred_at             timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (network, store_id, external_transaction_id)
);

comment on table conversions is
  'A conversion is NOT a commission (§3, §18) — see commissions below. click_id is set only when external_click_ref matched a known affiliate_clicks.click_uuid; a non-matching or absent sub-id still creates a valid, partially-attributed conversion row (§16, §17).';

create trigger trg_conversions_updated_at
  before update on conversions
  for each row execute function set_updated_at();

create index idx_conversions_store_created on conversions(store_id, created_at desc);
create index idx_conversions_offer_created on conversions(offer_id, created_at desc);
create index idx_conversions_product_created on conversions(product_id, created_at desc);
create index idx_conversions_status_created on conversions(status, created_at desc);
create index idx_conversions_click_id on conversions(click_id) where click_id is not null;

-- ----------------------------------------------------------------------------
-- 7. COMMISSIONS (§18, §19) — separate lifecycle from conversion status,
--    1:1 with a conversion in this phase (a network may later report
--    adjustments; documented as a known limitation in PHASE-4-CONTEXT.md
--    rather than modeled as a 1:many now — see §22 "don't build every
--    network integration now").
-- ----------------------------------------------------------------------------

create type commission_status as enum ('pending', 'approved', 'rejected', 'paid');

create table commissions (
  id                      uuid primary key default gen_random_uuid(),
  conversion_id           uuid not null references conversions(id) on delete restrict,
  store_id                uuid not null references stores(id) on delete restrict,
  offer_id                uuid references offers(id) on delete restrict,
  product_id              uuid references products(id) on delete restrict,
  amount                  numeric(10,2) not null check (amount >= 0),
  currency                text not null default 'INR',
  status                  commission_status not null default 'pending',
  external_commission_ref text,
  approved_at             timestamptz,
  paid_at                 timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (conversion_id)
);

comment on table commissions is
  'pending → approved → paid, or pending → rejected (§18). Amounts use numeric(10,2), never float (§19). Never written by application code except the webhook ingestion route, using the service-role client — see RLS section.';

create trigger trg_commissions_updated_at
  before update on commissions
  for each row execute function set_updated_at();

create index idx_commissions_store_created on commissions(store_id, created_at desc);
create index idx_commissions_status_created on commissions(status, created_at desc);
create index idx_commissions_product_created on commissions(product_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 8. WEBHOOK_EVENTS — replay protection + delivery ledger (§20, §21).
--
-- Idempotency key is `(network, external_event_id)` when the network
-- provides one; falls back to `(network, payload_hash)` (sha256 of the
-- raw request body) when it doesn't. Both are enforced as partial unique
-- indexes rather than one combined UNIQUE, since exactly one of the two
-- is populated per row.
-- ----------------------------------------------------------------------------

create table webhook_events (
  id                 uuid primary key default gen_random_uuid(),
  network             text not null,
  external_event_id   text,
  payload_hash        text not null,
  status              text not null default 'processed'
                         check (status in ('processed', 'rejected', 'duplicate')),
  received_at         timestamptz not null default now()
);

comment on table webhook_events is
  'One row per accepted (post-signature-verification) webhook delivery attempt, keyed for replay detection (§21). Rejected-signature requests are NOT inserted here — they never reach the point where a network/event identity has been verified, so logging them here would let an attacker probe the idempotency table with garbage.';

create unique index uidx_webhook_events_network_event
  on webhook_events(network, external_event_id) where external_event_id is not null;
create unique index uidx_webhook_events_network_hash
  on webhook_events(network, payload_hash) where external_event_id is null;
create index idx_webhook_events_received_at on webhook_events(received_at desc);

-- ============================================================================
-- 9. ROW LEVEL SECURITY (§44 — CRITICAL)
--
-- None of the tables in this migration have a public/authenticated SELECT
-- policy. That is intentional, not an oversight: commercially sensitive
-- affiliate analytics must not be readable by ordinary users (§44).
-- Every write in this phase happens through app/go/**, app/api/track/**,
-- and app/api/webhooks/** — all server-only Route Handlers using
-- `getSupabaseAdminClient()` (service-role, bypasses RLS by design — see
-- lib/supabase/admin.js's own header comment). RLS is still enabled on
-- every table below as defense-in-depth: if a bug ever caused one of
-- these tables to be queried with the anon/user client instead, the
-- default-deny posture means it fails closed (returns nothing) rather
-- than leaking data.
-- ============================================================================

alter table affiliate_clicks enable row level security;
alter table product_views enable row level security;
alter table conversions enable row level security;
alter table commissions enable row level security;
alter table webhook_events enable row level security;

create policy "admins can read affiliate clicks" on affiliate_clicks for select using (is_admin(auth.uid()));
create policy "admins can read product views" on product_views for select using (is_admin(auth.uid()));
create policy "admins can read conversions" on conversions for select using (is_admin(auth.uid()));
create policy "admins can read commissions" on commissions for select using (is_admin(auth.uid()));
create policy "admins can read webhook events" on webhook_events for select using (is_admin(auth.uid()));

-- No INSERT/UPDATE/DELETE policy exists for any role on any of these five
-- tables — not even admins — because every write is meant to happen via
-- the service-role client from trusted server code (redirect route,
-- view-tracking route, webhook route), never directly from a browser
-- session regardless of role. This mirrors 0001's treatment of
-- price_history (§18 there): RLS denies all direct writes; only
-- server-only code with the service-role key can insert.

-- ============================================================================
-- 10. ANALYTICS FUNCTIONS — database-side aggregation (§30, §31, §47).
--
-- Both are SECURITY DEFINER + STABLE so they can be called from a
-- service-role or admin-authenticated context without re-checking RLS
-- inside the function body (the calling Route Handler is what enforces
-- "admin only" — see app/api/admin/analytics/**, is_admin(auth.uid())
-- check before calling). Never call these from client-side/anon code.
--
-- CTR/EPC definitions (§26, §27), fixed here so both functions compute
-- them identically:
--   CTR = human affiliate clicks / human product views × 100
--   EPC = total commission (all statuses, "estimated") / human affiliate clicks
-- Both return NULL (not 0, not an error) when the denominator is zero,
-- so the caller can render "not enough data" instead of a misleading 0%.
-- "Unique human clicks" = count of distinct coalesce(user_id::text,
-- session_id) among non-bot clicks in the window — see §14's file-header
-- note above affiliate_clicks for why this is a per-range distinct-visitor
-- count rather than a rolling per-click window (documented simplification,
-- "configurable later" per the phase spec).
-- ============================================================================

create or replace function partner_performance(p_store_id uuid, p_from timestamptz, p_to timestamptz)
returns table (
  product_views bigint,
  human_clicks bigint,
  unique_human_clicks bigint,
  bot_clicks bigint,
  conversions bigint,
  pending_commission numeric,
  approved_commission numeric,
  paid_commission numeric,
  ctr numeric,
  epc numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with scoped_clicks as (
    select * from affiliate_clicks
    where store_id = p_store_id and created_at >= p_from and created_at < p_to
  ),
  scoped_views as (
    select pv.*
    from product_views pv
    where pv.is_bot = false
      and pv.created_at >= p_from and pv.created_at < p_to
      and exists (select 1 from offers o where o.product_id = pv.product_id and o.store_id = p_store_id)
  ),
  scoped_conversions as (
    select * from conversions
    where store_id = p_store_id and created_at >= p_from and created_at < p_to
  ),
  scoped_commissions as (
    select c.* from commissions c
    join scoped_conversions sc on sc.id = c.conversion_id
  ),
  view_count as (select count(*)::bigint as n from scoped_views),
  human_click_count as (select count(*)::bigint as n from scoped_clicks where is_bot = false),
  unique_click_count as (select count(distinct coalesce(user_id::text, session_id))::bigint as n from scoped_clicks where is_bot = false),
  bot_click_count as (select count(*)::bigint as n from scoped_clicks where is_bot = true),
  conversion_count as (select count(*)::bigint as n from scoped_conversions),
  commission_totals as (
    select
      coalesce(sum(amount) filter (where status = 'pending'), 0) as pending,
      coalesce(sum(amount) filter (where status = 'approved'), 0) as approved,
      coalesce(sum(amount) filter (where status = 'paid'), 0) as paid,
      coalesce(sum(amount), 0) as total
    from scoped_commissions
  )
  select
    v.n, h.n, u.n, b.n, c.n,
    t.pending, t.approved, t.paid,
    case when v.n > 0 then round((h.n::numeric / v.n::numeric) * 100, 2) else null end,
    case when h.n > 0 then round(t.total / h.n::numeric, 2) else null end
  from view_count v, human_click_count h, unique_click_count u, bot_click_count b, conversion_count c, commission_totals t;
$$;

comment on function partner_performance is
  'Partner performance for one store over [p_from, p_to). "Product views" is scoped to products that have at least one offer with this store (views themselves are not store-specific). All rates return NULL on a zero denominator (never divide by zero, §27).';

create or replace function product_performance(p_product_id uuid, p_from timestamptz, p_to timestamptz)
returns table (
  product_views bigint,
  human_clicks bigint,
  bot_clicks bigint,
  conversions bigint,
  total_commission numeric,
  ctr numeric,
  epc numeric,
  best_offer_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with scoped_views as (
    select * from product_views
    where product_id = p_product_id and is_bot = false and created_at >= p_from and created_at < p_to
  ),
  scoped_clicks as (
    select * from affiliate_clicks
    where product_id = p_product_id and created_at >= p_from and created_at < p_to
  ),
  scoped_conversions as (
    select * from conversions
    where product_id = p_product_id and created_at >= p_from and created_at < p_to
  ),
  scoped_commissions as (
    select c.* from commissions c
    join scoped_conversions sc on sc.id = c.conversion_id
  ),
  view_count as (select count(*)::bigint as n from scoped_views),
  human_click_count as (select count(*)::bigint as n from scoped_clicks where is_bot = false),
  bot_click_count as (select count(*)::bigint as n from scoped_clicks where is_bot = true),
  conversion_count as (select count(*)::bigint as n from scoped_conversions),
  commission_total as (select coalesce(sum(amount), 0) as total from scoped_commissions),
  best as (
    select o.id from offers o
    where o.product_id = p_product_id
    order by (o.status = 'available') desc, o.price asc, o.id asc
    limit 1
  )
  select
    v.n, h.n, b.n, c.n, t.total,
    case when v.n > 0 then round((h.n::numeric / v.n::numeric) * 100, 2) else null end,
    case when h.n > 0 then round(t.total / h.n::numeric, 2) else null end,
    (select id from best)
  from view_count v, human_click_count h, bot_click_count b, conversion_count c, commission_total t;
$$;

comment on function product_performance is
  'Product performance across all its stores/offers combined, over [p_from, p_to). best_offer_id mirrors product_listing''s best-offer rule (§33) for convenience.';

-- Both functions are SECURITY DEFINER, so they bypass RLS internally by
-- design (that's how they aggregate across all users' click/conversion
-- data) — which means Postgres's default EXECUTE grant to PUBLIC would
-- otherwise let ANY authenticated or anon caller invoke them directly via
-- PostgREST/RPC and read commercially sensitive analytics, regardless of
-- the tables' own RLS policies. Revoke that default and grant execution
-- only to the service role — app/api/admin/analytics/** additionally
-- re-checks is_admin() in application code (defense in depth, §44).
revoke execute on function partner_performance(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function product_performance(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function partner_performance(uuid, timestamptz, timestamptz) to service_role;
grant execute on function product_performance(uuid, timestamptz, timestamptz) to service_role;

-- ============================================================================
-- End of 0004_affiliate_engine.sql
-- ============================================================================

-- ============================================================================
-- CLOXTRO — PART 5 — Admin platform: audit log, deals, content, dashboard
-- ============================================================================
-- Extends the Part 3 role/RLS foundation (`profiles.role`, `is_admin()`)
-- and the Part 4 analytics functions. No existing table is duplicated —
-- `deals` and `content_articles` are genuinely new concepts; everything
-- else here is either a new logging/aggregation structure or an index.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. AUDIT LOG — §26/§27. Append-only by DATABASE privilege, not
--    application convention.
--
-- actor_id: SET NULL, not RESTRICT/CASCADE — an audit row must survive
-- even if the admin account that made the change is later deleted; the
-- log is the historical record, losing the FK target shouldn't lose the
-- row (§26 "who did what" stays readable via actor_email, captured at
-- write time, even once actor_id no longer resolves to a live account).
-- ----------------------------------------------------------------------------

create table audit_logs (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid references auth.users(id) on delete set null,
  actor_email   text,                    -- captured at write time, survives actor deletion
  action        text not null,           -- e.g. 'product.updated', 'offer.price_changed', 'partner.credentials_changed'
  entity_type   text not null,           -- e.g. 'product', 'offer', 'store', 'deal', 'settings'
  entity_id     uuid,
  metadata      jsonb not null default '{}'::jsonb,  -- non-sensitive context only — see comment below
  step_up_used  boolean not null default false,       -- was this action gated behind step-up re-auth (§6)?
  created_at    timestamptz not null default now()
);

comment on table audit_logs is
  'Append-only administrative action log (§26). NEVER store passwords, API secrets, tokens, HMAC secrets, or other authentication material in `metadata` — see log_admin_action() below, which is the only sanctioned write path. Immutability is enforced by database privilege (§27), not by omitting an UPDATE button in the UI.';

create index idx_audit_logs_created_at on audit_logs(created_at desc);
create index idx_audit_logs_entity on audit_logs(entity_type, entity_id, created_at desc);
create index idx_audit_logs_actor on audit_logs(actor_id, created_at desc);

alter table audit_logs enable row level security;

create policy "admins can read audit logs" on audit_logs for select using (is_admin(auth.uid()));
-- No INSERT policy for authenticated/anon roles — see log_admin_action()
-- below, a SECURITY DEFINER function that is the only way an admin
-- session can add a row (it runs as the function owner, not the calling
-- role, so it doesn't need its own RLS INSERT policy to succeed). No
-- UPDATE/DELETE policy exists for ANY role, admin included — that is
-- reinforced by explicit privilege revocation next, so the guarantee
-- doesn't rely on RLS alone.

-- ---- Database-level immutability (§27 — the actual enforcement). ----
-- Postgres/Supabase grant broad default privileges (including on
-- `service_role`, which bypasses RLS entirely) — RLS alone would NOT stop
-- a service-role-authenticated client from updating or deleting a row.
-- Revoking UPDATE/DELETE at the privilege level closes that gap
-- regardless of which role/client ends up querying this table.
revoke update, delete on audit_logs from authenticated, anon, service_role;
-- INSERT also revoked directly from every role — the only sanctioned
-- write path is log_admin_action() below, which runs as the (trusted)
-- function owner and is itself never exposed for arbitrary parameters
-- from the client (the API route constructs its arguments server-side).
revoke insert on audit_logs from authenticated, anon, service_role;

create or replace function log_admin_action(
  p_actor_id uuid,
  p_actor_email text,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb,
  p_step_up_used boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.role() <> 'service_role' and not is_admin(auth.uid()) then
    raise exception 'Access denied: log_admin_action requires admin privileges';
  end if;

  insert into audit_logs (actor_id, actor_email, action, entity_type, entity_id, metadata, step_up_used)
  values (p_actor_id, p_actor_email, p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb), p_step_up_used)
  returning id into v_id;
  return v_id;
end;
$$;

comment on function log_admin_action is
  'The ONLY way to create an audit_logs row (table INSERT is revoked from every role, §27). SECURITY DEFINER: runs with the function owner''s privilege, so it succeeds despite the revoked table grants. Called exclusively from lib/admin/audit.js on the server, after the calling admin has already been authorized — this function does not itself re-check is_admin(), by design: it is a logging primitive, not an authorization boundary.';

revoke execute on function log_admin_action from public, anon;
grant execute on function log_admin_action to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. DEALS — curation/labeling, NEVER a pricing mechanism (§21-§23).
--
-- A deal row never stores a price — it references an offer and a label.
-- The displayed price always comes fresh from `offers`/`product_listing`.
-- This is what makes it structurally impossible for a "Featured" deal to
-- silently become a false "Best Price" claim (§23): the deal table has no
-- price column to disagree with the real one.
-- ----------------------------------------------------------------------------

create type deal_label as enum ('featured', 'todays_deal', 'seasonal', 'limited_time', 'sponsored');

create table deals (
  id            uuid primary key default gen_random_uuid(),
  offer_id      uuid not null references offers(id) on delete cascade,
  label         deal_label not null,
  headline      text,
  starts_at     timestamptz not null default now(),
  ends_at       timestamptz,             -- null = no fixed end (admin removes manually)
  is_active     boolean not null default true,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (offer_id, label)
);

comment on table deals is
  'Admin curation only (§21-§23) — a label like "featured" or "sponsored", never a price override. Eligibility for actually being SHOWN as a deal is re-checked at read time against the offer''s live status/price (see get_active_deals() below) — a deal row being present does not guarantee display if the underlying offer has since gone unavailable.';

create trigger trg_deals_updated_at
  before update on deals
  for each row execute function set_updated_at();

create index idx_deals_active on deals(is_active, label, starts_at desc);
create index idx_deals_offer on deals(offer_id);

alter table deals enable row level security;
create policy "deals are publicly readable" on deals for select using (is_active);
create policy "admins can read all deals" on deals for select using (is_admin(auth.uid()));
create policy "admins can write deals" on deals for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

create or replace function get_active_deals(p_label deal_label default null, p_limit int default 24)
returns table (
  deal_id uuid, label deal_label, headline text,
  product_id uuid, product_name text, product_slug text,
  offer_id uuid, price numeric, original_price numeric, discount_percentage numeric,
  primary_image_url text, store text
)
language sql
stable
as $$
  select
    d.id, d.label, d.headline,
    p.id, p.name, p.slug,
    o.id, o.price, o.original_price,
    case when o.original_price is not null and o.original_price > o.price and o.original_price > 0
      then round(((o.original_price - o.price) / o.original_price) * 100) else 0 end,
    (select url from product_images pi where pi.product_id = p.id order by pi.is_primary desc, pi.position asc limit 1),
    st.name
  from deals d
  join offers o on o.id = d.offer_id
  join products p on p.id = o.product_id
  join stores st on st.id = o.store_id
  where d.is_active
    and (d.ends_at is null or d.ends_at > now())
    and (p_label is null or d.label = p_label)
    -- eligibility re-checked live (§22): a stale deal row for an offer
    -- that has since gone unavailable, or a product that's been
    -- archived, is simply excluded here rather than shown incorrectly.
    and o.status = 'available'
    and p.status = 'active'
    and st.status = 'active'
  order by d.starts_at desc
  limit p_limit;
$$;

comment on function get_active_deals is
  'Public-facing deal listing — re-validates offer/product/store eligibility live (§22), never trusts the deals row alone. This is what the storefront /deals experience and any admin preview should call, not a raw `select * from deals`.';

grant execute on function get_active_deals to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. CONTENT FOUNDATION (§24, §25) — lightweight, not a full CMS.
-- ----------------------------------------------------------------------------

create type content_status as enum ('draft', 'published', 'archived');

create table content_articles (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  slug           text not null unique,
  excerpt        text,
  body           text,                   -- markdown; rendering stays a frontend concern
  featured_image text,
  status         content_status not null default 'draft',
  author_id      uuid references auth.users(id) on delete set null,
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger trg_content_articles_updated_at
  before update on content_articles
  for each row execute function set_updated_at();

create index idx_content_articles_status on content_articles(status, published_at desc);

-- Structured product references (§25) — never hardcode a product URL
-- into article body when this relation can be used instead, so product
-- data (price, availability) shown alongside the article stays current.
create table content_article_products (
  article_id  uuid not null references content_articles(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  position    int not null default 0,
  primary key (article_id, product_id)
);

alter table content_articles enable row level security;
alter table content_article_products enable row level security;

create policy "published articles are publicly readable" on content_articles
  for select using (status = 'published' and published_at is not null and published_at <= now());
create policy "admins can read all articles" on content_articles
  for select using (is_admin(auth.uid()));
create policy "admins can write articles" on content_articles for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

create policy "article-product links follow article visibility" on content_article_products
  for select using (
    exists (
      select 1 from content_articles a
      where a.id = article_id
        and (is_admin(auth.uid()) or (a.status = 'published' and a.published_at <= now()))
    )
  );
create policy "admins can write article-product links" on content_article_products for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 4. PLATFORM-WIDE DASHBOARD METRICS (§8, §9) — the site-total analogue
--    of Part 4's per-store/per-product functions, which don't cover
--    "totals across everything" (the Admin Dashboard's headline numbers).
-- ----------------------------------------------------------------------------

create or replace function platform_performance(p_from timestamptz, p_to timestamptz)
returns table (
  total_products bigint,
  active_products bigint,
  out_of_stock_products bigint,
  archived_products bigint,
  total_offers bigint,
  active_partners bigint,
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
  with scoped_views as (
    select * from product_views where is_bot = false and created_at >= p_from and created_at < p_to
  ),
  scoped_clicks as (
    select * from affiliate_clicks where created_at >= p_from and created_at < p_to
  ),
  scoped_conversions as (
    select * from conversions where created_at >= p_from and created_at < p_to
  ),
  scoped_commissions as (
    select c.* from commissions c join scoped_conversions sc on sc.id = c.conversion_id
  )
  select
    (select count(*) from products),
    (select count(*) from products where status = 'active'),
    (select count(*) from products where status = 'out_of_stock'),
    (select count(*) from products where status = 'archived'),
    (select count(*) from offers),
    (select count(*) from stores where status = 'active'),
    (select count(*) from scoped_views),
    (select count(*) from scoped_clicks where is_bot = false),
    (select count(distinct coalesce(user_id::text, session_id)) from scoped_clicks where is_bot = false),
    (select count(*) from scoped_clicks where is_bot = true),
    (select count(*) from scoped_conversions),
    coalesce((select sum(amount) from scoped_commissions where status = 'pending'), 0),
    coalesce((select sum(amount) from scoped_commissions where status = 'approved'), 0),
    coalesce((select sum(amount) from scoped_commissions where status = 'paid'), 0),
    case when (select count(*) from scoped_views) > 0
      then round((select count(*) from scoped_clicks where is_bot = false)::numeric / (select count(*) from scoped_views)::numeric * 100, 2)
      else null end,
    case when (select count(*) from scoped_clicks where is_bot = false) > 0
      then round(coalesce((select sum(amount) from scoped_commissions), 0) / (select count(*) from scoped_clicks where is_bot = false)::numeric, 2)
      else null end;
$$;

comment on function platform_performance is
  'Site-wide dashboard headline numbers (§8, §9) — catalog counts are point-in-time (not date-ranged, a product''s current status is what it is "today"); traffic/commission figures are scoped to [p_from, p_to) like Part 4''s per-store/per-product functions. Never divides by zero (§10); pending/approved/paid always reported separately, never summed into one "revenue" figure (§10 "never present pending as paid").';

revoke execute on function platform_performance(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function platform_performance(timestamptz, timestamptz) to service_role;

-- Trend series for dashboard charts (§9) — daily buckets, database-side.
create or replace function platform_daily_trend(p_from timestamptz, p_to timestamptz)
returns table (day date, human_clicks bigint, conversions bigint, commission numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    d::date as day,
    coalesce((select count(*) from affiliate_clicks c where c.is_bot = false and c.created_at >= d and c.created_at < d + interval '1 day'), 0),
    coalesce((select count(*) from conversions cv where cv.created_at >= d and cv.created_at < d + interval '1 day'), 0),
    coalesce((select sum(cm.amount) from commissions cm join conversions cv2 on cv2.id = cm.conversion_id where cv2.created_at >= d and cv2.created_at < d + interval '1 day'), 0)
  from generate_series(date_trunc('day', p_from), date_trunc('day', p_to), interval '1 day') as d
  order by day;
$$;

revoke execute on function platform_daily_trend(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function platform_daily_trend(timestamptz, timestamptz) to service_role;

-- ----------------------------------------------------------------------------
-- 5. ADMIN PRODUCT SEARCH INDEX (§69) — plain database lookup, not AI.
--    `pg_trgm` was already enabled in 0001 and explicitly earmarked for
--    this ("admin typo-tolerant lookups later, not wired here" — this is
--    that wiring).
-- ----------------------------------------------------------------------------

create index if not exists idx_products_name_trgm on products using gin (name gin_trgm_ops);
create index if not exists idx_product_variants_sku_trgm on product_variants using gin (sku gin_trgm_ops);

-- ============================================================================
-- End of 0007_admin_audit_deals_content.sql
-- ============================================================================

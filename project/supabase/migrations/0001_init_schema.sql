-- ============================================================================
-- CLOXTRO — PART 3 — Core schema migration
-- ============================================================================
-- Reproducible, forward-only migration. Run via `supabase db push` or the
-- Supabase SQL editor, in order with 0002_seed.sql (dev/test data only).
--
-- See PHASE-3-CONTEXT.md §3–§20 for the narrative explanation of every
-- design decision referenced in the comments below (price authority,
-- lifecycle, delete behavior, search architecture, indexing rationale).
-- ============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";    -- trigram fallback, not primary search path (used only for admin typo-tolerant lookups later, not wired here)

-- ----------------------------------------------------------------------------
-- 1. ENUMS — explicit, database-controlled lifecycle/status values
-- ----------------------------------------------------------------------------

-- Product lifecycle (§7). Soft states only — see delete-behavior notes below.
create type product_status as enum ('active', 'out_of_stock', 'archived');

-- Merchant/offer-level availability (§19). Intentionally distinct from
-- product_status: a product can be `active` while a specific store's offer
-- is `out_of_stock`, and an `archived` product may still carry a historical
-- `available` offer row that the catalog simply no longer surfaces.
create type offer_status as enum ('available', 'out_of_stock', 'unavailable', 'discontinued');

-- Generic active/inactive for reference tables (brands, stores).
create type entity_status as enum ('active', 'inactive');

-- Category taxonomy node kind — see §2 "categories" design note.
create type category_kind as enum ('department', 'subcategory');

-- Application-level authorization role (§24). Enforced via RLS policies
-- below, never by the frontend alone.
create type app_role as enum ('user', 'admin');

-- ----------------------------------------------------------------------------
-- 2. Shared trigger: keep `updated_at` current on every UPDATE
-- ----------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. CATEGORIES — one normalized table for both departments and
--    subcategories (§10).
--
-- Design note: Part 2's taxonomy is cross-department for subcategories —
-- `/categories/[slug]` shows a subcategory (e.g. "T-Shirts") across Men,
-- Women and Kids at once (PHASE-2-CONTEXT.md §25), and
-- `getAllSubcategorySlugs()` de-duplicates subcategory slugs globally.
-- A subcategory is therefore NOT nested under one department in the data
-- model; `parent_id` exists (self-referencing FK) so the table can express
-- parent/child relationships if a future phase wants department-scoped
-- subcategories, but for Part 3 every subcategory row has `parent_id null`
-- and every product row references a department row AND a subcategory row
-- independently (see `products` below). This matches the actual working
-- Part 2 UI rather than inventing a nesting the frontend doesn't use.
-- ----------------------------------------------------------------------------

create table categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  kind        category_kind not null,
  parent_id   uuid references categories(id) on delete set null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_categories_updated_at
  before update on categories
  for each row execute function set_updated_at();

create index idx_categories_kind on categories(kind);
create index idx_categories_parent_id on categories(parent_id) where parent_id is not null;

-- ----------------------------------------------------------------------------
-- 4. BRANDS (§11)
-- ----------------------------------------------------------------------------

create table brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  logo_url    text,
  status      entity_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_brands_updated_at
  before update on brands
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. STORES / AFFILIATE PARTNERS — foundation only, no click tracking (§15)
-- ----------------------------------------------------------------------------

create table stores (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  logo_url    text,
  base_url    text,
  status      entity_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_stores_updated_at
  before update on stores
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 6. PRODUCTS — product IDENTITY + catalog attributes only.
--
-- PRICE AUTHORITY DECISION (§6, §16, §17 — read before touching pricing):
-- This is a multi-merchant affiliate catalog — the same product can be
-- listed by several stores at several prices. `products` therefore holds
-- NO price/original_price/discount columns. The authoritative current
-- price for a given merchant is `offers.price` (see §8 below). A product's
-- single "display price" for cards/grids is derived (never stored) as the
-- best currently-available offer, via the `product_listing` view (§13).
-- This avoids exactly the conflicting-independent-prices problem the phase
-- spec warns against — there is only ever one place a price is written.
--
-- VARIANT PRICING DECISION (§12): variants (color/size) do NOT carry their
-- own price in this phase. Within one store's offer, all variants of a
-- product share that offer's price; only stock/availability varies per
-- variant. This is a deliberate simplification for an apparel catalog
-- (documented here and in PHASE-3-CONTEXT.md §8) — if a future phase needs
-- per-variant merchant pricing, add `variant_id` to `offers` rather than
-- introducing a second price column on `product_variants`.
-- ----------------------------------------------------------------------------

create table products (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  slug             text not null unique,
  description      text,
  brand_id         uuid not null references brands(id) on delete restrict,
  department_id    uuid not null references categories(id) on delete restrict,
  subcategory_id   uuid references categories(id) on delete set null,
  status           product_status not null default 'active',
  rating           numeric(2,1) not null default 0 check (rating >= 0 and rating <= 5),
  review_count     int not null default 0 check (review_count >= 0),
  material         text,
  fit              text,
  occasion         text,
  tags             text[] not null default '{}',
  -- Maintained by a trigger (not a generated column) because it needs
  -- brand/category NAMES from other tables — see §14 "why a trigger, not a
  -- generated column" note below §9.
  search_vector    tsvector,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint chk_department_is_department
    check (true) -- enforced by trigger below (cross-table check not expressible as a plain CHECK)
);

comment on table products is
  'Product identity + catalog attributes. Deliberately holds no price column — see file header. Never hard-delete; use `status`.';

create trigger trg_products_updated_at
  before update on products
  for each row execute function set_updated_at();

-- Enforce department_id actually points at a `kind = 'department'` row
-- (and subcategory_id, when set, at a `kind = 'subcategory'` row). A plain
-- CHECK constraint can't reference another table, so this is a small
-- BEFORE INSERT/UPDATE trigger instead.
create or replace function enforce_category_kinds()
returns trigger
language plpgsql
as $$
declare
  dept_kind category_kind;
  sub_kind category_kind;
begin
  select kind into dept_kind from categories where id = new.department_id;
  if dept_kind is distinct from 'department' then
    raise exception 'products.department_id must reference a categories row with kind = department';
  end if;

  if new.subcategory_id is not null then
    select kind into sub_kind from categories where id = new.subcategory_id;
    if sub_kind is distinct from 'subcategory' then
      raise exception 'products.subcategory_id must reference a categories row with kind = subcategory';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_products_enforce_category_kinds
  before insert or update of department_id, subcategory_id on products
  for each row execute function enforce_category_kinds();

-- ----------------------------------------------------------------------------
-- 7. PRODUCT VARIANTS (§12) — relational, not a JSON blob, so stock and
--    SKUs are independently queryable/constrainable per color+size.
-- ----------------------------------------------------------------------------

create table product_variants (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references products(id) on delete cascade,
  sku             text not null unique,
  color_name      text,
  color_hex       text,
  size            text,
  stock_quantity  int not null default 0 check (stock_quantity >= 0),
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (product_id, color_name, size)
);

comment on table product_variants is
  'product_id CASCADEs: variants have no meaning without their parent product row and products are soft-deleted (archived), never hard-deleted in normal operation, so this cascade only fires in exceptional admin data-maintenance cases (§44).';

create trigger trg_product_variants_updated_at
  before update on product_variants
  for each row execute function set_updated_at();

create index idx_product_variants_product_id on product_variants(product_id);

-- ----------------------------------------------------------------------------
-- 8. PRODUCT IMAGES (§13) — ordered, one primary per product, optionally
--    scoped to a variant (e.g. a color-specific shot).
-- ----------------------------------------------------------------------------

create table product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products(id) on delete cascade,
  variant_id   uuid references product_variants(id) on delete set null,
  url          text not null,
  alt_text     text,
  position     int not null default 0,
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now()
);

comment on table product_images is
  'product_id CASCADEs for the same reason as product_variants. variant_id SET NULL: losing the variant-specific association should not delete the image itself.';

create index idx_product_images_product_id on product_images(product_id, position);

-- Exactly one primary image per product.
create unique index uidx_product_images_one_primary
  on product_images(product_id)
  where is_primary;

-- ----------------------------------------------------------------------------
-- 9. OFFERS — the authoritative merchant-specific price (§16).
--
-- Product ──< Offer >── Store
--
-- product_id: RESTRICT, not CASCADE. A product should never be hard-deleted
-- while merchant offers reference it (§44) — archiving the product is the
-- correct operation; RESTRICT makes an accidental hard DELETE fail loudly
-- instead of silently destroying offer/price-history data.
-- store_id: RESTRICT for the same reason — a store should be deactivated
-- (`stores.status = 'inactive'`), not deleted, while it has offer history.
-- ----------------------------------------------------------------------------

create table offers (
  id                   uuid primary key default gen_random_uuid(),
  product_id           uuid not null references products(id) on delete restrict,
  store_id             uuid not null references stores(id) on delete restrict,
  external_product_id  text,
  price                numeric(10,2) not null check (price >= 0),
  original_price       numeric(10,2) check (original_price is null or original_price >= 0),
  currency             text not null default 'INR',
  affiliate_url        text,                        -- placeholder only, real redirect logic is Part 4
  status               offer_status not null default 'available',
  last_updated_at      timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (product_id, store_id)
);

comment on table offers is
  'Authoritative merchant price lives in offers.price — see products table header comment. discount % is derived (price vs original_price), never stored, to avoid a second inconsistent copy.';

create trigger trg_offers_updated_at
  before update on offers
  for each row execute function set_updated_at();

create index idx_offers_product_id on offers(product_id);
create index idx_offers_store_id on offers(store_id);

-- ----------------------------------------------------------------------------
-- 10. PRICE HISTORY (§18) — populated ONLY by the trigger in §11, never by
--     application code.
--
-- offer_id / product_id: RESTRICT. Deleting an offer that has price
-- history would silently destroy that history; the correct operation is
-- to move the offer to a terminal `offer_status` (e.g. `discontinued`),
-- not delete the row (§44).
-- ----------------------------------------------------------------------------

create table price_history (
  id                 uuid primary key default gen_random_uuid(),
  offer_id           uuid not null references offers(id) on delete restrict,
  product_id         uuid not null references products(id) on delete restrict, -- denormalized: avoids a join for the common "this product's price history" query
  previous_price     numeric(10,2),
  new_price          numeric(10,2) not null,
  currency           text not null,
  offer_status_at_change offer_status not null,
  changed_at         timestamptz not null default now()
);

create index idx_price_history_offer_id on price_history(offer_id, changed_at desc);
create index idx_price_history_product_id on price_history(product_id, changed_at desc);

-- ----------------------------------------------------------------------------
-- 11. AUTOMATED PRICE-HISTORY TRIGGER (§17 — REQUIRED)
--
-- Attached to `offers` because `offers.price` is the authoritative price
-- owner (see §6/§16 decision above). Fires AFTER UPDATE OF price, and only
-- inserts when the value genuinely changed (`OLD.price IS DISTINCT FROM
-- NEW.price` — the WHEN clause below makes this idempotent for no-op
-- UPDATEs without even invoking the function body). Runs inside the same
-- transaction as the UPDATE by construction (regular AFTER trigger), so
-- the price change and its history row are always consistent.
-- ----------------------------------------------------------------------------

create or replace function record_offer_price_history()
returns trigger
language plpgsql
as $$
begin
  insert into price_history (offer_id, product_id, previous_price, new_price, currency, offer_status_at_change)
  values (new.id, new.product_id, old.price, new.price, new.currency, new.status);
  return new;
end;
$$;

create trigger trg_offers_price_history
  after update of price on offers
  for each row
  when (old.price is distinct from new.price)
  execute function record_offer_price_history();

-- Also record an initial history row when an offer is first created, so a
-- product's very first price is part of its history timeline too.
create or replace function record_offer_initial_price()
returns trigger
language plpgsql
as $$
begin
  insert into price_history (offer_id, product_id, previous_price, new_price, currency, offer_status_at_change)
  values (new.id, new.product_id, null, new.price, new.currency, new.status);
  return new;
end;
$$;

create trigger trg_offers_initial_price_history
  after insert on offers
  for each row execute function record_offer_initial_price();

-- ----------------------------------------------------------------------------
-- 12. FULL-TEXT SEARCH — tsvector maintenance (§33)
--
-- WHY A TRIGGER, NOT A `generated always as (...) stored` COLUMN:
-- A generated column's expression must be immutable and cannot reference
-- other tables. `search_vector` needs to include the product's BRAND name
-- and CATEGORY names, which live in `brands`/`categories`, not on the
-- `products` row itself — so a pure generated column cannot express it.
-- This is the documented, safest database-native equivalent per the phase
-- spec's fallback allowance (§33): a small trigger keeps `search_vector`
-- in perfect sync on every INSERT/UPDATE of the fields that affect it,
-- and application code never touches the column directly.
--
-- Weights: name = A (highest), tags/brand = B, material/fit/occasion/
-- category names = C. This lets `ts_rank` prioritize name/tag matches.
-- ----------------------------------------------------------------------------

create or replace function products_refresh_search_vector()
returns trigger
language plpgsql
as $$
declare
  brand_name text;
  dept_name text;
  sub_name text;
begin
  select name into brand_name from brands where id = new.brand_id;
  select name into dept_name from categories where id = new.department_id;
  select name into sub_name from categories where id = new.subcategory_id;

  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(brand_name, '') || ' ' || coalesce(array_to_string(new.tags, ' '), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.material, '') || ' ' || coalesce(new.fit, '') || ' ' || coalesce(new.occasion, '') || ' ' || coalesce(dept_name, '') || ' ' || coalesce(sub_name, '')), 'C');

  return new;
end;
$$;

create trigger trg_products_search_vector
  before insert or update of name, brand_id, department_id, subcategory_id, material, fit, occasion, tags
  on products
  for each row execute function products_refresh_search_vector();

-- If a brand or category is renamed, dependent products' search_vector
-- needs refreshing too. Cheap at this data volume (§36); revisit with a
-- background job if the catalog grows into the "thousands+" range the
-- phase spec anticipates (§42).
create or replace function cascade_refresh_products_search_vector()
returns trigger
language plpgsql
as $$
begin
  -- Re-writing `name` to itself is a no-op for the data but fires
  -- `trg_products_search_vector` (declared as UPDATE OF ... name ...),
  -- which recomputes search_vector using the now-renamed brand/category.
  if tg_table_name = 'brands' then
    update products set name = name where brand_id = new.id;
  elsif tg_table_name = 'categories' then
    update products set name = name where department_id = new.id or subcategory_id = new.id;
  end if;
  return new;
end;
$$;

create trigger trg_brands_cascade_search
  after update of name on brands
  for each row execute function cascade_refresh_products_search_vector();

create trigger trg_categories_cascade_search
  after update of name on categories
  for each row execute function cascade_refresh_products_search_vector();

-- GIN index for the primary keyword-search path (§34).
create index idx_products_search_vector on products using gin(search_vector);

-- ----------------------------------------------------------------------------
-- 13. PRODUCT_LISTING VIEW — the adapter between the normalized schema and
--     the flat `Product` shape the Part 2 frontend already expects
--     (`lib/products/schema.js`). This is the single place price/discount
--     are derived from the authoritative `offers` row so no component ever
--     computes it independently (§31).
--
-- "Best offer" = lowest price among an `available` offer from an `active`
-- store for that product. Falls back to any offer if none are `available`
-- (so an out-of-stock product still renders a last-known price instead of
-- disappearing).
-- ----------------------------------------------------------------------------

create or replace view product_listing as
select
  p.id,
  p.name,
  p.slug,
  p.description,
  b.name as brand,
  b.slug as brand_slug,
  dept.slug as category,             -- "men" | "women" | "kids" — matches schema.js `category`
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
    o.price asc                     -- then cheapest
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
  'Read-adapter for the frontend Product shape (lib/products/schema.js). Price/discount are derived from the best current offer, never stored redundantly. Backing this view is products (GIN-indexed search_vector, composite-indexed status/department/brand) joined to a per-product LATERAL best-offer lookup, so filtered/searched queries still use the underlying indexes.';

-- ----------------------------------------------------------------------------
-- 14. COMPOSITE + SUPPORTING INDEXES (§36, §37)
--
-- Rationale is documented per-index because price now lives on `offers`,
-- not `products` — so the phase spec's literal "(category_id, status,
-- price)" example is adapted to this schema's actual price owner (see
-- PHASE-3-CONTEXT.md §19 "Indexing decisions" for the full explanation of
-- this deviation, per §56's "document explicitly" requirement).
-- ----------------------------------------------------------------------------

-- Catalog browse: WHERE department_id = ? AND status = ? ORDER BY created_at
create index idx_products_department_status_created
  on products(department_id, status, created_at desc);

-- Catalog browse: WHERE brand_id = ? AND status = ? ORDER BY created_at
create index idx_products_brand_status_created
  on products(brand_id, status, created_at desc);

-- /categories/[slug]: WHERE subcategory_id = ? AND status = ?
create index idx_products_subcategory_status
  on products(subcategory_id, status);

-- sort=rating / "Seasonal" homepage rail: WHERE status = ? ORDER BY rating
create index idx_products_status_rating
  on products(status, rating desc);

-- Price filtering/sorting happens by joining to offers — this is the
-- schema-accurate equivalent of the spec's "(category_id, status, price)"
-- composite: price_min/price_max and sort=price_* both filter/order on
-- offers.price for a given product/store, scoped by offer availability.
create index idx_offers_product_status_price
  on offers(product_id, status, price);

create index idx_offers_store_status_price
  on offers(store_id, status, price);

-- Product detail page + admin lookups.
-- (slug already has a unique index from the UNIQUE constraint on products.slug)

-- ----------------------------------------------------------------------------
-- 15. USER DOMAIN — profiles, roles
-- ----------------------------------------------------------------------------

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  avatar_url    text,
  role          app_role not null default 'user',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table profiles is
  'id CASCADEs from auth.users — this is the one legitimate cascade in the schema: a profile has no meaning without its auth user, and deleting the auth user is an explicit account-deletion action, not a soft-lifecycle event.';

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- Auto-create a profile row whenever a new Supabase Auth user is created.
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- SECURITY DEFINER helper so RLS policies can check "is this user an
-- admin?" without recursively re-triggering RLS on `profiles` itself.
create or replace function is_admin(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from profiles where id = uid and role = 'admin');
$$;

-- ----------------------------------------------------------------------------
-- 16. WISHLIST (§27)
--
-- user_id: CASCADE — this is the user's own data; if their account is
-- deleted the wishlist should go with it.
-- product_id: RESTRICT — a product must be archived, never hard-deleted,
-- while a wishlist row references it (§8/§26/§44). The UNIQUE constraint
-- is what prevents duplicate wishlist rows for the same user/product.
-- ----------------------------------------------------------------------------

create table wishlist_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  product_id  uuid not null references products(id) on delete restrict,
  created_at  timestamptz not null default now(),
  unique (user_id, product_id)
);

create index idx_wishlist_items_user_id on wishlist_items(user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 17. RECENTLY VIEWED (§28)
--
-- Logged-in only at the database layer — Part 2's localStorage fallback
-- for anonymous visitors stays exactly as-is on the frontend (§28); this
-- table is what the frontend syncs to once a session exists.
-- UNIQUE(user_id, product_id) + upsert-on-conflict (in the data-access
-- layer) keeps one row per product and just bumps `viewed_at`, so
-- re-viewing an item doesn't create duplicate/conflicting rows.
-- ----------------------------------------------------------------------------

create table recently_viewed (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  product_id  uuid not null references products(id) on delete restrict,
  viewed_at   timestamptz not null default now(),
  unique (user_id, product_id)
);

create index idx_recently_viewed_user_id on recently_viewed(user_id, viewed_at desc);

-- ----------------------------------------------------------------------------
-- 18. SAVED SEARCHES (§29)
--
-- `query_string` stores exactly what `filtersToQueryString()` (Part 2,
-- `lib/catalog/query-state.js`) produces — the same representation used in
-- the URL — so a saved search can be replayed by appending it to a
-- catalog basePath with zero translation layer.
-- ----------------------------------------------------------------------------

create table saved_searches (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text,
  query_string  text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_saved_searches_updated_at
  before update on saved_searches
  for each row execute function set_updated_at();

create index idx_saved_searches_user_id on saved_searches(user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 19. PRICE ALERT FOUNDATION (§30) — data model only, no notification
--     engine (that's Part 5). `offer_id` is nullable: a user may alert on
--     "this product, whichever store" (product-level) or a specific
--     store's offer.
-- ----------------------------------------------------------------------------

create table price_alerts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  product_id    uuid not null references products(id) on delete restrict,
  offer_id      uuid references offers(id) on delete restrict,
  target_price  numeric(10,2) not null check (target_price >= 0),
  is_enabled    boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_price_alerts_updated_at
  before update on price_alerts
  for each row execute function set_updated_at();

create index idx_price_alerts_user_id on price_alerts(user_id);
create index idx_price_alerts_product_id on price_alerts(product_id);

-- ============================================================================
-- 20. ROW LEVEL SECURITY (§25 — CRITICAL)
-- ============================================================================

alter table categories enable row level security;
alter table brands enable row level security;
alter table stores enable row level security;
alter table products enable row level security;
alter table product_variants enable row level security;
alter table product_images enable row level security;
alter table offers enable row level security;
alter table price_history enable row level security;
alter table profiles enable row level security;
alter table wishlist_items enable row level security;
alter table recently_viewed enable row level security;
alter table saved_searches enable row level security;
alter table price_alerts enable row level security;

-- ---- Public catalog data: readable by anyone (anon + authenticated). ----
-- Note (§26): this intentionally does NOT filter by product.status — an
-- archived product must stay readable so a user's wishlist can still show
-- its name/"no longer available" state. Excluding archived products from
-- *normal catalog discovery* is an application-query-layer rule (see
-- lib/products/index.js), not an RLS rule.

create policy "categories are publicly readable" on categories for select using (true);
create policy "brands are publicly readable" on brands for select using (true);
create policy "stores are publicly readable" on stores for select using (true);
create policy "products are publicly readable" on products for select using (true);
create policy "variants are publicly readable" on product_variants for select using (true);
create policy "images are publicly readable" on product_images for select using (true);
create policy "offers are publicly readable" on offers for select using (true);
create policy "price history is publicly readable" on price_history for select using (true);

-- ---- Admin-only writes on catalog tables (§24 role foundation). ----
-- Anon/authenticated non-admins have no INSERT/UPDATE/DELETE policy on
-- these tables at all, so RLS denies by default; only an authenticated
-- admin (or the server-only service-role key, which bypasses RLS
-- entirely) can write. This is the admin *foundation* only — Part 5
-- builds the actual admin UI on top of it.

create policy "admins can write categories" on categories for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy "admins can write brands" on brands for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy "admins can write stores" on stores for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy "admins can write products" on products for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy "admins can write variants" on product_variants for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy "admins can write images" on product_images for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy "admins can write offers" on offers for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
-- price_history has no write policy for anyone but the service role /
-- the SECURITY DEFINER trigger functions above, which run as the table
-- owner and bypass RLS — application code can never insert history rows
-- directly, by design (§18).

-- ---- profiles: a user can read/update only their own row. ----
create policy "users can view their own profile" on profiles
  for select using (auth.uid() = id);
create policy "users can update their own profile" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
-- No user-facing INSERT policy — rows are created by handle_new_auth_user().
create policy "admins can view all profiles" on profiles
  for select using (is_admin(auth.uid()));

-- ---- wishlist_items: strictly own-rows-only. ----
create policy "users can view their own wishlist" on wishlist_items
  for select using (auth.uid() = user_id);
create policy "users can add to their own wishlist" on wishlist_items
  for insert with check (auth.uid() = user_id);
create policy "users can remove from their own wishlist" on wishlist_items
  for delete using (auth.uid() = user_id);

-- ---- recently_viewed: strictly own-rows-only. ----
create policy "users can view their own recently viewed" on recently_viewed
  for select using (auth.uid() = user_id);
create policy "users can record their own recently viewed" on recently_viewed
  for insert with check (auth.uid() = user_id);
create policy "users can update their own recently viewed" on recently_viewed
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users can clear their own recently viewed" on recently_viewed
  for delete using (auth.uid() = user_id);

-- ---- saved_searches: strictly own-rows-only. ----
create policy "users can view their own saved searches" on saved_searches
  for select using (auth.uid() = user_id);
create policy "users can create their own saved searches" on saved_searches
  for insert with check (auth.uid() = user_id);
create policy "users can update their own saved searches" on saved_searches
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users can delete their own saved searches" on saved_searches
  for delete using (auth.uid() = user_id);

-- ---- price_alerts: strictly own-rows-only. ----
create policy "users can view their own price alerts" on price_alerts
  for select using (auth.uid() = user_id);
create policy "users can create their own price alerts" on price_alerts
  for insert with check (auth.uid() = user_id);
create policy "users can update their own price alerts" on price_alerts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users can delete their own price alerts" on price_alerts
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- End of 0001_init_schema.sql
-- ============================================================================

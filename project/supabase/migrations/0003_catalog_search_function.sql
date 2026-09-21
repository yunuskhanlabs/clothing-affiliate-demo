-- ============================================================================
-- CLOXTRO — PART 3 — catalog_search() RPC
-- ============================================================================
-- Why an RPC instead of building the query with the PostgREST query
-- builder directly against `product_listing` (§31, §38):
-- color/size filters need to match against JSON/array columns derived
-- from `product_variants`, and relevance sort needs `ts_rank` against the
-- full-text `search_vector` — both are awkward-to-impossible to express
-- through PostgREST's flat filter syntax. A single SQL function keeps the
-- ENTIRE filter → search → sort → paginate pipeline server-side and
-- transactionally consistent, and is the one place `app/api/products`
-- calls into (§32, §41).
--
-- Parameters mirror `lib/catalog/query-state.js`'s `filters` object
-- field-for-field (see PHASE-3-CONTEXT.md §24 "Filter → query mapping")
-- so the API route layer is a thin pass-through, not a second filter
-- implementation.
-- ============================================================================

create or replace function catalog_search(
  p_category      text default null,
  p_subcategory   text default null,
  p_brands        text[] default null,
  p_colors        text[] default null,
  p_sizes         text[] default null,
  p_price_min     numeric default null,
  p_price_max     numeric default null,
  p_rating        numeric default null,
  p_discount      numeric default null,
  p_material      text default null,
  p_fit           text default null,
  p_occasion      text default null,
  p_new           boolean default false,
  p_trending      boolean default false,
  p_bestseller    boolean default false,
  p_query         text default null,
  p_sort          text default 'relevance',
  p_limit         int default 12,
  p_offset        int default 0
)
returns table (
  id                  uuid,
  name                text,
  slug                text,
  description         text,
  brand               text,
  brand_slug          text,
  category            text,
  subcategory         text,
  subcategory_name    text,
  status              product_status,
  rating              numeric,
  review_count        int,
  material            text,
  fit                 text,
  occasion            text,
  tags                text[],
  price               numeric,
  original_price      numeric,
  discount_percentage numeric,
  currency            text,
  offer_status        offer_status,
  affiliate_url       text,
  store               text,
  primary_image_url   text,
  colors              jsonb,
  sizes               text[],
  created_at          timestamptz,
  updated_at          timestamptz,
  total_count         bigint
)
language sql
stable
as $$
  with base as (
    select
      pl.*,
      case
        when p_query is not null and p_query <> ''
          then ts_rank(pl.search_vector, websearch_to_tsquery('english', p_query))
        else 0
      end as rank
    from product_listing pl
    where pl.status = 'active'  -- normal discovery excludes archived (§26); out_of_stock still shown, badge handles the rest
      and (p_category is null or p_category = '' or pl.category = p_category)
      and (p_subcategory is null or p_subcategory = '' or pl.subcategory = p_subcategory)
      and (p_brands is null or array_length(p_brands, 1) is null or lower(pl.brand) = any(p_brands))
      and (
        p_colors is null or array_length(p_colors, 1) is null or exists (
          select 1 from jsonb_array_elements(pl.colors) c where lower(c ->> 'name') = any(p_colors)
        )
      )
      and (
        p_sizes is null or array_length(p_sizes, 1) is null or exists (
          select 1 from unnest(pl.sizes) sz where lower(sz) = any(p_sizes)
        )
      )
      and (p_price_min is null or pl.price >= p_price_min)
      and (p_price_max is null or pl.price <= p_price_max)
      and (p_rating is null or pl.rating >= p_rating)
      and (p_discount is null or pl.discount_percentage >= p_discount)
      and (p_material is null or p_material = '' or lower(pl.material) = p_material)
      and (p_fit is null or p_fit = '' or lower(pl.fit) = p_fit)
      and (p_occasion is null or p_occasion = '' or lower(pl.occasion) = p_occasion)
      and (not p_new or 'new' = any(pl.tags))
      and (not p_trending or 'trending' = any(pl.tags))
      and (not p_bestseller or 'bestseller' = any(pl.tags))
      and (p_query is null or p_query = '' or pl.search_vector @@ websearch_to_tsquery('english', p_query))
  ),
  counted as (
    select count(*) over () as total_count, base.*
    from base
  )
  select
    counted.id, counted.name, counted.slug, counted.description, counted.brand, counted.brand_slug,
    counted.category, counted.subcategory, counted.subcategory_name, counted.status, counted.rating,
    counted.review_count, counted.material, counted.fit, counted.occasion, counted.tags,
    counted.price, counted.original_price, counted.discount_percentage, counted.currency,
    counted.offer_status, counted.affiliate_url, counted.store, counted.primary_image_url,
    counted.colors, counted.sizes, counted.created_at, counted.updated_at, counted.total_count
  from counted
  order by
    case when p_sort = 'price_asc' then counted.price end asc nulls last,
    case when p_sort = 'price_desc' then counted.price end desc nulls last,
    case when p_sort = 'discount' then counted.discount_percentage end desc nulls last,
    case when p_sort = 'rating' then counted.rating end desc nulls last,
    case when p_sort = 'newest' then counted.created_at end desc nulls last,
    case when p_sort = 'popular' then counted.review_count end desc nulls last,
    case when p_sort = 'relevance' and p_query is not null and p_query <> '' then counted.rank end desc nulls last,
    counted.created_at desc
  limit p_limit offset p_offset;
$$;

comment on function catalog_search is
  'Single server-side entry point for catalog filter+search+sort+pagination (§31/§32/§38/§41). Called via supabase.rpc from app/api/products/route.js. See PHASE-3-CONTEXT.md §24.';

grant execute on function catalog_search to anon, authenticated;

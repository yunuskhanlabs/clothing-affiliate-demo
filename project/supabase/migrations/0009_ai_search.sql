-- ============================================================================
-- CLOXTRO — PART 5 — AI intent cache + hybrid (FTS + pgvector) search
-- ============================================================================
-- §38-§44, §51-§53. PART 3's `tsvector` + GIN full-text search
-- (`product_listing.search_vector`, `catalog_search()`) is NOT touched —
-- this migration only ADDS an optional semantic layer alongside it.
-- Every function here degrades gracefully: `hybrid_search()` with a null
-- embedding behaves as FTS-only, and the application layer
-- (`lib/search/hybrid.js`) falls back to plain `catalog_search()` if this
-- extension/table is unavailable or an RPC call errors (§44).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. AI INTENT CACHE (§51-§53).
--
-- Caches ONLY the structured intent object — never price, availability,
-- affiliate URLs, or any other volatile commerce fact (§52). Every read
-- of this cache is followed by a fresh database query for actual
-- products/offers (see lib/ai/search-pipeline.js) — this table has no
-- foreign keys into products/offers at all, which is a structural
-- guarantee, not just a policy, that it can't become a stale-commerce-data
-- cache by accident.
-- ----------------------------------------------------------------------------

create table ai_intent_cache (
  cache_key         text primary key,   -- sha256(normalized_query + schema_version + model_version), see lib/ai/cache.js
  normalized_query   text not null,
  schema_version     text not null,
  model_version      text not null,
  intent             jsonb not null,     -- the validated (post-Zod) structured intent object only
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null
);

comment on table ai_intent_cache is
  'Normalized-query -> validated structured intent only (§51). NEVER holds price/availability/affiliate data (§52) — there is no column here that could hold it, by design. Bounded TTL via expires_at (§53); cache_key already embeds schema_version/model_version so a prompt or schema change naturally misses the cache instead of serving a stale-shape intent (§53 "versioned cache key rather than relying only on manual deletion").';

create index idx_ai_intent_cache_expires on ai_intent_cache(expires_at);

alter table ai_intent_cache enable row level security;
-- No policy for any session role at all — this is an internal
-- performance cache for the server-side AI pipeline, never queried
-- directly by a browser session. Only the service-role client (used
-- exclusively from lib/ai/cache.js, server-only) reads/writes it.
revoke all on ai_intent_cache from authenticated, anon;
grant select, insert, delete on ai_intent_cache to service_role;

-- A cheap periodic cleanup — callable by the same automation surface as
-- the other jobs in 0008, not required for correctness (expired rows are
-- simply never returned by lib/ai/cache.js's expiry check) but keeps the
-- table from growing unbounded.
create or replace function purge_expired_intent_cache()
returns int
language sql
security definer
set search_path = public
as $$
  with deleted as (delete from ai_intent_cache where expires_at < now() returning 1)
  select count(*)::int from deleted;
$$;

revoke execute on function purge_expired_intent_cache from public, anon, authenticated;
grant execute on function purge_expired_intent_cache to service_role;

-- ----------------------------------------------------------------------------
-- 2. PGVECTOR SEMANTIC LAYER (§39-§41, §83).
--
-- Separate table, not a column on `products` (§41 "the database product
-- record remains authoritative" — keeping the embedding structurally
-- outside `products` reinforces that it's a derived ranking artifact,
-- not part of the product's factual record). If this extension is
-- unavailable on the target Postgres instance, this single statement is
-- the only thing that fails to apply — every other Part 5 migration
-- file is independent of it (see PHASE-5-CONTEXT.md §43 vector
-- dimension/index rationale).
-- ----------------------------------------------------------------------------

create extension if not exists vector;

create table product_embeddings (
  product_id     uuid primary key references products(id) on delete cascade,
  embedding      vector(384) not null,   -- see PHASE-5-CONTEXT.md §43 for why 384
  source_hash    text not null,          -- sha256 of the exact text that was embedded — detects staleness (§41)
  model_version  text not null default 'placeholder-v1',
  updated_at     timestamptz not null default now()
);

comment on table product_embeddings is
  'Optional semantic-search ranking signal (§39-41). `source_hash` lets the backfill job (lib/ai/embeddings.js) skip re-embedding unchanged products and detect when a product''s embeddable text has drifted from what''s indexed (§41 "avoid stale embeddings becoming the permanent source of truth" — the product row itself is always re-read fresh at query time regardless of embedding staleness, since embeddings only affect ranking, never the returned product/offer data).';

-- HNSW over IVFFlat (§83): this dataset is small (a few hundred mock
-- products) and IVFFlat''s clustering quality depends on having enough
-- training vectors present relative to its `lists` parameter at index
-- build time — awkward for a table that starts empty and is backfilled
-- asynchronously. HNSW has no such training-set-size sensitivity and
-- gives good recall at this scale with its library defaults
-- (m=16, ef_construction=64) — documented tradeoff: HNSW index build/
-- insert is more memory-hungry per-row than IVFFlat, which only matters
-- at a catalog size far beyond what this phase's mock/seed data reaches.
-- Distance metric: cosine (`vector_cosine_ops`) — the conventional choice
-- for sentence-embedding-style vectors, matching most embedding models'
-- own training objective.
create index idx_product_embeddings_hnsw on product_embeddings using hnsw (embedding vector_cosine_ops);

alter table product_embeddings enable row level security;
create policy "admins can read embeddings" on product_embeddings for select using (is_admin(auth.uid()));
revoke insert, update, delete on product_embeddings from authenticated, anon;
grant insert, update, delete on product_embeddings to service_role;
-- hybrid_search() below is SECURITY DEFINER, so it can read this table
-- to rank results for anon/authenticated callers without a public SELECT
-- policy existing on the table itself — the embedding VALUES are never
-- returned to the client, only used server-side to order rows.

-- ----------------------------------------------------------------------------
-- 3. HYBRID SEARCH — RRF fusion of FTS rank + vector rank (§39, §42, §43).
--
-- Same return shape as catalog_search() (0003/0006) plus rrf_score, so
-- the frontend can reuse the exact same row mapper. `p_query_embedding`
-- is nullable — when null (no AI/embedding available), this degrades to
-- pure FTS ranking, which is exactly PART 3's existing behavior (§44
-- fallback). Filters (category/subcategory/price) are applied INSIDE
-- both the fts and vec CTEs, before fusion — so a semantically-similar
-- but out-of-budget or wrong-category product is excluded before ranking
-- even begins, not ranked-then-filtered (§43 "must never override
-- factual filters").
-- ----------------------------------------------------------------------------

create or replace function hybrid_search(
  p_query            text default null,
  p_query_embedding  vector(384) default null,
  p_category         text default null,
  p_subcategory      text default null,
  p_price_min        numeric default null,
  p_price_max        numeric default null,
  p_limit            int default 24,
  p_rrf_k            int default 60
)
returns table (
  id uuid, name text, slug text, description text, brand text, brand_slug text,
  category text, subcategory text, subcategory_name text, status product_status,
  rating numeric, review_count int, material text, fit text, occasion text, tags text[],
  offer_id uuid, price numeric, original_price numeric, discount_percentage numeric,
  currency text, offer_status offer_status, affiliate_url text, store text,
  primary_image_url text, colors jsonb, sizes text[],
  created_at timestamptz, updated_at timestamptz, rrf_score numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select pl.* from product_listing pl
    where pl.status = 'active'
      and (p_category is null or p_category = '' or pl.category = p_category)
      and (p_subcategory is null or p_subcategory = '' or pl.subcategory = p_subcategory)
      and (p_price_min is null or pl.price >= p_price_min)
      and (p_price_max is null or pl.price <= p_price_max)
  ),
  fts as (
    select s.id, row_number() over (order by ts_rank(s.search_vector, websearch_to_tsquery('english', p_query)) desc) as rnk
    from scoped s
    where p_query is not null and p_query <> '' and s.search_vector @@ websearch_to_tsquery('english', p_query)
    limit 200
  ),
  vec as (
    select s.id, row_number() over (order by pe.embedding <=> p_query_embedding) as rnk
    from scoped s
    join product_embeddings pe on pe.product_id = s.id
    where p_query_embedding is not null
    limit 200
  ),
  fused as (
    select coalesce(fts.id, vec.id) as id,
           coalesce(1.0 / (p_rrf_k + fts.rnk), 0) + coalesce(1.0 / (p_rrf_k + vec.rnk), 0) as rrf_score
    from fts
    full outer join vec on fts.id = vec.id
  )
  select
    s.id, s.name, s.slug, s.description, s.brand, s.brand_slug, s.category, s.subcategory,
    s.subcategory_name, s.status, s.rating, s.review_count, s.material, s.fit, s.occasion, s.tags,
    s.offer_id, s.price, s.original_price, s.discount_percentage, s.currency, s.offer_status,
    s.affiliate_url, s.store, s.primary_image_url, s.colors, s.sizes, s.created_at, s.updated_at,
    f.rrf_score
  from fused f
  join scoped s on s.id = f.id
  order by
    -- when neither query nor embedding was provided, fall back to newest
    -- first rather than an arbitrary/undefined ordering
    case when p_query is null and p_query_embedding is null then s.created_at end desc nulls last,
    f.rrf_score desc
  limit p_limit;
$$;

comment on function hybrid_search is
  'RRF fusion of tsvector rank and pgvector cosine-distance rank (§42). rrf_score = sum of 1/(k+rank) across whichever of FTS/vector actually matched a row — a row present in only one list still scores (partial fusion), matching standard RRF. Filters are pre-applied in the `scoped` CTE, before either ranking, per §43.';

revoke execute on function hybrid_search from public;
grant execute on function hybrid_search to anon, authenticated, service_role;

-- ============================================================================
-- End of 0009_ai_search.sql
-- ============================================================================

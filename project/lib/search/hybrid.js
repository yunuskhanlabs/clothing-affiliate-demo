import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { queryProductCatalog } from "@/lib/products";
import { mapListingRowToProduct } from "@/lib/products/mappers";
import { generateEmbedding } from "@/lib/ai/embeddings";

/** True when the app is running against a dummy/absent Supabase URL (demo mode). */
const IS_DEMO_MODE =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes("dummy-demo") ||
  process.env.DEMO_MODE === "true";

/**
 * Hybrid search entry point (§39, §42). Tries `hybrid_search()` (FTS +
 * pgvector RRF, see 0009_ai_search.sql) with a freshly-generated query
 * embedding; falls back to plain `catalog_search()` (PART 3's
 * deterministic FTS) if embedding generation fails, the RPC errors, or
 * pgvector/product_embeddings isn't populated yet (§44 "the website must
 * remain usable without semantic infrastructure").
 *
 * Filters are passed straight through to the SQL function's own
 * WHERE-clause parameters (§43) — this function does not re-rank or
 * post-filter in application code, so there's no path where a
 * semantically-similar-but-filtered-out row could sneak back in.
 *
 * @param {{ query?: string, filters?: object, limit?: number }} params
 */
export async function hybridSearch({ query, filters = {}, limit = 24 }) {
  // DEMO_MODE: no real Supabase — go straight to the in-memory catalog.
  if (IS_DEMO_MODE) {
    const fallback = await queryProductCatalog(
      { q: query, subcategory: filters.subcategory, category: filters.category, price_min: filters.price_min, price_max: filters.price_max, sort: filters.sort || "relevance" },
      { page: 1, pageSize: limit }
    );
    return { products: fallback.products, total: fallback.total, mode: "fallback" };
  }

  const supabase = getSupabaseServerClient();

  let embedding = null;
  if (query) {
    try {
      embedding = await generateEmbedding(query);
    } catch (err) {
      console.warn("generateEmbedding failed, continuing FTS-only:", err.message); // §44 — never fatal
    }
  }

  try {
    const { data, error } = await supabase.rpc("hybrid_search", {
      p_query: query || null,
      p_query_embedding: embedding,
      p_category: filters.category || null,
      p_subcategory: filters.subcategory || null,
      p_price_min: filters.price_min ?? null,
      p_price_max: filters.price_max ?? null,
      p_limit: limit,
    });

    if (error) throw new Error(error.message);

    return { products: (data || []).map(mapListingRowToProduct), total: data?.length || 0, mode: embedding ? "hybrid" : "fts_only" };
  } catch (err) {
    // §44: pgvector/hybrid_search unavailable for any reason (extension
    // missing, function not yet migrated, transient DB error) — fall
    // back to the plain deterministic catalog search rather than
    // breaking product discovery.
    console.warn("hybridSearch falling back to catalog_search:", err.message);
    const fallback = await queryProductCatalog(
      { q: query, subcategory: filters.subcategory, category: filters.category, price_min: filters.price_min, price_max: filters.price_max, sort: filters.sort || "relevance" },
      { page: 1, pageSize: limit }
    );
    return { products: fallback.products, total: fallback.total, mode: "fallback" };
  }
}

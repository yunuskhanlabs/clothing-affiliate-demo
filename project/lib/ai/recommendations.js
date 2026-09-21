import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapListingRowToProduct } from "@/lib/products/mappers";
import { getAllProducts } from "@/lib/products";

/**
 * Returns true when running in standalone-demo mode (no real Supabase URL
 * configured). All recommendation functions short-circuit to mock data so
 * that no TCP connection is attempted to dummy-demo.supabase.co.
 */
const IS_DEMO_MODE =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes("dummy-demo") ||
  process.env.DEMO_MODE === "true";

/**
 * Recommendation engine (§56-§61). Every function here returns rows
 * pulled straight from `product_listing` (already filtered to
 * `status = 'active'` and a live `offer_status = 'available'` join) —
 * there is no code path that invents a product, price, or availability
 * (§56 "must only return existing products, valid active offers, real
 * prices, real availability"; §61 hallucination control).
 *
 * Ranking never reads commission/conversion data (§58 "do not rank
 * purely by affiliate commission") — these queries simply don't join
 * those tables, the same structural guarantee used for Best Price in
 * Part 4/§35.
 */

async function fetchActiveListingRows(supabase, { ids, category, subcategory, priceMax, excludeIds = [], limit = 8 }) {
  let query = supabase.from("product_listing").select("*").eq("status", "active").not("offer_id", "is", null).limit(limit);
  if (ids?.length) query = query.in("id", ids);
  if (category) query = query.eq("category", category);
  if (subcategory) query = query.eq("subcategory", subcategory);
  if (priceMax !== undefined && priceMax !== null) query = query.lte("price", priceMax);
  if (excludeIds.length) query = query.not("id", "in", `(${excludeIds.join(",")})`);
  const { data, error } = await query;
  if (error) {
    console.error("fetchActiveListingRows:", error.message);
    return [];
  }
  return data || [];
}

/**
 * §57: falls back to non-personalized popularity signals when there's
 * not enough history for a given user/session — a new visitor still gets
 * useful recommendations, never an empty or fabricated result.
 */
async function popularFallback(supabase, { excludeIds = [], limit = 8 } = {}) {
  let query = supabase.from("product_listing").select("*").eq("status", "active").not("offer_id", "is", null).order("review_count", { ascending: false }).limit(limit);
  if (excludeIds.length) query = query.not("id", "in", `(${excludeIds.join(",")})`);
  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

/**
 * @param {{ userId?: string, recentlyViewedIds?: string[], wishlistProductIds?: string[] }} signals
 */
export async function getPersonalizedRecommendations(signals = {}, limit = 8) {
  // DEMO_MODE: skip all Supabase network calls — return mock products immediately.
  if (IS_DEMO_MODE) {
    const all = await getAllProducts({ limit });
    return { products: all.slice(0, limit), personalized: false, reason: "demo_mode" };
  }

  const supabase = getSupabaseServerClient();
  const seedIds = [...(signals.recentlyViewedIds || []), ...(signals.wishlistProductIds || [])];

  if (seedIds.length === 0) {
    const rows = await popularFallback(supabase, { limit });
    return { products: rows.map(mapListingRowToProduct), personalized: false, reason: "no_history" };
  }

  // Similarity signal: same category/subcategory as what the user has
  // actually looked at/saved — a simple, explainable heuristic (§60),
  // not a black-box model.
  const { data: seedRows } = await supabase.from("product_listing").select("id, category, subcategory").in("id", seedIds);
  const categories = [...new Set((seedRows || []).map((r) => r.category).filter(Boolean))];
  const subcategories = [...new Set((seedRows || []).map((r) => r.subcategory).filter(Boolean))];

  let query = supabase
    .from("product_listing")
    .select("*")
    .eq("status", "active")
    .not("offer_id", "is", null)
    .not("id", "in", `(${seedIds.join(",")})`)
    .limit(limit);
  if (subcategories.length) query = query.in("subcategory", subcategories);
  else if (categories.length) query = query.in("category", categories);

  const { data, error } = await query;
  let rows = error ? [] : data || [];

  if (rows.length < limit) {
    const fill = await popularFallback(supabase, { excludeIds: [...seedIds, ...rows.map((r) => r.id)], limit: limit - rows.length });
    rows = [...rows, ...fill];
  }

  return { products: rows.map(mapListingRowToProduct), personalized: true };
}

/**
 * §59 outfit recommendation — picks one item from each of a few
 * complementary subcategories, staying within budget, using only real
 * current prices. Never invents a bundle price (§59) — the total is a
 * sum of actual selected offers' prices.
 *
 * @param {{ occasion?: string, gender?: string, budget?: number, pieceCount?: number }} params
 */
export async function getOutfitRecommendation({ occasion, gender, budget, pieceCount = 2 } = {}) {
  // DEMO_MODE: skip all Supabase network calls — return empty outfit.
  if (IS_DEMO_MODE) {
    return { pieces: [], totalPrice: 0, withinBudget: null, budget: budget ?? null };
  }

  const supabase = getSupabaseServerClient();
  // A small, explainable "what goes together" table keyed by occasion —
  // not an ML model (§59, §60 "grounded in actual structured product
  // attributes," not a black box). Falls back to a sensible default set
  // when the occasion isn't recognized.
  const COMPLEMENTARY_SETS_BY_OCCASION = {
    college: ["t-shirts", "jeans", "hoodies"],
    casual: ["t-shirts", "jeans"],
    office: ["shirts", "trousers"],
    formal: ["shirts", "trousers"],
    party: ["tops", "jeans"],
    festival: ["shirts", "trousers"],
    everyday: ["t-shirts", "jeans"],
    streetwear: ["hoodies", "jeans"],
  };
  const DEFAULT_SET = ["t-shirts", "jeans"];
  const set = COMPLEMENTARY_SETS_BY_OCCASION[(occasion || "").toLowerCase()] || DEFAULT_SET;
  const perItemBudget = budget ? budget / Math.max(pieceCount, set.length) : undefined;

  const pieces = [];
  let total = 0;
  for (const subcategory of set.slice(0, pieceCount)) {
    let query = supabase
      .from("product_listing")
      .select("*")
      .eq("status", "active")
      .eq("subcategory", subcategory)
      .not("offer_id", "is", null)
      .order("price", { ascending: true })
      .limit(1);
    if (gender) query = query.eq("category", gender);
    if (perItemBudget) query = query.lte("price", perItemBudget);

    const { data } = await query;
    const row = data?.[0];
    if (row) {
      pieces.push(mapListingRowToProduct(row));
      total += Number(row.price);
    }
  }

  return {
    pieces,
    totalPrice: total,
    withinBudget: budget ? total <= budget : null,
    budget: budget ?? null,
  };
}

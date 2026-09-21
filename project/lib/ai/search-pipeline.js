import "server-only";
import { getAiProvider } from "./provider";
import { validateIntent } from "./schema";
import { getCachedIntent, setCachedIntent } from "./cache";
import { hybridSearch } from "@/lib/search/hybrid";
import { queryProductCatalog } from "@/lib/products";
import { getOutfitRecommendation } from "./recommendations";

/**
 * User Query -> Intent extraction -> Structured validation -> Structured
 * filters -> Hybrid/FTS search -> Actual Products/Offers (§47).
 *
 * Every failure point has a defined, non-crashing fallback (§49, §62):
 *   - provider throws / times out          -> deterministic catalog search
 *   - JSON malformed                       -> one retry, then deterministic search
 *   - Zod validation fails                 -> one retry, then deterministic search
 *   - hybrid search unavailable            -> lib/search/hybrid.js's own fallback to catalog_search
 * The database query that actually runs never receives unvalidated AI
 * output (§48, §55) — `runIntentQuery()` only ever reads the fields
 * `validateIntent()` already approved.
 */
export async function runAiSearch(rawQuery) {
  const startedAt = Date.now();
  const diagnostics = { cacheHit: false, provider: getAiProvider().name, validationRetried: false, fellBackToDeterministic: false };

  let intent = await getCachedIntent(rawQuery);
  if (intent) {
    diagnostics.cacheHit = true;
  } else {
    intent = await extractValidatedIntent(rawQuery, diagnostics);
    if (intent) await setCachedIntent(rawQuery, intent);
  }

  if (!intent) {
    // Total AI failure (provider + retry both failed, or both invalid) —
    // fall back to the plain deterministic catalog search (§49 step 3,
    // §62). The page must still return real results.
    diagnostics.fellBackToDeterministic = true;
    const fallback = await queryProductCatalog({ q: rawQuery, sort: "relevance" }, { page: 1, pageSize: 24 });
    diagnostics.latencyMs = Date.now() - startedAt;
    return { intent: null, products: fallback.products, total: fallback.total, diagnostics };
  }

  const results = await runIntentQuery(intent);
  diagnostics.latencyMs = Date.now() - startedAt; // §54: measured, never assumed
  return { intent, products: results.products, total: results.total, outfit: results.outfit || null, diagnostics };
}

async function extractValidatedIntent(rawQuery, diagnostics) {
  const provider = getAiProvider();

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt === 1) diagnostics.validationRetried = true;
    try {
      const raw = await provider.extractIntent(rawQuery);
      const result = validateIntent(raw);
      if (result.ok) return result.intent;
      console.warn(`AI intent validation failed (attempt ${attempt + 1}):`, result.error); // §49 "log a non-sensitive diagnostic event" — no raw user PII beyond the query itself, which the user already submitted for search
    } catch (err) {
      console.warn(`AI provider threw (attempt ${attempt + 1}):`, err.message);
    }
  }
  return null; // both attempts failed — caller falls back to deterministic search
}

/**
 * Converts a VALIDATED intent object into fresh product/offer queries.
 * Never touches raw AI output directly (§55) — every value read here
 * already passed `IntentSchema` in `lib/ai/schema.js`. Uses hybrid search
 * when a free-text `query` is present (so semantic matching can help,
 * §39), and falls back to it degrading to FTS-only automatically when no
 * embedding is available (`lib/search/hybrid.js`).
 */
async function runIntentQuery(intent) {
  // §59: an explicit piece count ("3 outfits", "college outfit") routes
  // to the budget-aware outfit bundler instead of a plain product list —
  // still 100% real current prices/offers, never an invented bundle
  // price (§59, §90's "College outfit under ₹1500" test case).
  if (intent.outfit_count) {
    const outfit = await getOutfitRecommendation({
      occasion: intent.occasion,
      gender: intent.gender,
      budget: intent.price_max,
      pieceCount: intent.outfit_count,
    });
    return { products: outfit.pieces, total: outfit.pieces.length, outfit };
  }

  const filters = {
    subcategory: intent.subcategory,
    price_min: intent.price_min,
    price_max: intent.price_max,
    rating: intent.rating,
    discount: intent.discount,
    sort: intent.sort || "relevance",
  };
  if (intent.gender && intent.gender !== "unisex") filters.category = intent.gender;

  return hybridSearch({ query: intent.query, filters, limit: 24 });
}

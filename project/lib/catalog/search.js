/**
 * Lightweight client-side search heuristics — Part 2 §21.
 *
 * SUPERSEDED as the primary search path by PostgreSQL full-text search in
 * Part 3 (`catalog_search()` RPC, §33/§40 — `websearch_to_tsquery` against
 * `products.search_vector`, GIN-indexed). `CatalogView` no longer calls
 * `searchProducts()` for the actual catalog query. This file is kept
 * (not deleted) as a small, dependency-free utility — `interpretQuery()`
 * could still back a "Did you mean: under ₹799?" style hint in the search
 * UI without needing a request round trip — but nothing in the live
 * catalog path depends on it. The hardcoded list below replaces the old
 * `ALL_COLORS` import from the retired mock-data fixture so this file has
 * no dependency on mock data.
 */

const COLOR_NAMES = ["black", "white", "charcoal", "navy", "olive", "rust", "sand", "burgundy", "stone", "blush"];
const FIT_WORDS = ["oversized", "regular", "slim", "relaxed", "tailored"];

/**
 * Parses a free-text query into structured hints. Never throws — an
 * unparseable query just falls back to plain token matching.
 */
export function interpretQuery(rawQuery) {
  const query = (rawQuery || "").toLowerCase().trim();
  const hints = { color: null, fit: null, maxPrice: null, tokens: [] };
  if (!query) return hints;

  const priceMatch = query.match(/under\s*(?:rs\.?|₹)?\s*(\d+)/) || query.match(/below\s*(?:rs\.?|₹)?\s*(\d+)/);
  if (priceMatch) hints.maxPrice = Number(priceMatch[1]);

  const colorHit = COLOR_NAMES.find((c) => query.includes(c));
  if (colorHit) hints.color = colorHit;

  const fitHit = FIT_WORDS.find((f) => query.includes(f));
  if (fitHit) hints.fit = fitHit;

  hints.tokens = query
    .replace(/under\s*(?:rs\.?|₹)?\s*\d+/g, "")
    .replace(/below\s*(?:rs\.?|₹)?\s*\d+/g, "")
    .split(/\s+/)
    .filter(Boolean);

  return hints;
}

export function searchProducts(products, rawQuery) {
  const hints = interpretQuery(rawQuery);
  if (!hints.tokens.length && hints.maxPrice === null && !hints.color && !hints.fit) return products;

  return products.filter((p) => {
    if (hints.maxPrice !== null && p.price > hints.maxPrice) return false;
    if (hints.color && !p.colors.some((c) => c.name.toLowerCase() === hints.color)) return false;
    if (hints.fit && p.fit.toLowerCase() !== hints.fit) return false;

    if (!hints.tokens.length) return true;

    const haystack = [p.name, p.brand, p.category, p.subcategory, p.material, p.fit, p.occasion, ...p.tags]
      .join(" ")
      .toLowerCase();

    return hints.tokens.some((token) => haystack.includes(token));
  });
}

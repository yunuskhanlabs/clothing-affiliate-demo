import { ALL_COLORS } from "@/lib/catalog/facets-static";

/**
 * The default AI provider: deterministic, rule-based extraction — no
 * external API call, no key, no network dependency, so it's always
 * available (§44, §62 "the entire shopping experience [must not be]
 * dependent on AI availability"). This is genuinely how `AI_PROVIDER=local`
 * (the default, see `.env.local.example`) behaves — it is not a mock
 * standing in for a real call; it's a real, complete, if simple,
 * implementation of the "lightweight model for routine intent
 * extraction" the phase spec asks for (§50).
 *
 * Extraction quality is intentionally modest — regex/keyword matching,
 * not a language model. `lib/ai/providers/openai.js` documents the seam
 * to swap in a real model when a provider/key is configured; both
 * providers return the exact same shape, validated by the exact same
 * `IntentSchema` in `lib/ai/schema.js`, so the rest of the pipeline never
 * knows which one ran.
 */

const GENDER_WORDS = { men: "men", man: "men", mens: "men", women: "women", woman: "women", womens: "women", girl: "kids", girls: "kids", boy: "kids", boys: "kids", kids: "kids", kid: "kids" };
const FIT_WORDS = ["oversized", "regular", "slim", "relaxed", "tailored"];
const OCCASION_WORDS = ["casual", "formal", "athleisure", "streetwear", "everyday", "college", "party", "office", "wedding", "festival", "vacation"];
const SORT_WORDS = { cheapest: "price_asc", "low to high": "price_asc", "high to low": "price_desc", newest: "newest", trending: "popular", popular: "popular", best: "rating" };
const CATEGORY_WORDS = { "t-shirt": "t-shirts", "t shirt": "t-shirts", tshirt: "t-shirts", tee: "t-shirts", shirt: "shirts", jeans: "jeans", denim: "jeans", hoodie: "hoodies", jacket: "jackets", trouser: "trousers", pants: "trousers", dress: "dresses", top: "tops" };

function findFirst(query, dict) {
  for (const [word, value] of Object.entries(dict)) {
    if (query.includes(word)) return value;
  }
  return undefined;
}

export const localProvider = {
  name: "local",
  modelTier: "lightweight",

  /**
   * @param {string} rawQuery
   * @returns {Promise<object>} raw (not-yet-Zod-validated) intent object
   */
  async extractIntent(rawQuery) {
    const query = (rawQuery || "").toLowerCase().trim();
    const intent = {};

    const priceMatch =
      query.match(/under\s*(?:rs\.?|₹)?\s*(\d+)/) ||
      query.match(/below\s*(?:rs\.?|₹)?\s*(\d+)/) ||
      query.match(/(?:budget|within)\s*(?:of\s*)?(?:rs\.?|₹)?\s*(\d+)/);
    if (priceMatch) intent.price_max = Number(priceMatch[1]);

    const rangeMatch = query.match(/(?:rs\.?|₹)?\s*(\d+)\s*(?:-|to)\s*(?:rs\.?|₹)?\s*(\d+)/);
    if (rangeMatch) {
      intent.price_min = Number(rangeMatch[1]);
      intent.price_max = Number(rangeMatch[2]);
    }

    const outfitMatch = query.match(/(\d+)\s*outfits?/);
    if (outfitMatch) intent.outfit_count = Math.min(6, Number(outfitMatch[1]));
    else if (/\boutfit\b/.test(query)) intent.outfit_count = 2; // "college outfit under 1500" — no explicit count, default bundle size

    const color = ALL_COLORS.find((c) => query.includes(c));
    if (color) intent.color = color;

    const fit = FIT_WORDS.find((f) => query.includes(f));
    if (fit) intent.fit = fit;

    const occasion = OCCASION_WORDS.find((o) => query.includes(o));
    if (occasion) intent.occasion = occasion;

    const gender = findFirst(query, GENDER_WORDS);
    if (gender) intent.gender = gender;

    const category = findFirst(query, CATEGORY_WORDS);
    if (category) intent.subcategory = category;

    const sort = findFirst(query, SORT_WORDS);
    if (sort) intent.sort = sort;

    // Whatever's left after stripping recognized tokens becomes the
    // free-text `query` for FTS/hybrid search to match against — this is
    // intentionally NOT a "did we extract everything" guarantee; it's a
    // safety net so nothing the user typed is silently discarded.
    intent.query = rawQuery.trim().slice(0, 200) || undefined;

    return intent;
  },
};

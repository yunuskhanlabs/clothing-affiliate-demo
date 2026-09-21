import { z } from "zod";

/**
 * The structured shopping-intent contract — §48. Two layers, both
 * required, neither optional:
 *   1. `INTENT_JSON_SCHEMA` — passed to the AI provider as a native
 *      structured-output/function-calling schema, so the model is
 *      CONSTRAINED at generation time (not just asked nicely).
 *   2. `IntentSchema` (Zod) — re-validates the parsed JSON the provider
 *      returns, independently of whatever the provider claims it
 *      enforced. §49: "Structured Outputs reduce malformed responses but
 *      do NOT assume model output is infallible" — this is that second
 *      check. No AI output reaches query-building code
 *      (`lib/ai/search-pipeline.js`) without passing `IntentSchema.parse()`.
 *
 * `bumpSchemaVersion()`'s value feeds the intent-cache key (§51, §53) —
 * changing this schema in a future edit should also bump SCHEMA_VERSION,
 * so old cached intents (validated against the old shape) are never
 * served as if they matched the new one.
 */

export const SCHEMA_VERSION = "intent-v1";

const SORT_VALUES = ["relevance", "popular", "price_asc", "price_desc", "discount", "rating", "newest"];
const GENDER_VALUES = ["men", "women", "kids", "unisex"];

export const IntentSchema = z
  .object({
    query: z.string().trim().max(200).optional(),
    category: z.string().trim().max(60).optional(),
    subcategory: z.string().trim().max(60).optional(),
    brand: z.string().trim().max(80).optional(),
    color: z.string().trim().max(40).optional(),
    size: z.string().trim().max(20).optional(),
    material: z.string().trim().max(60).optional(),
    fit: z.string().trim().max(40).optional(),
    occasion: z.string().trim().max(60).optional(),
    // §92 "invalid price ... price_max = -999999 -> rejected": nonnegative,
    // and capped well above any real product price as a sanity bound.
    price_min: z.number().finite().min(0).max(1_000_000).optional(),
    price_max: z.number().finite().min(0).max(1_000_000).optional(),
    rating: z.number().finite().min(0).max(5).optional(),
    discount: z.number().finite().min(0).max(100).optional(),
    sort: z.enum(SORT_VALUES).optional(),
    gender: z.enum(GENDER_VALUES).optional(),
    // §59 outfit recommendations: how many pieces the user asked for.
    outfit_count: z.number().int().min(1).max(6).optional(),
  })
  // §48 "unknown fields should be rejected or safely stripped" — .strict()
  // makes an extra/unexpected key (e.g. a prompt-injection attempt like
  // `"sql": "DROP TABLE products"`, §92) a hard validation failure rather
  // than silently passing through.
  .strict()
  .refine((data) => !(data.price_min !== undefined && data.price_max !== undefined) || data.price_min <= data.price_max, {
    message: "price_min must not exceed price_max",
  });

/** Native structured-output schema for providers that accept JSON Schema directly (e.g. OpenAI's response_format). */
export const INTENT_JSON_SCHEMA = {
  name: "shopping_intent",
  schema: {
    type: "object",
    properties: {
      query: { type: "string", maxLength: 200 },
      category: { type: "string", maxLength: 60 },
      subcategory: { type: "string", maxLength: 60 },
      brand: { type: "string", maxLength: 80 },
      color: { type: "string", maxLength: 40 },
      size: { type: "string", maxLength: 20 },
      material: { type: "string", maxLength: 60 },
      fit: { type: "string", maxLength: 40 },
      occasion: { type: "string", maxLength: 60 },
      price_min: { type: "number", minimum: 0, maximum: 1000000 },
      price_max: { type: "number", minimum: 0, maximum: 1000000 },
      rating: { type: "number", minimum: 0, maximum: 5 },
      discount: { type: "number", minimum: 0, maximum: 100 },
      sort: { type: "string", enum: SORT_VALUES },
      gender: { type: "string", enum: GENDER_VALUES },
      outfit_count: { type: "integer", minimum: 1, maximum: 6 },
    },
    additionalProperties: false,
  },
};

/**
 * Validates and normalizes a raw (parsed-JSON) intent object.
 * @returns {{ ok: true, intent: object } | { ok: false, error: string }}
 */
export function validateIntent(raw) {
  const result = IntentSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, error: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ") };
  }
  return { ok: true, intent: result.data };
}

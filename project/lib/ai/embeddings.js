import "server-only";
import crypto from "node:crypto";

const DIMENSIONS = 384; // matches product_embeddings.embedding vector(384), see 0009 migration

/**
 * KNOWN LIMITATION, documented plainly rather than hidden: this
 * environment has no network access to call a real embedding API, so
 * this generator produces a DETERMINISTIC, HASH-DERIVED pseudo-vector —
 * not a real semantic embedding. It is stable (the same text always
 * produces the same vector, so `source_hash`-based staleness detection
 * in `lib/ai/embeddings.js`'s backfill job still behaves correctly) and
 * exercises the entire pgvector/HNSW/RRF pipeline end-to-end, but it
 * carries NO actual semantic meaning — cosine distance between two
 * hash-derived vectors does not reflect fashion/style similarity the way
 * a real sentence-embedding model's output would.
 *
 * To use a real model: replace the body of `generateEmbedding()` with a
 * call to an actual embedding API (OpenAI `text-embedding-3-small`,
 * Cohere, a local sentence-transformers server, etc.) that returns a
 * 384-dimension vector — or change `DIMENSIONS` and the migration's
 * `vector(384)` column together to match a different model's output
 * size. Every other part of the hybrid-search pipeline (`lib/search/
 * hybrid.js`, the `hybrid_search()` SQL function) is agnostic to how the
 * vector was produced.
 */
export async function generateEmbedding(text) {
  const normalized = (text || "").toLowerCase().trim();
  const vector = new Array(DIMENSIONS);
  let seed = crypto.createHash("sha256").update(normalized).digest();
  for (let i = 0; i < DIMENSIONS; i++) {
    if (i > 0 && i % seed.length === 0) {
      seed = crypto.createHash("sha256").update(seed).digest();
    }
    // Map a byte (0-255) to roughly [-1, 1] — matches the value range
    // real normalized embeddings typically fall in, so cosine-distance
    // arithmetic behaves sanely even though the values are meaningless.
    vector[i] = seed[i % seed.length] / 127.5 - 1;
  }
  return vector;
}

export function hashEmbeddableText(text) {
  return crypto.createHash("sha256").update((text || "").toLowerCase().trim()).digest("hex");
}

/**
 * Builds the text representation embedded for a product (§40) — a
 * deliberately curated subset of fields, not every database column
 * concatenated blindly. No sensitive/user data is ever included here
 * (product records only, §40 "do NOT embed sensitive user information").
 */
export function buildEmbeddableText(product) {
  return [product.name, product.description, product.category, product.subcategory, product.material, product.fit, product.occasion, (product.tags || []).join(" ")]
    .filter(Boolean)
    .join(". ");
}

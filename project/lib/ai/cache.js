import "server-only";
import crypto from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { SCHEMA_VERSION } from "./schema";
import { getAiProvider } from "./provider";

const CACHE_TTL_SECONDS = 60 * 60 * 6; // 6 hours — bounded, never "effectively permanent" (§53)

/**
 * Normalizes a query for cache-key purposes: lowercase, collapsed
 * whitespace. Two queries that normalize identically ("Black  Tee " vs
 * "black tee") intentionally share a cache entry (§51).
 */
function normalizeQuery(rawQuery) {
  return (rawQuery || "").toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * §51: `hash(normalized_query + schema_version + model/config version)`.
 * Changing the schema (SCHEMA_VERSION), the provider, or the model
 * automatically produces a different key — no manual cache flush needed
 * (§53).
 */
export function computeCacheKey(rawQuery) {
  const provider = getAiProvider();
  const normalized = normalizeQuery(rawQuery);
  const raw = `${normalized}::${SCHEMA_VERSION}::${provider.name}`;
  return { key: crypto.createHash("sha256").update(raw).digest("hex"), normalized, modelVersion: provider.name };
}

/**
 * @returns {Promise<object | null>} the cached, already-validated intent object, or null on miss/expiry
 */
export async function getCachedIntent(rawQuery) {
  const { key } = computeCacheKey(rawQuery);
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("ai_intent_cache").select("intent, expires_at").eq("cache_key", key).maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null; // expired — treated as a miss, not deleted inline (purge_expired_intent_cache handles cleanup)
  return data.intent;
}

/**
 * Stores ONLY the validated structured intent (§52 — never price,
 * availability, affiliate URLs, or any other commerce fact; there is
 * literally no column in `ai_intent_cache` that could hold those, see
 * 0009's table definition).
 */
export async function setCachedIntent(rawQuery, intent) {
  const { key, normalized, modelVersion } = computeCacheKey(rawQuery);
  const supabase = getSupabaseAdminClient();
  const expiresAt = new Date(Date.now() + CACHE_TTL_SECONDS * 1000).toISOString();
  const { error } = await supabase.from("ai_intent_cache").upsert({
    cache_key: key,
    normalized_query: normalized,
    schema_version: SCHEMA_VERSION,
    model_version: modelVersion,
    intent,
    expires_at: expiresAt,
  });
  if (error) console.error("setCachedIntent failed:", error.message);
}

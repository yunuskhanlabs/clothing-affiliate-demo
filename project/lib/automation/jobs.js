import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { withBackoff } from "./retry";
import { enqueueDlqItem } from "./dlq";
import { generateEmbedding, hashEmbeddableText, buildEmbeddableText } from "@/lib/ai/embeddings";

/**
 * Job registry (§28, §29). Two shapes, matching the two locking
 * strategies documented in 0008_automation.sql's header comment:
 *
 * - `runOfferRefresh`: Node-driven, calls an external URL between
 *   database round-trips, so it uses `claim_job_run()`/`finish_job_run()`
 *   (the short-atomic-claim pattern) rather than holding one DB
 *   transaction for the whole run.
 * - `price_drop_detection` / `deal_recalculation` / `price_alert_check`:
 *   pure SQL functions (0008) that ARE the whole job in one transaction —
 *   these wrappers just invoke the RPC, no separate claim step needed.
 *
 * No real affiliate network integration exists (§36 "do not build every
 * network integration now", consistent with Part 4's `generic` adapter
 * scope cut) — `runOfferRefresh` demonstrates the full idempotent/
 * lock-protected/retry-with-backoff/DLQ-on-exhaustion pattern against a
 * real HTTP call (a liveness check against each active store's
 * `base_url`), not a simulated/faked one. See PHASE-5-CONTEXT.md §30/§36
 * for the documented scope of what this does and doesn't prove.
 */

const PURE_SQL_JOBS = {
  price_drop_detection: "run_price_drop_detection",
  deal_recalculation: "run_deal_recalculation",
  price_alert_check: "run_price_alert_check",
};

export async function runPureSqlJob(jobName) {
  const rpcName = PURE_SQL_JOBS[jobName];
  if (!rpcName) throw new Error(`Unknown job: ${jobName}`);
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc(rpcName);
  if (error) throw new Error(error.message);
  return { runId: data };
}

/**
 * Offer/price "refresh" (§36) — for each active store, performs a bounded
 * HEAD request to its `base_url` as a stand-in liveness/availability
 * check, updates `offers.last_updated_at` for its offers on success, and
 * routes failures through backoff -> DLQ on exhaustion. Idempotent
 * (§30): re-running never duplicates anything — it only ever updates
 * `last_updated_at`/`status` on existing offer rows, and price itself is
 * only touched when this demo adapter actually has a new value to write
 * (it doesn't invent one — see PHASE-5-CONTEXT.md for why this adapter
 * intentionally does not fabricate price changes).
 */
export async function runOfferRefresh() {
  const supabase = getSupabaseAdminClient();

  const { data: runId, error: claimError } = await supabase.rpc("claim_job_run", { p_job_name: "offer_refresh", p_stale_after_minutes: 15 });
  if (claimError) throw new Error(claimError.message);
  if (!runId) return { skipped: true, reason: "already running or lock contended" };

  let processed = 0;
  let errorCount = 0;

  try {
    const { data: stores, error: storesError } = await supabase.from("stores").select("id, slug, base_url").eq("status", "active");
    if (storesError) throw new Error(storesError.message);

    for (const store of stores || []) {
      if (!store.base_url) continue;
      try {
        await withBackoff(
          async () => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            try {
              const res = await fetch(store.base_url, { method: "HEAD", signal: controller.signal });
              if (!res.ok) {
                const err = new Error(`${store.slug} responded ${res.status}`);
                err.status = res.status;
                throw err;
              }
              return res;
            } finally {
              clearTimeout(timeout);
            }
          },
          { maxAttempts: 3 }
        );

        await supabase.from("offers").update({ last_updated_at: new Date().toISOString() }).eq("store_id", store.id).eq("status", "available");
        processed += 1;
      } catch (err) {
        errorCount += 1;
        await enqueueDlqItem({
          jobName: "offer_refresh",
          source: store.slug,
          entityType: "store",
          entityId: store.id,
          failureReason: err.message || String(err),
          errorCategory: err.category || "transient",
          attemptCount: err.attempts || 1,
          payload: { storeSlug: store.slug },
        });
      }
    }

    await supabase.rpc("finish_job_run", {
      p_run_id: runId,
      p_status: errorCount === 0 ? "success" : processed > 0 ? "partial_success" : "failed",
      p_records_processed: processed,
      p_error_count: errorCount,
      p_error_summary: errorCount ? `${errorCount} store(s) failed liveness check — see DLQ` : null,
    });

    return { runId, processed, errorCount };
  } catch (err) {
    await supabase.rpc("finish_job_run", { p_run_id: runId, p_status: "failed", p_error_count: 1, p_error_summary: String(err.message || err) });
    throw err;
  }
}

export async function runJob(jobName) {
  if (jobName === "offer_refresh") return runOfferRefresh();
  if (jobName === "embeddings_backfill") return runEmbeddingsBackfill();
  if (jobName in PURE_SQL_JOBS) return runPureSqlJob(jobName);
  throw new Error(`Unknown job: ${jobName}`);
}

export const KNOWN_JOBS = ["offer_refresh", ...Object.keys(PURE_SQL_JOBS), "embeddings_backfill"];

/**
 * Replays a single DLQ item for `embeddings_backfill` (§34) — re-attempts
 * generating and upserting the embedding for exactly the one product
 * that failed. Idempotent: the upsert on `product_id` (primary key)
 * means replaying twice just overwrites with the same result.
 */
export async function replayEmbeddingsBackfillItem(dlqItem) {
  const supabase = getSupabaseAdminClient();
  const { data: product, error } = await supabase
    .from("products")
    .select("id, name, description, material, fit, occasion, tags, categories!products_department_id_fkey(slug), sub:categories!products_subcategory_id_fkey(slug)")
    .eq("id", dlqItem.entity_id)
    .maybeSingle();
  if (error || !product) throw new Error("Referenced product no longer exists.");

  const text = buildEmbeddableText({
    name: product.name,
    description: product.description,
    category: product.categories?.slug,
    subcategory: product.sub?.slug,
    material: product.material,
    fit: product.fit,
    occasion: product.occasion,
    tags: product.tags,
  });
  const embedding = await generateEmbedding(text);
  const { error: upsertError } = await supabase
    .from("product_embeddings")
    .upsert({ product_id: product.id, embedding, source_hash: hashEmbeddableText(text), model_version: "placeholder-v1", updated_at: new Date().toISOString() });
  if (upsertError) throw new Error(upsertError.message);
}

/**
 * Backfills/refreshes `product_embeddings` for active products whose
 * embeddable text has changed (or has no embedding yet) — §40, §41.
 * Idempotent (§30): `source_hash` lets a re-run skip products that are
 * already current, so running this repeatedly converges rather than
 * redoing work or drifting.
 */
export async function runEmbeddingsBackfill() {
  const supabase = getSupabaseAdminClient();

  const { data: runId, error: claimError } = await supabase.rpc("claim_job_run", { p_job_name: "embeddings_backfill", p_stale_after_minutes: 30 });
  if (claimError) throw new Error(claimError.message);
  if (!runId) return { skipped: true, reason: "already running or lock contended" };

  let processed = 0;
  let errorCount = 0;

  try {
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, name, description, material, fit, occasion, tags, categories!products_department_id_fkey(slug), sub:categories!products_subcategory_id_fkey(slug)")
      .eq("status", "active")
      .limit(1000);
    if (productsError) throw new Error(productsError.message);

    const { data: existing } = await supabase.from("product_embeddings").select("product_id, source_hash");
    const existingHashes = new Map((existing || []).map((e) => [e.product_id, e.source_hash]));

    for (const product of products || []) {
      const text = buildEmbeddableText({
        name: product.name,
        description: product.description,
        category: product.categories?.slug,
        subcategory: product.sub?.slug,
        material: product.material,
        fit: product.fit,
        occasion: product.occasion,
        tags: product.tags,
      });
      const hash = hashEmbeddableText(text);
      if (existingHashes.get(product.id) === hash) continue; // unchanged — skip (§30, §41)

      try {
        const embedding = await generateEmbedding(text);
        const { error } = await supabase
          .from("product_embeddings")
          .upsert({ product_id: product.id, embedding, source_hash: hash, model_version: "placeholder-v1", updated_at: new Date().toISOString() });
        if (error) throw new Error(error.message);
        processed += 1;
      } catch (err) {
        errorCount += 1;
        await enqueueDlqItem({
          jobName: "embeddings_backfill",
          entityType: "product",
          entityId: product.id,
          failureReason: err.message || String(err),
          errorCategory: "transient",
          attemptCount: 1,
        });
      }
    }

    await supabase.rpc("finish_job_run", {
      p_run_id: runId,
      p_status: errorCount === 0 ? "success" : processed > 0 ? "partial_success" : "failed",
      p_records_processed: processed,
      p_error_count: errorCount,
    });
    return { runId, processed, errorCount };
  } catch (err) {
    await supabase.rpc("finish_job_run", { p_run_id: runId, p_status: "failed", p_error_count: 1, p_error_summary: String(err.message || err) });
    throw err;
  }
}

/**
 * Replays a single DLQ item for `offer_refresh` (§34) — re-attempts
 * exactly the same liveness check for the one store that failed, using
 * the same backoff policy. Idempotent by construction: on success it
 * only updates `last_updated_at` on that store's already-existing
 * offers, never creates anything new, so replaying twice is harmless.
 * Other job types don't currently enqueue DLQ items, so this is the only
 * replay path wired up this phase (documented in PHASE-5-CONTEXT.md).
 */
export async function replayOfferRefreshItem(dlqItem) {
  const supabase = getSupabaseAdminClient();
  const { data: store, error } = await supabase.from("stores").select("id, slug, base_url").eq("id", dlqItem.entity_id).maybeSingle();
  if (error || !store) throw new Error("Referenced store no longer exists.");

  await withBackoff(
    async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(store.base_url, { method: "HEAD", signal: controller.signal });
        if (!res.ok) {
          const err = new Error(`${store.slug} responded ${res.status}`);
          err.status = res.status;
          throw err;
        }
        return res;
      } finally {
        clearTimeout(timeout);
      }
    },
    { maxAttempts: 3 }
  );

  await supabase.from("offers").update({ last_updated_at: new Date().toISOString() }).eq("store_id", store.id).eq("status", "available");
}

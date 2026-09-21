import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

// Fields that must never be persisted into automation_dlq.payload, even
// if a caller accidentally includes them (§32 "do not store raw API
// credentials or sensitive authentication headers"). Defense-in-depth on
// top of "callers shouldn't pass these in the first place."
const REDACTED_KEYS = ["authorization", "api_key", "apikey", "api-key", "secret", "token", "password", "credential", "x-api-key"];

function redact(payload) {
  if (!payload || typeof payload !== "object") return {};
  const clean = {};
  for (const [key, value] of Object.entries(payload)) {
    if (REDACTED_KEYS.some((k) => key.toLowerCase().includes(k))) continue;
    clean[key] = typeof value === "object" && value !== null ? redact(value) : value;
  }
  return clean;
}

/**
 * §32: writes one dead-letter entry after retry exhaustion (transient)
 * or an immediate permanent failure. `payload` is redacted before
 * insert — see REDACTED_KEYS above.
 */
export async function enqueueDlqItem({ jobName, source, entityType, entityId, failureReason, errorCategory, attemptCount, payload = {}, nextRetryAt = null }) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("automation_dlq").insert({
    job_name: jobName,
    source: source || null,
    entity_type: entityType || null,
    entity_id: entityId || null,
    failure_reason: String(failureReason).slice(0, 1000),
    error_category: errorCategory,
    attempt_count: attemptCount,
    payload: redact(payload),
    status: errorCategory === "permanent" ? "dead_lettered" : attemptCount >= 5 ? "dead_lettered" : "retrying",
    next_retry_at: nextRetryAt,
  });
  if (error) console.error("enqueueDlqItem failed:", error.message);
}

export async function listDlqItems({ status, jobName } = {}) {
  const supabase = getSupabaseAdminClient();
  let query = supabase.from("automation_dlq").select("*").order("last_failed_at", { ascending: false }).limit(200);
  if (status) query = query.eq("status", status);
  if (jobName) query = query.eq("job_name", jobName);
  const { data, error } = await query;
  if (error) {
    console.error("listDlqItems failed:", error.message);
    return [];
  }
  return data;
}

export async function markDlqStatus(id, status) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("automation_dlq").update({ status }).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

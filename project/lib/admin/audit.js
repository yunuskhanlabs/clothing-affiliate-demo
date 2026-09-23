import "server-only";

/**
 * Writes one audit-log entry via `log_admin_action()` (the SECURITY
 * DEFINER function — see 0007's migration comment for why the table
 * itself has INSERT revoked from every role). Called from every admin
 * mutation route, after the mutation succeeds.
 *
 * `metadata` must never contain passwords, API keys/secrets, tokens,
 * HMAC secrets, or other authentication material (§26) — this function
 * does not attempt to detect/redact that automatically (there's no
 * reliable way to tell "a secret" from "a normal string" after the
 * fact); callers are responsible for only passing safe, already-vetted
 * fields. Every call site in this codebase follows the same pattern:
 * pass the changed field NAMES and non-sensitive new values, never a
 * credential value itself (e.g. log `{ field: "tracking_param_name" }`,
 * never the affiliate network's actual secret).
 *
 * @param {object} params
 * @param {object} params.supabase - the session-aware server client (so the RPC runs as the calling admin, not service-role)
 * @param {{ id: string, email?: string }} params.actor
 * @param {string} params.action - e.g. "product.updated"
 * @param {string} params.entityType - e.g. "product"
 * @param {string | null} [params.entityId]
 * @param {object} [params.metadata]
 * @param {boolean} [params.stepUpUsed]
 */
export async function logAdminAction({ supabase, actor, action, entityType, entityId = null, metadata = {}, stepUpUsed = false }) {
  if (!supabase) {
    console.log(`[ADMIN_ACTION] action="${action}" entityType="${entityType}" entityId="${entityId || "none"}" actor="${actor?.email || "demo-admin"}" stepUp=${stepUpUsed}`);
    return;
  }
  const { error } = await supabase.rpc("log_admin_action", {
    p_actor_id: actor.id,
    p_actor_email: actor.email || null,
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_metadata: metadata,
    p_step_up_used: stepUpUsed,
  });
  if (error) {
    // An audit-log write failure must never be silently treated as if
    // the action itself failed (the mutation already committed) — but it
    // also must not be swallowed invisibly. Surface it to server logs so
    // it's investigable; the calling route still returns success for the
    // underlying mutation.
    console.error("logAdminAction failed:", error.message, { action, entityType, entityId });
  }
}

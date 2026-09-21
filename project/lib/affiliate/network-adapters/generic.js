/**
 * Generic affiliate-network adapter.
 *
 * Documents the normalized shape every adapter must produce. This is not
 * a real network's actual payload format (no specific network was
 * integrated in this phase, per §22) — it's a reasonable, explicit
 * contract a real adapter can be written against later.
 *
 * Expected raw payload (POST body, JSON):
 * ```
 * {
 *   "event_id": "evt_123",            // optional — network's own idempotency id
 *   "timestamp": 1737000000,          // optional — unix seconds, used for replay-window check if present
 *   "store_slug": "northline-store",  // required — which of our `stores` rows this is for
 *   "transaction_id": "TXN-9981",     // required — external_transaction_id, unique per (network, store)
 *   "click_ref": "8f1e2b3c-...",      // optional — the ClickID we injected, or the network's own sub-id string
 *   "order_value": 1499.00,           // optional
 *   "currency": "INR",                // optional, defaults to INR
 *   "commission_amount": 89.94,       // optional — omitted until the network confirms it
 *   "status": "approved"              // required — pending | approved | rejected | paid
 * }
 * ```
 *
 * `normalize()` does NOT touch the database — it only reshapes/validates
 * the payload. The route handler is responsible for resolving
 * `store_slug` → `store_id`, resolving `click_ref` → a known
 * `affiliate_clicks` row, and performing the actual upsert.
 */
// "paid" is accepted here even though `conversion_status` (the DB enum)
// only has pending/approved/rejected — a "paid" event means the
// COMMISSION is paid, which implies the underlying conversion was
// approved. The route handler maps normalized.status === "paid" to
// conversion.status = "approved" + commission.status = "paid"; see
// app/api/webhooks/affiliate/[network]/route.js.
const VALID_STATUSES = new Set(["pending", "approved", "rejected", "paid"]);

export const genericAdapter = {
  /**
   * @param {object} payload - parsed JSON body
   * @returns {{
   *   eventId: string | null,
   *   timestamp: number | null,
   *   storeSlug: string,
   *   externalTransactionId: string,
   *   clickRef: string | null,
   *   orderValue: number | null,
   *   currency: string,
   *   commissionAmount: number | null,
   *   status: "pending" | "approved" | "rejected",
   * }}
   * @throws {Error} on missing required fields — the route handler
   *   catches this and responds 400, never 500, since this is a client
   *   (network) data problem, not a server fault.
   */
  normalize(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("payload must be a JSON object");
    }
    const storeSlug = typeof payload.store_slug === "string" ? payload.store_slug.trim() : "";
    const externalTransactionId = typeof payload.transaction_id === "string" ? payload.transaction_id.trim() : "";
    const status = typeof payload.status === "string" ? payload.status.trim().toLowerCase() : "";

    if (!storeSlug) throw new Error("missing store_slug");
    if (!externalTransactionId) throw new Error("missing transaction_id");
    if (!VALID_STATUSES.has(status)) throw new Error(`invalid status: ${payload.status}`);

    const orderValue = payload.order_value !== undefined && payload.order_value !== null ? Number(payload.order_value) : null;
    const commissionAmount = payload.commission_amount !== undefined && payload.commission_amount !== null ? Number(payload.commission_amount) : null;

    if (orderValue !== null && !Number.isFinite(orderValue)) throw new Error("order_value is not a valid number");
    if (commissionAmount !== null && !Number.isFinite(commissionAmount)) throw new Error("commission_amount is not a valid number");

    return {
      eventId: typeof payload.event_id === "string" ? payload.event_id : null,
      timestamp: typeof payload.timestamp === "number" ? payload.timestamp : null,
      storeSlug,
      externalTransactionId,
      clickRef: typeof payload.click_ref === "string" ? payload.click_ref : null,
      orderValue,
      currency: typeof payload.currency === "string" && payload.currency ? payload.currency.toUpperCase() : "INR",
      commissionAmount,
      status,
    };
  },
};

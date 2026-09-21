import { genericAdapter } from "./generic";

/**
 * Network Adapter → Normalized Conversion → Internal Conversion Record →
 * Commission Record (§22).
 *
 * The ingestion route (`app/api/webhooks/affiliate/[network]/route.js`)
 * never parses a network's payload shape itself — it looks up the
 * adapter for the `[network]` URL segment and calls `.normalize(payload)`,
 * which must return the shape documented in `generic.js`. Adding a real
 * network later means adding one file here and registering it below —
 * the route, the idempotency logic, and the conversion/commission
 * upsert stay untouched (§22 "prevents network-specific logic from
 * spreading throughout the application").
 *
 * Only `generic` is implemented in this phase — a reasonable, documented
 * normalized shape that a real integration (Impact, CJ, Admitad, ...)
 * can be adapted into later (§22 "do not build every network integration
 * now").
 */
const ADAPTERS = {
  generic: genericAdapter,
};

/**
 * @param {string} networkKey
 * @returns {{ normalize: (payload: object) => object } | null}
 */
export function getNetworkAdapter(networkKey) {
  return ADAPTERS[networkKey] || null;
}

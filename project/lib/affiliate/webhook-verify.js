import "server-only";
import crypto from "node:crypto";

/**
 * Webhook authenticity verification — §20 (REQUIRED before processing any
 * conversion payload).
 *
 * Verifies an HMAC-SHA256 signature over the RAW request body (never the
 * re-serialized/parsed JSON — re-serializing can change whitespace/key
 * order and break the signature even for a legitimate request, so callers
 * must pass `request.text()`'s result, not `JSON.stringify(await
 * request.json())`).
 *
 * @param {object} params
 * @param {string} params.rawBody - the exact bytes the network signed
 * @param {string | null} params.signatureHeader - hex-encoded HMAC-SHA256, as received
 * @param {string} params.secret - shared secret for this network (never sent to the client, never logged)
 * @returns {boolean}
 */
export function verifyHmacSignature({ rawBody, signatureHeader, secret }) {
  if (!signatureHeader || !secret) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  // Signatures are sometimes prefixed (e.g. "sha256=<hex>") by convention
  // — strip a known prefix if present before comparing.
  const provided = signatureHeader.trim().replace(/^sha256=/i, "");

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");

  // Different lengths would make timingSafeEqual throw — treat as a
  // straightforward mismatch instead (still safe: this comparison itself
  // isn't secret-dependent, only the signature bytes are).
  if (expectedBuf.length !== providedBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Replay-window check for networks that provide a signed timestamp
 * (§21). Not every network does — callers should only invoke this when
 * the network's documented protocol includes one; a missing timestamp is
 * not itself treated as invalid (§21: "do not invent a timestamp rule
 * that conflicts with the affiliate network's documented protocol").
 *
 * @param {string | number} timestamp - seconds or an ISO string, network-dependent
 * @param {number} [windowSeconds] - acceptable clock-skew/replay window, default 5 minutes
 * @returns {boolean}
 */
export function isWithinReplayWindow(timestamp, windowSeconds = 300) {
  const ts = typeof timestamp === "number" ? timestamp * 1000 : Date.parse(timestamp);
  if (Number.isNaN(ts)) return false;
  return Math.abs(Date.now() - ts) <= windowSeconds * 1000;
}

/**
 * Sha256 hash of the raw body — used as the idempotency fallback key
 * (`webhook_events.payload_hash`) for networks that don't provide their
 * own event id (§21, §23).
 */
export function hashPayload(rawBody) {
  return crypto.createHash("sha256").update(rawBody, "utf8").digest("hex");
}

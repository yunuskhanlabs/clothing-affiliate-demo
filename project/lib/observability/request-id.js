import "server-only";

/**
 * Distributed request correlation — PART 6 §46-§50.
 *
 * `x-request-id` is a CORRELATION identifier, never an authentication
 * credential (§46, final principle). It exists so a client-visible
 * failure, a server log line, an affiliate click row, a webhook trace,
 * and an audit-log entry for the same logical request can all be found
 * with one search term.
 *
 * Rules enforced here, deliberately narrow:
 * 1. An incoming `x-request-id` is used ONLY if it matches a safe,
 *    bounded format — arbitrary user-controlled strings are never
 *    trusted or logged verbatim (§46 rule 3).
 * 2. Anything missing/invalid gets a fresh, high-entropy id instead of
 *    being rejected outright — a malformed header must never break a
 *    request (§46 rule 4).
 * 3. The id is opaque: a UUID or an incoming id matching the same safe
 *    charset. It carries no embedded meaning and must never be treated
 *    as identity (§48, §49).
 */

// Conservative allowlist: UUID-shaped or a bounded alphanumeric/dash/
// underscore token. Rejects anything that could be used to smuggle
// unexpected data (newlines, huge strings, HTML, SQL-looking input)
// into a log line via a client-controlled header.
const SAFE_REQUEST_ID_RE = /^[a-zA-Z0-9_-]{8,128}$/;

export const REQUEST_ID_HEADER = "x-request-id";

/**
 * @param {Headers} headers - the incoming request's Headers
 * @returns {string} a safe request id — either the validated incoming
 *   value, or a freshly generated one when missing/invalid.
 */
export function resolveRequestId(headers) {
  const incoming = headers?.get?.(REQUEST_ID_HEADER);
  if (incoming && SAFE_REQUEST_ID_RE.test(incoming)) return incoming;
  return crypto.randomUUID();
}

/**
 * Attaches the resolved request id to an outgoing Response so clients
 * (and support/debugging tooling) can correlate a visible failure with
 * server-side logs (§48). The value is always the opaque id itself —
 * never anything sensitive.
 *
 * @param {Response} response
 * @param {string} requestId
 * @returns {Response} the same response, for chaining
 */
export function withRequestId(response, requestId) {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

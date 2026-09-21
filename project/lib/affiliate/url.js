/**
 * URL construction for the affiliate redirect — §9, §11, §51.
 *
 * Two rules this file exists to enforce:
 * 1. Never blindly append "?param=..." — an offer's affiliate_url may
 *    already carry query parameters (e.g. a merchant's own campaign
 *    tags). Always parse with the real `URL` API and use
 *    `searchParams.set()`, which handles both "no query string yet" and
 *    "already has one" correctly.
 * 2. The destination must come from a trusted database record (the
 *    offer's `affiliate_url`, falling back to the store's `base_url`) —
 *    never from a client-supplied URL. See app/go/[offerId]/route.js,
 *    which is the only caller.
 */

import { isValidHttpUrl } from "../security/url-validation.js";

/**
 * Resolves the trusted base destination for an offer — the offer's own
 * affiliate_url if it's a real absolute URL, otherwise the store's
 * base_url as a fallback (§42 "tracking failure safety" — a missing
 * per-product affiliate link shouldn't strand the user if the merchant's
 * homepage is still a valid destination). Returns null when neither is
 * usable, which the caller must treat as "cannot redirect" (§11, §42).
 *
 * @param {{ affiliate_url?: string | null }} offer
 * @param {{ base_url?: string | null }} store
 * @returns {string | null}
 */
export function resolveTrustedDestination(offer, store) {
  if (isValidHttpUrl(offer?.affiliate_url, { blockPrivate: true })) return offer.affiliate_url;
  if (isValidHttpUrl(store?.base_url, { blockPrivate: true })) return store.base_url;
  return null;
}

/**
 * Injects the ClickID into the store's configured tracking parameter,
 * preserving any existing query parameters on the destination URL.
 *
 * @param {string} destinationUrl - already validated by resolveTrustedDestination()
 * @param {string} paramName - e.g. "subid1", "clickid", "custom_id" (store.tracking_param_name)
 * @param {string} clickId - the generated ClickID (click_uuid)
 * @returns {string}
 */
export function injectTrackingParam(destinationUrl, paramName, clickId) {
  const url = new URL(destinationUrl);
  url.searchParams.set(paramName || "subid1", clickId);
  return url.toString();
}

export { isValidHttpUrl };

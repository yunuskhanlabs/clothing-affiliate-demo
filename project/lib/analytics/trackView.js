"use client";

/**
 * Fires a product-view analytics event without blocking or awaiting
 * anything on the render path (§25). `keepalive: true` lets the request
 * survive a fast navigation away from the page; errors are swallowed —
 * a lost analytics beacon is never something the user should see.
 */
export function trackProductView(productId) {
  if (typeof window === "undefined" || !productId) return;
  try {
    fetch("/api/track/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never let analytics failure surface to the user.
  }
}

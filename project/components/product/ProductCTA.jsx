"use client";

import { useState } from "react";

/**
 * Part 4: now a real anchor to `/go/{offerId}` — the affiliate redirect
 * route (see `app/go/[offerId]/route.js`), which validates the offer,
 * records the click server-side, and issues a 302 to the merchant.
 *
 * Deliberately a plain `<a>`, not `next/link`: `/go/[offerId]` is a
 * Route Handler that returns an HTTP redirect, not a page — Next's
 * client-side router expects an RSC response for `<Link>` navigation, so
 * a real browser navigation (a plain anchor) is what correctly triggers
 * and follows the 302 to the merchant.
 */
export default function ProductCTA({ offerId, available = true, disabled = false }) {
  const [clicked, setClicked] = useState(false);
  const href = offerId ? `/go/${offerId}` : null;
  const isDisabled = !available || disabled || !href;

  return (
    <div>
      <a
        href={isDisabled ? undefined : href}
        aria-disabled={isDisabled}
        role="button"
        onClick={(e) => {
          if (isDisabled) {
            e.preventDefault();
            return;
          }
          setClicked(true);
        }}
        className={`flex w-full items-center justify-center gap-2 bg-tag px-8 py-4 text-sm font-semibold uppercase tracking-wide text-ink transition-all duration-300 ease-premium hover:bg-tag-hover hover:scale-[1.02] active:scale-[0.98] sm:w-auto sm:px-12 ${
          isDisabled ? "pointer-events-none cursor-not-allowed bg-border-strong text-paper-dim hover:scale-100" : ""
        }`}
      >
        {!available ? "Out of Stock" : !href ? "Unavailable" : clicked ? "Redirecting…" : "View Deal"}
      </a>
      {!isDisabled && <p className="mt-2 text-xs text-paper-dim">You&apos;ll be taken to our partner store to complete your purchase.</p>}
    </div>
  );
}

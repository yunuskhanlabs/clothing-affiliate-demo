"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "cloxtro:recently-viewed";
const MAX_ITEMS = 12;

function readStore() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStore(ids) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, MAX_ITEMS)));
  } catch {
    // Storage unavailable (private mode, quota) — fail silently, this is
    // a nice-to-have UI feature, never a functional dependency.
  }
}

/**
 * Records a product id as viewed. Call this from the product detail page.
 *
 * PART 3 (§28): still writes to localStorage unconditionally, so the
 * anonymous-visitor experience from Part 2 is byte-for-byte unchanged.
 * ALSO fires a best-effort POST to `/api/recently-viewed`, which is a
 * safe no-op server-side when nobody is signed in (see that route's GET/
 * POST handlers) — so this function doesn't need to know the auth state
 * itself, and never blocks/throws on the network call.
 */
export function recordProductView(productId) {
  if (typeof window === "undefined" || !productId) return;
  const current = readStore().filter((id) => id !== productId);
  current.unshift(productId);
  writeStore(current);

  fetch("/api/recently-viewed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId }),
  }).catch(() => {
    // Best-effort sync only — localStorage above is already the source
    // of truth for this tab.
  });
}

/**
 * Returns the list of recently viewed product ids (most recent first),
 * excluding `excludeId` when provided (typically the product being
 * viewed). Merges the localStorage list with the signed-in user's synced
 * history from `/api/recently-viewed`, preferring the backend list
 * (authoritative once a session exists) while keeping any very-recent
 * local-only entries that haven't synced yet.
 */
export function useRecentlyViewed(excludeId) {
  const [ids, setIds] = useState([]);

  useEffect(() => {
    const local = readStore();
    setIds(local);

    fetch("/api/recently-viewed")
      .then((res) => (res.ok ? res.json() : { ids: [] }))
      .then(({ ids: backendIds }) => {
        if (backendIds?.length) {
          setIds([...backendIds, ...local.filter((id) => !backendIds.includes(id))]);
        }
      })
      .catch(() => {
        // Fall back silently to whatever localStorage already gave us.
      });
  }, []);

  return ids.filter((id) => id !== excludeId);
}

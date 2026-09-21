"use client";

import { useEffect, useState } from "react";

const EMPTY_FACETS = { brands: [], colors: [], materials: [], fits: [], occasions: [] };

// Module-level cache — every FilterPanel/FilterDrawer instance in the tab
// shares one fetch instead of re-requesting on every mount (facet options
// change rarely; see app/api/facets/route.js doc comment).
let cache = null;
let inflight = null;

async function loadFacets() {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/api/facets")
      .then((res) => (res.ok ? res.json() : EMPTY_FACETS))
      .then((data) => {
        cache = { ...EMPTY_FACETS, ...data };
        return cache;
      })
      .catch(() => EMPTY_FACETS);
  }
  return inflight;
}

/**
 * Returns the brand/color/material/fit/occasion facet lists for the
 * filter UI, replacing Part 2's static `FACETS` import. Returns
 * `EMPTY_FACETS` on first render (before the fetch resolves) so
 * `FilterPanel` never crashes on `.map()` over `undefined` — the filter
 * groups simply render with zero options for one paint, then populate.
 */
export function useFacets() {
  const [facets, setFacets] = useState(cache || EMPTY_FACETS);

  useEffect(() => {
    let cancelled = false;
    loadFacets().then((data) => {
      if (!cancelled) setFacets(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return facets;
}

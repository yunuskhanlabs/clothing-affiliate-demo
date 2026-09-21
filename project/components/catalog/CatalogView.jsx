"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseFilters, filtersToQueryString, countActiveFilters, clearFilters as clearFiltersUtil } from "@/lib/catalog/query-state";
import ProductGrid from "@/components/product/ProductGrid";
import FilterPanel from "./FilterPanel";
import FilterDrawer from "./FilterDrawer";
import SortDropdown from "./SortDropdown";
import ActiveFilterChips from "./ActiveFilterChips";
import { ErrorState } from "@/components/ui/States";
import Button from "@/components/ui/Button";

const PAGE_SIZE = 12;

/**
 * @param {object} props
 * @param {string} props.basePath - route this view lives on, e.g. "/men", "/products", "/categories/t-shirts"
 * @param {object} [props.lockedFilters] - filters this route fixes and the UI can't remove (e.g. { category: "men" })
 * @param {string[]} [props.hideFilterKeys] - filter groups to hide entirely (usually matches lockedFilters keys)
 * @param {boolean} [props.dealsOnly] - PART 3: replaces Part 2's `extraFilter` JS-closure prop (couldn't cross an
 *   HTTP boundary to the API route) — see app/api/products/route.js's `deals=1` handling.
 */
export default function CatalogView({ basePath, lockedFilters = {}, hideFilterKeys = [], dealsOnly = false }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = useMemo(() => ({ ...parseFilters(searchParams), ...lockedFilters }), [searchParams, lockedFilters]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [products, setProducts] = useState(undefined); // undefined = loading, [] = empty, array = data — contract preserved from Part 2
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [errored, setErrored] = useState(false);

  const updateUrl = useCallback(
    (nextFilters) => {
      const qs = filtersToQueryString({ ...nextFilters, ...lockedFilters });
      router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
    },
    [router, basePath, lockedFilters]
  );

  const handleChange = (patch) => updateUrl({ ...filters, ...patch });
  const handleClearAll = () => updateUrl(clearFiltersUtil(filters));
  const handleSortChange = (sort) => updateUrl({ ...filters, sort });

  const signature = filtersToQueryString(filters);

  // Reset to page 1 whenever the filter/sort/search signature changes.
  useEffect(() => {
    setPage(1);
  }, [signature]);

  // Real async fetch — this IS the Part 3 data layer Part 2's ~180ms
  // simulated loading window stood in for.
  useEffect(() => {
    let cancelled = false;
    if (page === 1) setProducts(undefined);
    setErrored(false);

    const qs = new URLSearchParams(signature);
    qs.set("page", String(page));
    qs.set("pageSize", String(PAGE_SIZE));
    if (dealsOnly) qs.set("deals", "1");

    fetch(`/api/products?${qs.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("request_failed");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setProducts((prev) => (page === 1 ? data.products : [...(prev || []), ...data.products]));
        setTotal(data.total);
        setHasMore(data.hasMore);
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, page, dealsOnly]);

  if (errored) {
    return (
      <ErrorState
        title="Couldn't load products"
        description="Something went wrong while loading this catalog. Please try again."
        action={
          <Button variant="secondary" onClick={() => setPage(1)}>
            Retry
          </Button>
        }
      />
    );
  }

  const loading = products === undefined;
  const activeCount = countActiveFilters(filters);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-paper-dim" aria-live="polite">
          {loading ? "Loading…" : `${total} product${total === 1 ? "" : "s"}`}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-2 rounded-sm border border-border-strong px-4 py-2 text-xs font-semibold uppercase tracking-wide text-paper lg:hidden"
          >
            Filters {activeCount > 0 ? `(${activeCount})` : ""}
          </button>
          <SortDropdown value={filters.sort} onChange={handleSortChange} />
        </div>
      </div>

      <ActiveFilterChips filters={filters} onChange={handleChange} hideKeys={hideFilterKeys} />

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block">
          <FilterPanel filters={filters} onChange={handleChange} onClearAll={handleClearAll} hideKeys={hideFilterKeys} />
        </aside>

        <div>
          <ProductGrid
            products={loading ? undefined : products}
            skeletonCount={PAGE_SIZE}
            reveal={!loading}
            emptyDescription="Try removing a filter or searching for something else."
            emptyAction={
              activeCount > 0 ? (
                <Button variant="secondary" onClick={handleClearAll} className="mt-2">
                  Clear filters
                </Button>
              ) : undefined
            }
          />

          {!loading && total > 0 && hasMore && (
            <div className="mt-10 flex justify-center">
              <Button variant="secondary" onClick={() => setPage((p) => p + 1)}>
                Load more
              </Button>
            </div>
          )}
        </div>
      </div>

      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        onChange={handleChange}
        onClearAll={handleClearAll}
        onApply={() => setDrawerOpen(false)}
        resultCount={total}
        hideKeys={hideFilterKeys}
      />
    </div>
  );
}

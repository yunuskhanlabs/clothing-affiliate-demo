"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SearchBar from "./SearchBar";
import CatalogView from "./CatalogView";
import AiSearchPanel from "./AiSearchPanel";
import { filtersToQueryString, parseFilters } from "@/lib/catalog/query-state";

export default function SearchPageBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = parseFilters(searchParams);
  const [mode, setMode] = useState("standard"); // "standard" | "ai" — Part 5 addition, alongside (not replacing) the existing deterministic search

  const handleSearch = (query) => {
    const qs = filtersToQueryString({ ...filters, q: query });
    router.replace(`/search?${qs}`, { scroll: false });
  };

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("standard")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${mode === "standard" ? "bg-tag text-ink" : "border border-border-strong text-paper-muted"}`}
        >
          Search
        </button>
        <button
          type="button"
          onClick={() => setMode("ai")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${mode === "ai" ? "bg-tag text-ink" : "border border-border-strong text-paper-muted"}`}
        >
          Ask AI
        </button>
      </div>

      {mode === "ai" ? (
        <AiSearchPanel />
      ) : (
        <>
          <div className="mb-8 max-w-xl">
            <SearchBar initialValue={filters.q} onSearch={handleSearch} autoFocus />
          </div>
          {filters.q ? (
            <CatalogView basePath="/search" />
          ) : (
            <p className="py-16 text-center text-sm text-paper-dim">Search for a brand, category, color, or try "oversized hoodie under 999".</p>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect } from "react";
import FilterPanel from "./FilterPanel";

export default function FilterDrawer({ open, onClose, filters, onChange, onClearAll, onApply, resultCount, hideKeys }) {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div
      className={`fixed inset-0 z-50 lg:hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-ink/70 transition-opacity duration-300 ease-premium ${open ? "opacity-100" : "opacity-0"}`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        className={`absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-lg border-t border-border bg-ink-soft px-5 pb-24 pt-5 transition-transform duration-300 ease-premium ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="font-display text-xl text-paper">Filters</p>
          <button type="button" onClick={onClose} aria-label="Close filters" className="p-2 text-paper hover:text-tag">
            ✕
          </button>
        </div>

        <FilterPanel filters={filters} onChange={onChange} onClearAll={onClearAll} hideKeys={hideKeys} />

        <div className="fixed inset-x-0 bottom-0 flex gap-3 border-t border-border bg-ink-soft p-4">
          <button
            type="button"
            onClick={onClearAll}
            className="flex-1 rounded-sm border border-border-strong py-3 text-xs font-semibold uppercase tracking-wide text-paper"
          >
            Clear All
          </button>
          <button
            type="button"
            onClick={onApply}
            className="flex-1 rounded-sm bg-tag py-3 text-xs font-semibold uppercase tracking-wide text-ink"
          >
            Show {resultCount} results
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { SORT_OPTIONS } from "@/lib/catalog/query-state";

export default function SortDropdown({ value, onChange }) {
  return (
    <label className="flex items-center gap-2 text-sm text-paper-muted">
      <span className="hidden sm:inline">Sort by</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-sm border border-border-strong bg-ink px-3 py-2 text-sm text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-tag"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

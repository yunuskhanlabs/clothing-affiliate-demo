"use client";

import { useEffect, useState } from "react";

const RECENT_KEY = "cloxtro:recent-searches";
const MAX_RECENT = 6;

function readRecent() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecent(query) {
  try {
    const current = readRecent().filter((q) => q.toLowerCase() !== query.toLowerCase());
    current.unshift(query);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(current.slice(0, MAX_RECENT)));
  } catch {
    // best-effort only
  }
}

export default function SearchBar({ initialValue = "", onSearch, autoFocus = false }) {
  const [value, setValue] = useState(initialValue);
  const [recent, setRecent] = useState([]);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    setRecent(readRecent());
  }, []);

  useEffect(() => {
    setValue(initialValue || "");
  }, [initialValue]);

  const submit = (query) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    saveRecent(trimmed);
    setRecent(readRecent());
    setFocused(false);
    onSearch(trimmed);
  };

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
        role="search"
      >
        <label htmlFor="catalog-search" className="sr-only">
          Search products
        </label>
        <div className="flex items-center gap-2 rounded-sm border border-border-strong bg-surface px-4 py-3">
          <SearchIcon />
          <input
            id="catalog-search"
            type="search"
            value={value}
            autoFocus={autoFocus}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            placeholder="Search e.g. black oversized t shirt under 799"
            className="w-full bg-transparent text-sm text-paper placeholder:text-paper-dim focus:outline-none"
          />
          {value && (
            <button type="button" onClick={() => setValue("")} aria-label="Clear search" className="text-paper-dim hover:text-paper">
              ✕
            </button>
          )}
        </div>
      </form>

      {focused && recent.length > 0 && (
        <div className="absolute inset-x-0 top-full z-20 mt-2 rounded-sm border border-border bg-ink-soft p-3 shadow-lg">
          <p className="mb-2 text-xs uppercase tracking-wide text-paper-dim">Recent searches</p>
          <div className="flex flex-wrap gap-2">
            {recent.map((q) => (
              <button
                key={q}
                type="button"
                onMouseDown={() => {
                  setValue(q);
                  submit(q);
                }}
                className="rounded-full border border-border-strong px-3 py-1 text-xs text-paper-muted hover:border-tag hover:text-paper"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 19 19" fill="none" aria-hidden="true" className="shrink-0 text-paper-dim">
      <circle cx="8.5" cy="8.5" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M13.5 13.5L17.5 17.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

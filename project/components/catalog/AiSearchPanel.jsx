"use client";

import { useState } from "react";
import ProductGrid from "@/components/product/ProductGrid";

/**
 * A self-contained natural-language search experience, separate from the
 * deterministic `CatalogView` filter/sort UI it sits alongside (§44 —
 * this is an addition, not a replacement; the regular search/filters
 * keep working exactly as before regardless of whether this panel is
 * used). Shows what the AI understood (the structured intent) so the
 * "AI is an intelligence layer, not the source of truth" boundary is
 * visible to the user too, not just enforced internally.
 */
export default function AiSearchPanel() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ intent: null, products: [], total: 0, error: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <form onSubmit={submit} className="mb-6 flex items-center gap-2 rounded-sm border border-border-strong bg-surface px-4 py-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Try "college outfit under ₹1500" or "black oversized tee under 799"'
          className="w-full bg-transparent text-sm text-paper placeholder:text-paper-dim focus:outline-none"
        />
        <button type="submit" disabled={loading} className="shrink-0 rounded-sm bg-tag px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink disabled:opacity-60">
          {loading ? "Thinking…" : "Ask"}
        </button>
      </form>

      {result && (
        <div className="mb-6">
          {result.intent && <IntentSummary intent={result.intent} />}
          {result.diagnostics?.fellBackToDeterministic && (
            <p className="mb-4 text-xs text-paper-dim">Showing regular search results — AI interpretation wasn&apos;t available for this query.</p>
          )}
          <ProductGrid products={result.products} emptyDescription="No products matched that request. Try rephrasing, or use the filters below." />
        </div>
      )}
    </div>
  );
}

function IntentSummary({ intent }) {
  const chips = Object.entries(intent).filter(([key, value]) => key !== "query" && value !== undefined && value !== "");
  if (!chips.length) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-paper-dim">
      <span>Understood:</span>
      {chips.map(([key, value]) => (
        <span key={key} className="rounded-full border border-border-strong px-2.5 py-1 text-paper-muted">
          {key.replace(/_/g, " ")}: {String(value)}
        </span>
      ))}
    </div>
  );
}

"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/format";

/**
 * §67 "Admin AI controls" (read-only view of what's active — this phase
 * doesn't expose provider/key editing in the UI, since that's exactly
 * the kind of "arbitrary admin-entered config that could compromise
 * behavior" the spec asks to keep server-side/env-based, §67 "do not
 * expose API keys in frontend"). What this page DOES give an admin: a
 * live, honest look at the pipeline's actual behavior on a real query —
 * the extracted intent, whether it passed validation, cache status, and
 * measured latency (§54) — which is more useful for verifying the system
 * behaves correctly than a settings form would be.
 */
export default function AdminAiPage() {
  const [query, setQuery] = useState("black oversized t shirt under 799");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      setResult(await res.json());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="mb-2 font-display text-2xl text-paper">AI Search &amp; Recommendations</h1>
      <p className="mb-6 text-sm text-paper-dim">
        Live pipeline test — every result below comes from a fresh database query; only the structured intent (never price/availability) is cacheable.
      </p>

      <div className="mb-6 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          className="w-full max-w-xl rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper"
          placeholder='Try: "college outfit under ₹1500"'
        />
        <button onClick={run} disabled={loading} className="rounded-sm bg-tag px-4 py-2 text-xs font-semibold uppercase text-ink disabled:opacity-60">
          {loading ? "Running…" : "Run"}
        </button>
      </div>

      {result && (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="rounded-sm border border-border bg-surface p-4 text-xs">
            <p className="mb-2 font-semibold uppercase tracking-wide text-paper-dim">Diagnostics</p>
            <dl className="space-y-1">
              <Row label="Provider" value={result.diagnostics?.provider} />
              <Row label="Cache hit" value={String(!!result.diagnostics?.cacheHit)} />
              <Row label="Fell back to deterministic" value={String(!!result.diagnostics?.fellBackToDeterministic)} />
              <Row label="Validation retried" value={String(!!result.diagnostics?.validationRetried)} />
              <Row label="Latency" value={`${result.diagnostics?.latencyMs ?? "—"} ms`} />
            </dl>
            <p className="mb-2 mt-4 font-semibold uppercase tracking-wide text-paper-dim">Structured intent</p>
            <pre className="overflow-x-auto rounded-sm bg-ink p-2 text-paper-muted">{JSON.stringify(result.intent, null, 2) || "null (fell back)"}</pre>
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-paper-dim">{result.products?.length || 0} real products returned</p>
            {result.outfit && (
              <p className="mb-3 text-xs text-paper-dim">
                Outfit total: {formatPrice(result.outfit.totalPrice)}
                {result.outfit.budget ? ` (budget ${formatPrice(result.outfit.budget)}, ${result.outfit.withinBudget ? "within budget" : "over budget"})` : ""}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(result.products || []).map((p) => (
                <div key={p.id} className="rounded-sm border border-border bg-surface p-3 text-xs">
                  <p className="line-clamp-1 text-paper">{p.name}</p>
                  <p className="mt-1 text-paper-dim">{formatPrice(p.price)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-paper-dim">{label}</dt>
      <dd className="text-paper">{value}</dd>
    </div>
  );
}

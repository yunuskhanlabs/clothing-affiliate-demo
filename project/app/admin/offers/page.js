"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";

export default function AdminOffersPage() {
  const [offers, setOffers] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [testingId, setTestingId] = useState(null);

  const load = () => {
    fetch("/api/admin/offers?pageSize=50")
      .then((r) => r.json())
      .then((data) => setOffers(data.offers || []));
  };

  useEffect(load, []);

  const savePrice = async (offer, newPrice) => {
    const res = await fetch(`/api/admin/offers/${offer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: Number(newPrice) }),
    });
    if (res.ok) load();
    // §18: this only ever writes offers.price — the Part 3 trigger is
    // what populates price_history; nothing here inserts history rows.
  };

  const toggleStatus = async (offer) => {
    const next = offer.status === "available" ? "unavailable" : "available";
    const res = await fetch(`/api/admin/offers/${offer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) load();
  };

  const testUrl = async (id) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await fetch(`/api/admin/offers/${id}/test-url`);
      const data = await res.json();
      setTestResult({ id, ...data });
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl text-paper">Offers</h1>

      {testResult && (
        <div className={`mb-4 rounded-sm border p-4 text-sm ${testResult.passed ? "border-tag/40 bg-tag/10" : "border-border-strong bg-surface"}`}>
          <p className="font-semibold text-paper">{testResult.passed ? "✓ Configuration valid" : "✗ Configuration issue"}</p>
          <ul className="mt-2 space-y-0.5 text-xs text-paper-dim">
            {Object.entries(testResult.checks || {}).map(([k, v]) => (
              <li key={k}>
                {v ? "✓" : "✗"} {k}
              </li>
            ))}
          </ul>
          {testResult.finalUrl && <p className="mt-2 break-all text-xs text-paper-dim">Test URL (never recorded as a real click): {testResult.finalUrl}</p>}
          <button onClick={() => setTestResult(null)} className="mt-2 text-xs text-tag">
            Dismiss
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-paper-dim">
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(offers || []).map((offer) => (
              <tr key={offer.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 text-paper">{offer.products?.name || "—"}</td>
                <td className="px-4 py-3 text-paper-muted">
                  {offer.stores?.name} {offer.stores?.status !== "active" && <span className="text-tag">(inactive)</span>}
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    defaultValue={offer.price}
                    onBlur={(e) => e.target.value !== String(offer.price) && savePrice(offer, e.target.value)}
                    className="w-24 rounded-sm border border-border-strong bg-transparent px-2 py-1 text-paper"
                  />
                  <span className="ml-1 text-xs text-paper-dim">{formatPrice(offer.price)}</span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleStatus(offer)} className={`rounded-sm px-2 py-1 text-xs uppercase ${offer.status === "available" ? "bg-tag/20 text-tag" : "border border-border-strong text-paper-dim"}`}>
                    {offer.status}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => testUrl(offer.id)} disabled={testingId === offer.id} className="rounded-sm border border-border-strong px-3 py-1.5 text-xs uppercase text-paper-muted hover:text-paper">
                    {testingId === offer.id ? "Testing…" : "Test URL"}
                  </button>
                </td>
              </tr>
            ))}
            {offers && offers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-paper-dim">
                  No offers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

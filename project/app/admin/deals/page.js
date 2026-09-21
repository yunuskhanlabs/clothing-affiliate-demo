"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";

const LABELS = ["featured", "todays_deal", "seasonal", "limited_time", "sponsored"];

export default function AdminDealsPage() {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offerId, setOfferId] = useState("");
  const [label, setLabel] = useState("featured");
  const [headline, setHeadline] = useState("");

  const load = () => {
    setLoading(true);
    fetch("/api/admin/deals")
      .then((r) => r.json())
      .then((d) => setDeals(d.deals || []))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const create = async (e) => {
    e.preventDefault();
    const res = await fetch("/api/admin/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offer_id: offerId, label, headline: headline || undefined }),
    });
    if (res.ok) {
      setOfferId("");
      setHeadline("");
      load();
    }
  };

  const toggleActive = async (deal) => {
    await fetch(`/api/admin/deals/${deal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !deal.is_active }),
    });
    load();
  };

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl text-paper">Deals</h1>

      <form onSubmit={create} className="mb-8 flex flex-wrap items-end gap-3 rounded-sm border border-border p-4">
        <div>
          <label className="mb-1 block text-xs text-paper-dim">Offer ID</label>
          <input value={offerId} onChange={(e) => setOfferId(e.target.value)} placeholder="offer uuid" className="rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-paper-dim">Label</label>
          <select value={label} onChange={(e) => setLabel(e.target.value)} className="rounded-sm border border-border-strong bg-ink px-3 py-2 text-sm text-paper">
            {LABELS.map((l) => (
              <option key={l} value={l}>
                {l.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs text-paper-dim">Headline (optional)</label>
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} className="w-full rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper" />
        </div>
        <button type="submit" className="rounded-sm bg-tag px-5 py-2 text-xs font-semibold uppercase text-ink">
          Add deal
        </button>
      </form>
      <p className="mb-6 text-xs text-paper-dim">
        Labels curate visibility only — the displayed price always comes live from the offer. Best Price is never overridden here (§23).
      </p>

      {loading ? (
        <p className="text-sm text-paper-dim">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-paper-dim">
                <th className="px-3 py-3 font-medium">Product</th>
                <th className="px-3 py-3 font-medium">Store</th>
                <th className="px-3 py-3 font-medium">Price</th>
                <th className="px-3 py-3 font-medium">Label</th>
                <th className="px-3 py-3 font-medium">Offer status</th>
                <th className="px-3 py-3 font-medium">Active</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-3 text-paper">{d.offers?.products?.name || "—"}</td>
                  <td className="px-3 py-3 text-paper-muted">{d.offers?.stores?.name || "—"}</td>
                  <td className="px-3 py-3 text-paper-muted">{d.offers ? formatPrice(Number(d.offers.price)) : "—"}</td>
                  <td className="px-3 py-3 text-paper-muted">{d.label.replace(/_/g, " ")}</td>
                  <td className="px-3 py-3 text-paper-muted">{d.offers?.status}</td>
                  <td className="px-3 py-3">
                    <button onClick={() => toggleActive(d)} className={`text-xs uppercase ${d.is_active ? "text-tag" : "text-paper-dim"}`}>
                      {d.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

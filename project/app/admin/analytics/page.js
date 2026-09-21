"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";

export default function AdminAnalyticsPage() {
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState("");
  const [partnerMetrics, setPartnerMetrics] = useState(null);

  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productMetrics, setProductMetrics] = useState(null);

  useEffect(() => {
    fetch("/api/admin/partners")
      .then((r) => r.json())
      .then((data) => setStores(data.stores || []));
  }, []);

  useEffect(() => {
    if (!storeId) {
      setPartnerMetrics(null);
      return;
    }
    fetch(`/api/admin/analytics/partner?storeId=${storeId}`)
      .then((r) => r.json())
      .then((data) => setPartnerMetrics(data.metrics));
  }, [storeId]);

  useEffect(() => {
    if (!productQuery.trim()) {
      setProductResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/admin/products?q=${encodeURIComponent(productQuery)}&pageSize=5`)
        .then((r) => r.json())
        .then((data) => setProductResults(data.products || []));
    }, 250);
    return () => clearTimeout(t);
  }, [productQuery]);

  useEffect(() => {
    if (!selectedProduct) {
      setProductMetrics(null);
      return;
    }
    fetch(`/api/admin/analytics/product?productId=${selectedProduct.id}`)
      .then((r) => r.json())
      .then((data) => setProductMetrics(data.metrics));
  }, [selectedProduct]);

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl text-paper">Analytics</h1>
      <p className="mb-6 max-w-2xl text-sm text-paper-dim">
        Per-partner and per-product drill-down (§30, §31) — the same figures behind these numbers power the platform-wide Dashboard, scoped here to
        one store or product. Human/bot traffic stays separated (§11); pending/approved/paid commission are never summed into one figure (§10).
      </p>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <p className="mb-2 text-sm font-semibold text-paper">Partner performance</p>
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="mb-4 w-full rounded-sm border border-border-strong bg-ink px-3 py-2 text-sm text-paper">
            <option value="">Select a partner…</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {partnerMetrics && <MetricsList metrics={partnerMetrics} />}
        </section>

        <section>
          <p className="mb-2 text-sm font-semibold text-paper">Product performance</p>
          <div className="relative mb-4">
            <input
              value={selectedProduct ? selectedProduct.name : productQuery}
              onChange={(e) => {
                setSelectedProduct(null);
                setProductQuery(e.target.value);
              }}
              placeholder="Search a product…"
              className="w-full rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper"
            />
            {productResults.length > 0 && !selectedProduct && (
              <div className="absolute z-10 mt-1 w-full rounded-sm border border-border bg-ink-soft">
                {productResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedProduct(p);
                      setProductResults([]);
                    }}
                    className="block w-full px-3 py-2 text-left text-xs text-paper hover:bg-surface"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {productMetrics && <MetricsList metrics={productMetrics} />}
        </section>
      </div>
    </div>
  );
}

function MetricsList({ metrics }) {
  const rows = [
    ["Product views", metrics.product_views],
    ["Human clicks", metrics.human_clicks],
    metrics.unique_human_clicks !== undefined ? ["Unique human clicks", metrics.unique_human_clicks] : null,
    ["Bot clicks", metrics.bot_clicks],
    ["Conversions", metrics.conversions],
    ["CTR", metrics.ctr !== null ? `${metrics.ctr}%` : "—"],
    ["EPC", metrics.epc !== null ? formatPrice(metrics.epc) : "—"],
    metrics.pending_commission !== undefined ? ["Pending commission", formatPrice(metrics.pending_commission)] : null,
    metrics.approved_commission !== undefined ? ["Approved commission", formatPrice(metrics.approved_commission)] : null,
    metrics.paid_commission !== undefined ? ["Paid commission", formatPrice(metrics.paid_commission)] : null,
    metrics.total_commission !== undefined ? ["Total commission", formatPrice(metrics.total_commission)] : null,
  ].filter(Boolean);

  return (
    <dl className="rounded-sm border border-border bg-surface p-4 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between border-b border-border py-1.5 last:border-b-0">
          <dt className="text-paper-dim">{label}</dt>
          <dd className="text-paper">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";

const RANGES = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "month", label: "This month" },
];

export default function AdminDashboardPage() {
  const [range, setRange] = useState("30d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/dashboard?range=${range}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [range]);

  const m = data?.metrics;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl text-paper">Dashboard</h1>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`rounded-sm px-3 py-1.5 text-xs font-semibold uppercase ${range === r.value ? "bg-tag text-ink" : "border border-border-strong text-paper-muted"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading || !m ? (
        <p className="text-sm text-paper-dim">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Metric label="Total products" value={m.total_products} />
            <Metric label="Active" value={m.active_products} />
            <Metric label="Out of stock" value={m.out_of_stock_products} />
            <Metric label="Archived" value={m.archived_products} />
            <Metric label="Total offers" value={m.total_offers} />
            <Metric label="Active partners" value={m.active_partners} />
            <Metric label="Product views" value={m.product_views} />
            <Metric label="Human clicks" value={m.human_clicks} sub={`+${m.bot_clicks} bot`} />
            <Metric label="Unique clicks" value={m.unique_human_clicks} />
            <Metric label="CTR" value={m.ctr !== null ? `${m.ctr}%` : "—"} />
            <Metric label="Conversions" value={m.conversions} />
            <Metric label="EPC" value={m.epc !== null ? formatPrice(m.epc) : "—"} />
          </div>

          {/* §10: pending/approved/paid always shown separately — never summed as "revenue" */}
          <div className="mt-6 grid grid-cols-3 gap-4">
            <Metric label="Pending commission" value={formatPrice(m.pending_commission)} tone="dim" />
            <Metric label="Approved commission" value={formatPrice(m.approved_commission)} tone="dim" />
            <Metric label="Paid commission" value={formatPrice(m.paid_commission)} tone="tag" />
          </div>

          {data.trend?.length > 0 && (
            <div className="mt-8">
              <p className="mb-3 text-sm font-semibold text-paper">Click trend</p>
              <TrendBars trend={data.trend} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Metric({ label, value, sub, tone }) {
  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-paper-dim">{label}</p>
      <p className={`mt-1 font-display text-2xl ${tone === "tag" ? "text-tag" : "text-paper"}`}>{value ?? "—"}</p>
      {sub && <p className="mt-0.5 text-xs text-paper-dim">{sub}</p>}
    </div>
  );
}

function TrendBars({ trend }) {
  const max = Math.max(1, ...trend.map((d) => d.human_clicks));
  return (
    <div className="flex h-32 items-end gap-1 rounded-sm border border-border bg-surface p-4">
      {trend.map((d) => (
        <div key={d.day} className="group relative flex-1" title={`${d.day}: ${d.human_clicks} clicks`}>
          <div className="rounded-t-sm bg-tag/70 transition-colors group-hover:bg-tag" style={{ height: `${Math.max(2, (d.human_clicks / max) * 100)}px` }} />
        </div>
      ))}
    </div>
  );
}

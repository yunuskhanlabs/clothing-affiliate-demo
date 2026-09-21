"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";

const STATUSES = ["", "pending", "approved", "rejected"];

export default function AdminConversionsPage() {
  const [status, setStatus] = useState("");
  const [conversions, setConversions] = useState(null);

  useEffect(() => {
    fetch(`/api/admin/conversions${status ? `?status=${status}` : ""}`)
      .then((r) => r.json())
      .then((data) => setConversions(data.conversions || []));
  }, [status]);

  return (
    <div>
      <h1 className="mb-2 font-display text-2xl text-paper">Conversions</h1>
      <p className="mb-6 max-w-2xl text-sm text-paper-dim">
        A conversion is not a commission (§3) — commission amount/status is shown per-conversion here but lives in its own table, with its own
        lifecycle.
      </p>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {STATUSES.map((s) => (
            <button
              key={s || "all"}
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase ${status === s ? "bg-tag text-ink" : "border border-border-strong text-paper-muted"}`}
            >
              {s || "All"}
            </button>
          ))}
        </div>
        <a href="/api/admin/export/conversions" className="rounded-sm border border-border-strong px-3 py-1.5 text-xs uppercase text-paper-muted hover:text-paper">
          Export CSV
        </a>
      </div>

      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-paper-dim">
              <th className="px-4 py-3">Transaction</th>
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Order value</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Commission</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {(conversions || []).map((c) => (
              <tr key={c.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 text-paper">{c.external_transaction_id}</td>
                <td className="px-4 py-3 text-paper-muted">{c.stores?.name || "—"}</td>
                <td className="px-4 py-3 text-paper-muted">{c.products?.name || "—"}</td>
                <td className="px-4 py-3 text-paper-muted">{c.order_value ? formatPrice(Number(c.order_value)) : "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-sm px-2 py-1 text-xs uppercase ${
                      c.status === "approved" ? "bg-tag/20 text-tag" : c.status === "rejected" ? "text-paper-dim" : "border border-border-strong text-paper-muted"
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-paper-muted">
                  {c.commissions?.[0] ? `${formatPrice(Number(c.commissions[0].amount))} (${c.commissions[0].status})` : "—"}
                </td>
                <td className="px-4 py-3 text-paper-dim">{new Date(c.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {conversions && conversions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-paper-dim">
                  No conversions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

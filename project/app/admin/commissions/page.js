"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";

const STATUSES = ["", "pending", "approved", "rejected", "paid"];

export default function AdminCommissionsPage() {
  const [status, setStatus] = useState("");
  const [commissions, setCommissions] = useState(null);

  useEffect(() => {
    fetch(`/api/admin/commissions${status ? `?status=${status}` : ""}`)
      .then((r) => r.json())
      .then((data) => setCommissions(data.commissions || []));
  }, [status]);

  const totals = (commissions || []).reduce(
    (acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + Number(c.amount);
      return acc;
    },
    {}
  );

  return (
    <div>
      <h1 className="mb-2 font-display text-2xl text-paper">Commissions</h1>
      <p className="mb-6 max-w-2xl text-sm text-paper-dim">
        Pending, approved, rejected and paid are always shown separately (§10) — pending commission is never presented as paid revenue.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {["pending", "approved", "rejected", "paid"].map((s) => (
          <div key={s} className="rounded-sm border border-border bg-surface p-3">
            <p className="text-xs uppercase tracking-wide text-paper-dim">{s}</p>
            <p className="mt-1 font-display text-lg text-paper">{formatPrice(totals[s] || 0)}</p>
          </div>
        ))}
      </div>

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
        <a href="/api/admin/export/commissions" className="rounded-sm border border-border-strong px-3 py-1.5 text-xs uppercase text-paper-muted hover:text-paper">
          Export CSV
        </a>
      </div>

      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-paper-dim">
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Network / Transaction</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Approved</th>
              <th className="px-4 py-3">Paid</th>
            </tr>
          </thead>
          <tbody>
            {(commissions || []).map((c) => (
              <tr key={c.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 text-paper">{c.stores?.name || "—"}</td>
                <td className="px-4 py-3 text-paper-muted">{c.products?.name || "—"}</td>
                <td className="px-4 py-3 text-paper-muted">
                  {c.conversions?.network} / {c.conversions?.external_transaction_id}
                </td>
                <td className="px-4 py-3 text-paper">{formatPrice(Number(c.amount))}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-sm px-2 py-1 text-xs uppercase ${c.status === "paid" ? "bg-tag text-ink" : c.status === "approved" ? "bg-tag/20 text-tag" : "border border-border-strong text-paper-muted"}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-paper-dim">{c.approved_at ? new Date(c.approved_at).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3 text-paper-dim">{c.paid_at ? new Date(c.paid_at).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
            {commissions && commissions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-paper-dim">
                  No commissions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

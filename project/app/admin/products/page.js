"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StepUpModal from "@/components/admin/StepUpModal";

export default function AdminProductsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingBulkAction, setPendingBulkAction] = useState(null);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    fetch(`/api/admin/products?${params}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(load, [page, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const runBulk = async (action) => {
    const res = await fetch("/api/admin/products/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selected, action }),
    });
    if (res.status === 401) {
      const body = await res.json();
      if (body.stepUpRequired) {
        setPendingBulkAction(action);
        setStepUpOpen(true);
        return;
      }
    }
    setSelected([]);
    load();
  };

  const products = data?.products || [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl text-paper">Products</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setPage(1), load())}
            placeholder="Search by name…"
            className="rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper placeholder:text-paper-dim"
          />
          <select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} className="rounded-sm border border-border-strong bg-ink px-3 py-2 text-sm text-paper">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="out_of_stock">Out of stock</option>
            <option value="archived">Archived</option>
          </select>
          <a href="/api/admin/export/products" className="rounded-sm border border-border-strong px-3 py-2 text-xs uppercase text-paper-muted hover:text-paper">
            Export CSV
          </a>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-sm border border-border bg-surface p-3 text-sm">
          <span className="text-paper-muted">{selected.length} selected</span>
          <button onClick={() => runBulk("activate")} className="rounded-sm border border-border-strong px-3 py-1.5 text-xs uppercase text-paper-muted hover:text-paper">
            Activate
          </button>
          <button onClick={() => runBulk("mark_out_of_stock")} className="rounded-sm border border-border-strong px-3 py-1.5 text-xs uppercase text-paper-muted hover:text-paper">
            Mark out of stock
          </button>
          <button onClick={() => runBulk("archive")} className="rounded-sm border border-border-strong px-3 py-1.5 text-xs uppercase text-paper-muted hover:text-paper">
            Archive
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-paper-dim">Loading…</p>
      ) : products.length === 0 ? (
        <p className="text-sm text-paper-dim">No products found.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-paper-dim">
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.length === products.length}
                    onChange={(e) => setSelected(e.target.checked ? products.map((p) => p.id) : [])}
                  />
                </th>
                <th className="px-3 py-3 font-medium">Name</th>
                <th className="px-3 py-3 font-medium">Brand</th>
                <th className="px-3 py-3 font-medium">Category</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-b-0 hover:bg-surface/50">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((id) => id !== p.id))}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/admin/products/${p.id}`} className="text-paper hover:text-tag">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-paper-muted">{p.brands?.name || "—"}</td>
                  <td className="px-3 py-3 text-paper-muted">{p.categories?.name || "—"}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-3 py-3 text-paper-dim">{new Date(p.updated_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <div className="mt-4 flex items-center justify-between text-xs text-paper-dim">
          <span>{data.total} total</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-sm border border-border-strong px-3 py-1.5 disabled:opacity-40">
              Prev
            </button>
            <span>
              Page {page} / {totalPages}
            </span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-sm border border-border-strong px-3 py-1.5 disabled:opacity-40">
              Next
            </button>
          </div>
        </div>
      )}

      <StepUpModal
        open={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
        reason="Bulk product changes require re-authentication."
        onVerified={() => {
          setStepUpOpen(false);
          if (pendingBulkAction) runBulk(pendingBulkAction);
          setPendingBulkAction(null);
        }}
      />
    </div>
  );
}

function StatusBadge({ status }) {
  const tones = { active: "text-tag", out_of_stock: "text-paper-muted", archived: "text-paper-dim" };
  return <span className={`text-xs font-semibold uppercase ${tones[status] || ""}`}>{status?.replace(/_/g, " ")}</span>;
}

"use client";

import { useEffect, useState } from "react";

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/audit-logs?page=${page}&pageSize=50`)
      .then((r) => r.json())
      .then((d) => {
        setLogs(d.logs || []);
        setTotal(d.total || 0);
      })
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div>
      <h1 className="mb-2 font-display text-2xl text-paper">Audit Logs</h1>
      <p className="mb-6 text-xs text-paper-dim">Read-only, append-only — see PHASE-5-CONTEXT.md §20 for the database-level immutability guarantee.</p>

      {loading ? (
        <p className="text-sm text-paper-dim">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-paper-dim">
                <th className="px-3 py-3 font-medium">When</th>
                <th className="px-3 py-3 font-medium">Actor</th>
                <th className="px-3 py-3 font-medium">Action</th>
                <th className="px-3 py-3 font-medium">Entity</th>
                <th className="px-3 py-3 font-medium">Step-up</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-3 text-paper-dim">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="px-3 py-3 text-paper-muted">{l.actor_email || "—"}</td>
                  <td className="px-3 py-3 text-paper">{l.action}</td>
                  <td className="px-3 py-3 text-paper-muted">
                    {l.entity_type}
                    {l.entity_id ? ` · ${l.entity_id.slice(0, 8)}…` : ""}
                  </td>
                  <td className="px-3 py-3 text-paper-muted">{l.step_up_used ? "Yes" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-xs text-paper-dim">
        <span>{total} total</span>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-sm border border-border-strong px-3 py-1.5 disabled:opacity-40">
            Prev
          </button>
          <button disabled={page * 50 >= total} onClick={() => setPage((p) => p + 1)} className="rounded-sm border border-border-strong px-3 py-1.5 disabled:opacity-40">
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

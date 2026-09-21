"use client";

import { useEffect, useState } from "react";

export default function AdminAutomationPage() {
  const [jobs, setJobs] = useState([]);
  const [dlq, setDlq] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/admin/automation").then((r) => r.json()),
      fetch("/api/admin/dlq").then((r) => r.json()),
    ])
      .then(([j, d]) => {
        setJobs(j.jobs || []);
        setDlq(d.items || []);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const runNow = async (jobName) => {
    setRunning(jobName);
    await fetch("/api/admin/automation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job: jobName }),
    });
    setRunning(null);
    load();
  };

  const dlqAction = async (id, action) => {
    await fetch(`/api/admin/dlq/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    load();
  };

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl text-paper">Automation</h1>

      {loading ? (
        <p className="text-sm text-paper-dim">Loading…</p>
      ) : (
        <>
          <div className="mb-10 overflow-x-auto rounded-sm border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-paper-dim">
                  <th className="px-3 py-3 font-medium">Job</th>
                  <th className="px-3 py-3 font-medium">Last status</th>
                  <th className="px-3 py-3 font-medium">Last run</th>
                  <th className="px-3 py-3 font-medium">Processed</th>
                  <th className="px-3 py-3 font-medium">Errors</th>
                  <th className="px-3 py-3 font-medium">DLQ</th>
                  <th className="px-3 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.jobName} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-3 text-paper">{j.jobName}</td>
                    <td className="px-3 py-3">
                      <StatusTag status={j.lastRun?.status} />
                    </td>
                    <td className="px-3 py-3 text-paper-dim">{j.lastRun ? new Date(j.lastRun.started_at).toLocaleString() : "never"}</td>
                    <td className="px-3 py-3 text-paper-muted">{j.lastRun?.records_processed ?? "—"}</td>
                    <td className="px-3 py-3 text-paper-muted">{j.lastRun?.error_count ?? "—"}</td>
                    <td className="px-3 py-3 text-paper-muted">{j.dlqCount}</td>
                    <td className="px-3 py-3 text-right">
                      <button onClick={() => runNow(j.jobName)} disabled={running === j.jobName} className="rounded-sm border border-border-strong px-3 py-1.5 text-xs uppercase text-paper-muted hover:text-paper disabled:opacity-60">
                        {running === j.jobName ? "Running…" : "Run now"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mb-3 text-sm font-semibold text-paper">Dead-letter queue</p>
          {dlq.length === 0 ? (
            <p className="text-sm text-paper-dim">No failed items.</p>
          ) : (
            <div className="overflow-x-auto rounded-sm border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-paper-dim">
                    <th className="px-3 py-3 font-medium">Job</th>
                    <th className="px-3 py-3 font-medium">Source</th>
                    <th className="px-3 py-3 font-medium">Reason</th>
                    <th className="px-3 py-3 font-medium">Category</th>
                    <th className="px-3 py-3 font-medium">Attempts</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dlq.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-3 text-paper">{item.job_name}</td>
                      <td className="px-3 py-3 text-paper-muted">{item.source || "—"}</td>
                      <td className="max-w-xs truncate px-3 py-3 text-paper-muted" title={item.failure_reason}>
                        {item.failure_reason}
                      </td>
                      <td className="px-3 py-3 text-paper-muted">{item.error_category}</td>
                      <td className="px-3 py-3 text-paper-muted">{item.attempt_count}</td>
                      <td className="px-3 py-3 text-paper-muted">{item.status}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {item.status !== "resolved" && (
                            <button onClick={() => dlqAction(item.id, "replay")} className="text-xs uppercase text-tag">
                              Replay
                            </button>
                          )}
                          {item.status !== "resolved" && (
                            <button onClick={() => dlqAction(item.id, "resolve")} className="text-xs uppercase text-paper-muted hover:text-paper">
                              Resolve
                            </button>
                          )}
                          {item.status !== "ignored" && (
                            <button onClick={() => dlqAction(item.id, "ignore")} className="text-xs uppercase text-paper-dim hover:text-paper">
                              Ignore
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatusTag({ status }) {
  const tones = {
    success: "text-tag",
    partial_success: "text-tag/70",
    failed: "text-red-400",
    running: "text-paper-muted",
    skipped: "text-paper-dim",
  };
  return <span className={`text-xs font-semibold uppercase ${tones[status] || "text-paper-dim"}`}>{status || "—"}</span>;
}

"use client";

import { useState } from "react";

/**
 * Prompts for the admin's password, calls POST /api/admin/step-up, and
 * on success invokes `onVerified()` so the caller can retry its original
 * sensitive request (which will now find a valid step-up cookie). Reused
 * by partner credential edits and bulk product actions — one
 * implementation, not one per sensitive-action screen.
 */
export default function StepUpModal({ open, onClose, onVerified, reason }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/step-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("Incorrect password.");
        return;
      }
      setPassword("");
      onVerified();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4">
      <div className="w-full max-w-sm rounded-sm border border-border bg-ink-soft p-6">
        <p className="font-display text-lg text-paper">Confirm it&apos;s you</p>
        <p className="mt-1 text-xs text-paper-dim">{reason || "This action is sensitive and requires re-entering your password."}</p>
        <form onSubmit={submit} className="mt-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="w-full rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper placeholder:text-paper-dim focus:outline-none"
          />
          {error && <p className="mt-2 text-xs text-tag">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-sm border border-border-strong py-2 text-xs uppercase text-paper-muted">
              Cancel
            </button>
            <button type="submit" disabled={loading || !password} className="flex-1 rounded-sm bg-tag py-2 text-xs font-semibold uppercase text-ink disabled:opacity-60">
              {loading ? "Verifying…" : "Confirm"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

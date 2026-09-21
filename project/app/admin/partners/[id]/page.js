"use client";

import { useEffect, useState } from "react";
import StepUpModal from "@/components/admin/StepUpModal";

const INPUT = "w-full rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper mb-3";
const SENSITIVE_FIELDS = ["affiliate_network", "tracking_param_name", "tracking_param_template"];

export default function AdminPartnerEditPage({ params }) {
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingPatch, setPendingPatch] = useState(null);

  useEffect(() => {
    fetch("/api/admin/partners")
      .then((r) => r.json())
      .then((d) => setStore((d.stores || []).find((s) => s.id === params.id) || null))
      .finally(() => setLoading(false));
  }, [params.id]);

  const save = async (patchOverride) => {
    const patch =
      patchOverride || {
        name: store.name,
        base_url: store.base_url,
        status: store.status,
        affiliate_network: store.affiliate_network,
        tracking_param_name: store.tracking_param_name,
      };

    const res = await fetch(`/api/admin/partners/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });

    if (res.status === 401) {
      const body = await res.json();
      if (body.stepUpRequired) {
        setPendingPatch(patch);
        setStepUpOpen(true);
        return;
      }
    }

    const data = await res.json();
    setMessage(res.ok ? "Saved." : data.error || "Could not save.");
    if (res.ok) setStore(data.store);
  };

  if (loading) return <p className="text-sm text-paper-dim">Loading…</p>;
  if (!store) return <p className="text-sm text-paper-dim">Partner not found.</p>;

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 font-display text-2xl text-paper">{store.name}</h1>

      <section className="mb-6 rounded-sm border border-border p-4">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-paper-dim">General</p>
        <input value={store.name || ""} onChange={(e) => setStore({ ...store, name: e.target.value })} placeholder="Name" className={INPUT} />
        <input value={store.base_url || ""} onChange={(e) => setStore({ ...store, base_url: e.target.value })} placeholder="Base URL" className={INPUT} />
        <select value={store.status} onChange={(e) => setStore({ ...store, status: e.target.value })} className={INPUT}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
        </select>
      </section>

      <section className="mb-6 rounded-sm border border-tag/40 p-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-tag">Tracking configuration</p>
        <p className="mb-4 text-xs text-paper-dim">Sensitive — saving a change here requires re-authentication (§6).</p>
        <input
          value={store.affiliate_network || ""}
          onChange={(e) => setStore({ ...store, affiliate_network: e.target.value })}
          placeholder="Network (e.g. direct, generic)"
          className={INPUT}
        />
        <input
          value={store.tracking_param_name || ""}
          onChange={(e) => setStore({ ...store, tracking_param_name: e.target.value })}
          placeholder="Tracking param name (e.g. subid1)"
          className={INPUT}
        />
      </section>

      <button onClick={() => save()} className="rounded-sm bg-tag px-6 py-2.5 text-xs font-semibold uppercase text-ink">
        Save changes
      </button>
      {message && <span className="ml-3 text-xs text-paper-dim">{message}</span>}

      <StepUpModal
        open={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
        reason="Changing partner tracking configuration requires re-authentication."
        onVerified={() => {
          setStepUpOpen(false);
          if (pendingPatch) save(pendingPatch);
          setPendingPatch(null);
        }}
      />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function AdminPartnersPage() {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/partners")
      .then((r) => r.json())
      .then((d) => setStores(d.stores || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl text-paper">Partners</h1>
      {loading ? (
        <p className="text-sm text-paper-dim">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-paper-dim">
                <th className="px-3 py-3 font-medium">Name</th>
                <th className="px-3 py-3 font-medium">Network</th>
                <th className="px-3 py-3 font-medium">Tracking param</th>
                <th className="px-3 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-b-0 hover:bg-surface/50">
                  <td className="px-3 py-3">
                    <Link href={`/admin/partners/${s.id}`} className="text-paper hover:text-tag">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-paper-muted">{s.affiliate_network}</td>
                  <td className="px-3 py-3 text-paper-muted">{s.tracking_param_name}</td>
                  <td className="px-3 py-3 text-paper-muted">{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

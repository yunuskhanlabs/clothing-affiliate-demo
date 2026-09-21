"use client";

import { useEffect, useState } from "react";

export default function AdminBrandsPage() {
  const [brands, setBrands] = useState(null);
  const [form, setForm] = useState({ name: "", slug: "", logo_url: "" });
  const [error, setError] = useState("");

  const load = () => {
    fetch("/api/admin/brands")
      .then((r) => r.json())
      .then((data) => setBrands(data.brands || []));
  };
  useEffect(load, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/admin/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      setError((await res.json()).error || "Could not create brand.");
      return;
    }
    setForm({ name: "", slug: "", logo_url: "" });
    load();
  };

  const toggleStatus = async (brand) => {
    const next = brand.status === "active" ? "inactive" : "active";
    const res = await fetch(`/api/admin/brands/${brand.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) load();
  };

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl text-paper">Brands</h1>

      <form onSubmit={submit} className="mb-8 grid gap-3 rounded-sm border border-border bg-surface p-4 sm:grid-cols-4">
        <input
          required
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper"
        />
        <input
          required
          placeholder="slug"
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
          className="rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper"
        />
        <input
          placeholder="Logo URL (optional)"
          value={form.logo_url}
          onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
          className="rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper"
        />
        <button type="submit" className="rounded-sm bg-tag px-4 py-2 text-xs font-semibold uppercase text-ink">
          Add brand
        </button>
        {error && <p className="text-xs text-tag sm:col-span-4">{error}</p>}
      </form>

      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-paper-dim">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(brands || []).map((b) => (
              <tr key={b.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 text-paper">{b.name}</td>
                <td className="px-4 py-3 text-paper-muted">{b.slug}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleStatus(b)}
                    className={`rounded-sm px-2 py-1 text-xs uppercase ${b.status === "active" ? "bg-tag/20 text-tag" : "border border-border-strong text-paper-dim"}`}
                  >
                    {b.status}
                  </button>
                </td>
                <td className="px-4 py-3 text-right text-paper-dim">—</td>
              </tr>
            ))}
            {brands && brands.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-paper-dim">
                  No brands yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

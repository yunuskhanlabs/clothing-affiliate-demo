"use client";

import { useEffect, useState } from "react";

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState(null);
  const [form, setForm] = useState({ name: "", slug: "", kind: "department", parent_id: "" });
  const [error, setError] = useState("");

  const load = () => {
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((data) => setCategories(data.categories || []));
  };
  useEffect(load, []);

  const departments = (categories || []).filter((c) => c.kind === "department");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, parent_id: form.parent_id || null }),
    });
    if (!res.ok) {
      setError((await res.json()).error || "Could not create category.");
      return;
    }
    setForm({ name: "", slug: "", kind: "department", parent_id: "" });
    load();
  };

  const remove = async (id) => {
    const res = await fetch(`/api/admin/categories/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError((await res.json()).error || "Could not remove category.");
      return;
    }
    load();
  };

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl text-paper">Categories</h1>

      <form onSubmit={submit} className="mb-8 grid gap-3 rounded-sm border border-border bg-surface p-4 sm:grid-cols-5">
        <input
          required
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper sm:col-span-2"
        />
        <input
          required
          placeholder="slug"
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
          className="rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper"
        />
        <select
          value={form.kind}
          onChange={(e) => setForm({ ...form, kind: e.target.value, parent_id: e.target.value === "department" ? "" : form.parent_id })}
          className="rounded-sm border border-border-strong bg-ink px-3 py-2 text-sm text-paper"
        >
          <option value="department">Department</option>
          <option value="subcategory">Subcategory</option>
        </select>
        {form.kind === "subcategory" ? (
          <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })} className="rounded-sm border border-border-strong bg-ink px-3 py-2 text-sm text-paper">
            <option value="">Parent department…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        ) : (
          <div />
        )}
        <button type="submit" className="rounded-sm bg-tag px-4 py-2 text-xs font-semibold uppercase text-ink sm:col-span-5 sm:w-fit">
          Add category
        </button>
        {error && <p className="text-xs text-tag sm:col-span-5">{error}</p>}
      </form>

      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-paper-dim">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Kind</th>
              <th className="px-4 py-3">Parent</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(categories || []).map((c) => (
              <tr key={c.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 text-paper">{c.name}</td>
                <td className="px-4 py-3 text-paper-muted">{c.slug}</td>
                <td className="px-4 py-3 text-paper-muted capitalize">{c.kind}</td>
                <td className="px-4 py-3 text-paper-muted">{departments.find((d) => d.id === c.parent_id)?.name || "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => remove(c.id)} className="text-xs uppercase text-paper-dim hover:text-tag">
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {categories && categories.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-paper-dim">
                  No categories yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

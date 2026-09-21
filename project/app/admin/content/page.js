"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function AdminContentPage() {
  const [articles, setArticles] = useState(null);
  const [form, setForm] = useState({ title: "", slug: "", excerpt: "" });
  const [error, setError] = useState("");

  const load = () => {
    fetch("/api/admin/content")
      .then((r) => r.json())
      .then((data) => setArticles(data.articles || []));
  };
  useEffect(load, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/admin/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      setError((await res.json()).error || "Could not create article.");
      return;
    }
    setForm({ title: "", slug: "", excerpt: "" });
    load();
  };

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl text-paper">Content</h1>

      <form onSubmit={submit} className="mb-8 grid gap-3 rounded-sm border border-border bg-surface p-4 sm:grid-cols-3">
        <input
          required
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
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
          placeholder="Excerpt (optional)"
          value={form.excerpt}
          onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
          className="rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper"
        />
        <button type="submit" className="rounded-sm bg-tag px-4 py-2 text-xs font-semibold uppercase text-ink sm:col-span-3 sm:w-fit">
          Draft article
        </button>
        {error && <p className="text-xs text-tag sm:col-span-3">{error}</p>}
      </form>

      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-paper-dim">
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(articles || []).map((a) => (
              <tr key={a.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 text-paper">{a.title}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-sm px-2 py-1 text-xs uppercase ${a.status === "published" ? "bg-tag/20 text-tag" : "border border-border-strong text-paper-dim"}`}>{a.status}</span>
                </td>
                <td className="px-4 py-3 text-paper-dim">{new Date(a.updated_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/content/${a.id}`} className="text-xs uppercase text-tag hover:text-tag-hover">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {articles && articles.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-paper-dim">
                  No articles yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

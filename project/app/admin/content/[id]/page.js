"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function AdminContentEditPage() {
  const { id } = useParams();
  const router = useRouter();
  const [article, setArticle] = useState(null);
  const [linkedProducts, setLinkedProducts] = useState([]);
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [saved, setSaved] = useState(false);

  const load = () => {
    fetch(`/api/admin/content/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setArticle(data.article);
        setLinkedProducts(data.products || []);
      });
  };
  useEffect(load, [id]);

  useEffect(() => {
    if (!productQuery.trim()) {
      setProductResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/admin/products?q=${encodeURIComponent(productQuery)}&pageSize=5`)
        .then((r) => r.json())
        .then((data) => setProductResults(data.products || []));
    }, 250);
    return () => clearTimeout(t);
  }, [productQuery]);

  const save = async (patch) => {
    setSaved(false);
    const res = await fetch(`/api/admin/content/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      setSaved(true);
      load();
    }
  };

  const addProduct = (product) => {
    if (linkedProducts.some((p) => p.id === product.id)) return;
    const next = [...linkedProducts, product];
    setLinkedProducts(next);
    save({ productIds: next.map((p) => p.id) });
    setProductQuery("");
    setProductResults([]);
  };

  const removeProduct = (productId) => {
    const next = linkedProducts.filter((p) => p.id !== productId);
    setLinkedProducts(next);
    save({ productIds: next.map((p) => p.id) });
  };

  if (!article) return <p className="text-sm text-paper-dim">Loading…</p>;

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl text-paper">{article.title}</h1>
        <button onClick={() => router.push("/admin/content")} className="text-xs uppercase text-paper-dim hover:text-paper">
          ← Back
        </button>
      </div>

      <div className="grid gap-6">
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-paper-dim">Title</span>
          <input
            defaultValue={article.title}
            onBlur={(e) => e.target.value !== article.title && save({ title: e.target.value })}
            className="w-full rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-paper-dim">Excerpt</span>
          <textarea
            defaultValue={article.excerpt || ""}
            onBlur={(e) => save({ excerpt: e.target.value })}
            rows={2}
            className="w-full rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-paper-dim">Body (markdown)</span>
          <textarea
            defaultValue={article.body || ""}
            onBlur={(e) => save({ body: e.target.value })}
            rows={12}
            className="w-full rounded-sm border border-border-strong bg-transparent px-3 py-2 font-mono text-sm text-paper"
          />
        </label>

        <div>
          <span className="mb-2 block text-xs uppercase tracking-wide text-paper-dim">
            Linked products (§25 — structured references, so price/availability shown alongside the article stays current)
          </span>
          <div className="mb-2 flex flex-wrap gap-2">
            {linkedProducts.map((p) => (
              <span key={p.id} className="flex items-center gap-2 rounded-full border border-border-strong px-3 py-1 text-xs text-paper">
                {p.name}
                <button onClick={() => removeProduct(p.id)} className="text-paper-dim hover:text-tag">
                  ✕
                </button>
              </span>
            ))}
          </div>
          <div className="relative max-w-sm">
            <input
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder="Search products to link…"
              className="w-full rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper"
            />
            {productResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-sm border border-border bg-ink-soft">
                {productResults.map((p) => (
                  <button key={p.id} onClick={() => addProduct(p)} className="block w-full px-3 py-2 text-left text-xs text-paper hover:bg-surface">
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-border pt-4">
          <span className="text-xs uppercase tracking-wide text-paper-dim">Status</span>
          {["draft", "published", "archived"].map((s) => (
            <button
              key={s}
              onClick={() => save({ status: s })}
              className={`rounded-sm px-3 py-1.5 text-xs uppercase ${article.status === s ? "bg-tag text-ink" : "border border-border-strong text-paper-muted"}`}
            >
              {s}
            </button>
          ))}
          {saved && <span className="text-xs text-paper-dim">Saved</span>}
        </div>
      </div>
    </div>
  );
}

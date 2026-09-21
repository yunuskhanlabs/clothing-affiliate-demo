"use client";

import { useEffect, useState } from "react";

export default function AdminProductEditPage({ params }) {
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState(null);
  const [variants, setVariants] = useState([]);
  const [images, setImages] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`/api/admin/products/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        setProduct(data.product);
        setVariants(data.variants || []);
        setImages(data.images || []);
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  const save = async () => {
    setSaving(true);
    setMessage("");
    const res = await fetch(`/api/admin/products/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product: {
          name: product.name,
          description: product.description,
          material: product.material,
          fit: product.fit,
          occasion: product.occasion,
          status: product.status,
        },
        variants,
        images,
      }),
    });
    const data = await res.json();
    setMessage(res.ok ? "Saved." : `Partially saved — ${data.errors?.join("; ") || "check fields."}`);
    setSaving(false);
  };

  if (loading) return <p className="text-sm text-paper-dim">Loading…</p>;
  if (!product) return <p className="text-sm text-paper-dim">Product not found.</p>;

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 font-display text-2xl text-paper">{product.name}</h1>

      <section className="mb-8 rounded-sm border border-border p-4">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-paper-dim">Core details</p>
        <Field label="Name">
          <input value={product.name || ""} onChange={(e) => setProduct({ ...product, name: e.target.value })} className="w-full rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper mb-3" />
        </Field>
        <Field label="Description">
          <textarea value={product.description || ""} onChange={(e) => setProduct({ ...product, description: e.target.value })} className="w-full rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper mb-3 h-24" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Material">
            <input value={product.material || ""} onChange={(e) => setProduct({ ...product, material: e.target.value })} className="w-full rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper mb-3" />
          </Field>
          <Field label="Fit">
            <input value={product.fit || ""} onChange={(e) => setProduct({ ...product, fit: e.target.value })} className="w-full rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper mb-3" />
          </Field>
          <Field label="Occasion">
            <input value={product.occasion || ""} onChange={(e) => setProduct({ ...product, occasion: e.target.value })} className="w-full rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper mb-3" />
          </Field>
        </div>
        <Field label="Status">
          <select value={product.status} onChange={(e) => setProduct({ ...product, status: e.target.value })} className="w-full rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper mb-3">
            <option value="active">Active</option>
            <option value="out_of_stock">Out of stock</option>
            <option value="archived">Archived</option>
          </select>
        </Field>
      </section>

      <section className="mb-8 rounded-sm border border-border p-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-paper-dim">Variants</p>
          <button
            onClick={() => setVariants([...variants, { sku: "", color_name: "", color_hex: "#000000", size: "", stock_quantity: 0 }])}
            className="text-xs uppercase text-tag"
          >
            + Add variant
          </button>
        </div>
        {variants.map((v, i) => (
          <div key={v.id || i} className="mb-2 grid grid-cols-6 gap-2">
            <input value={v.sku || ""} onChange={(e) => updateAt(setVariants, variants, i, { sku: e.target.value })} placeholder="SKU" className="w-full rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper mb-3 col-span-2" />
            <input value={v.color_name || ""} onChange={(e) => updateAt(setVariants, variants, i, { color_name: e.target.value })} placeholder="Color" className="w-full rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper mb-3" />
            <input type="color" value={v.color_hex || "#000000"} onChange={(e) => updateAt(setVariants, variants, i, { color_hex: e.target.value })} className="w-full rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper mb-3 p-1" />
            <input value={v.size || ""} onChange={(e) => updateAt(setVariants, variants, i, { size: e.target.value })} placeholder="Size" className="w-full rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper mb-3" />
            <div className="flex gap-1">
              <input
                type="number"
                value={v.stock_quantity ?? 0}
                onChange={(e) => updateAt(setVariants, variants, i, { stock_quantity: Number(e.target.value) })}
                className="w-full rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper mb-3"
              />
              <button onClick={() => setVariants(variants.filter((_, idx) => idx !== i))} className="px-2 text-paper-dim hover:text-tag">
                ✕
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="mb-8 rounded-sm border border-border p-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-paper-dim">Images (3:4 recommended)</p>
          <button onClick={() => setImages([...images, { url: "", alt_text: "", is_primary: images.length === 0 }])} className="text-xs uppercase text-tag">
            + Add image
          </button>
        </div>
        {images.map((img, i) => (
          <div key={img.id || i} className="mb-2 grid grid-cols-6 gap-2">
            <input value={img.url || ""} onChange={(e) => updateAt(setImages, images, i, { url: e.target.value })} placeholder="Image URL" className="w-full rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper mb-3 col-span-3" />
            <input value={img.alt_text || ""} onChange={(e) => updateAt(setImages, images, i, { alt_text: e.target.value })} placeholder="Alt text" className="w-full rounded-sm border border-border-strong bg-transparent px-3 py-2 text-sm text-paper mb-3 col-span-2" />
            <label className="flex items-center gap-1 text-xs text-paper-muted">
              <input type="checkbox" checked={!!img.is_primary} onChange={(e) => updateAt(setImages, images, i, { is_primary: e.target.checked })} />
              Primary
            </label>
          </div>
        ))}
      </section>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="rounded-sm bg-tag px-6 py-2.5 text-xs font-semibold uppercase text-ink disabled:opacity-60">
          {saving ? "Saving…" : "Save changes"}
        </button>
        {message && <span className="text-xs text-paper-dim">{message}</span>}
      </div>
    </div>
  );
}

function updateAt(setter, list, index, patch) {
  const next = [...list];
  next[index] = { ...next[index], ...patch };
  setter(next);
}

function Field({ label, children }) {
  return (
    <label className="mb-1 block">
      <span className="mb-1 block text-xs text-paper-dim">{label}</span>
      {children}
    </label>
  );
}

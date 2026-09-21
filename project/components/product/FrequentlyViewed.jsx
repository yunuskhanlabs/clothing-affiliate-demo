"use client";

import { useEffect, useState } from "react";
import Section, { SectionHeading } from "@/components/ui/Section";
import ProductGrid from "@/components/product/ProductGrid";
import { useRecentlyViewed } from "@/lib/hooks/useRecentlyViewed";

export default function FrequentlyViewed({ excludeId, limit = 8, title = "Recently viewed", eyebrow = "Your history" }) {
  const ids = useRecentlyViewed(excludeId);
  const [products, setProducts] = useState([]);

  // PART 3: this is a "use client" component, so it can't `await`
  // lib/products/index.js (server-only) directly — it fetches through
  // /api/products/by-ids instead, which preserves the ids' ordering
  // (most-recently-viewed first).
  useEffect(() => {
    if (!ids.length) {
      setProducts([]);
      return;
    }
    let cancelled = false;
    const targetIds = ids.slice(0, limit);
    fetch(`/api/products/by-ids?ids=${targetIds.join(",")}`)
      .then((res) => (res.ok ? res.json() : { products: [] }))
      .then(({ products: fetched }) => {
        if (!cancelled) setProducts(fetched);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ids.join(","), limit]);

  if (!products.length) return null;

  return (
    <Section id="recently-viewed">
      <SectionHeading eyebrow={eyebrow} title={title} />
      <ProductGrid products={products} />
    </Section>
  );
}

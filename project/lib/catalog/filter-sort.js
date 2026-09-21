/**
 * Pure filter/sort functions over a Product[] array (see
 * `lib/products/schema.js`). Kept framework-agnostic and side-effect free
 * so Part 3 can move this logic server-side (Supabase RPC / SQL) without
 * changing the shape of `filters` that components already produce via
 * `lib/catalog/query-state.js`.
 */

export function applyFilters(products, filters) {
  return products.filter((p) => {
    if (filters.category && p.category !== filters.category) return false;
    if (filters.subcategory && p.subcategory !== filters.subcategory) return false;
    if (filters.brand?.length && !filters.brand.includes(p.brand.toLowerCase())) return false;
    if (filters.color?.length) {
      const productColors = p.colors.map((c) => c.name.toLowerCase());
      if (!filters.color.some((c) => productColors.includes(c))) return false;
    }
    if (filters.size?.length) {
      const productSizes = p.sizes.map((s) => s.toLowerCase());
      if (!filters.size.some((s) => productSizes.includes(s))) return false;
    }
    if (filters.price_min !== null && p.price < filters.price_min) return false;
    if (filters.price_max !== null && p.price > filters.price_max) return false;
    if (filters.rating !== null && p.rating < filters.rating) return false;
    if (filters.discount !== null && p.discountPercentage < filters.discount) return false;
    if (filters.material && p.material.toLowerCase() !== filters.material) return false;
    if (filters.fit && p.fit.toLowerCase() !== filters.fit) return false;
    if (filters.occasion && p.occasion.toLowerCase() !== filters.occasion) return false;
    if (filters.new && !p.tags.includes("new")) return false;
    if (filters.trending && !p.tags.includes("trending")) return false;
    if (filters.bestseller && !p.tags.includes("bestseller")) return false;
    return true;
  });
}

export function sortProducts(products, sort) {
  const list = [...products];
  switch (sort) {
    case "price_asc":
      return list.sort((a, b) => a.price - b.price);
    case "price_desc":
      return list.sort((a, b) => b.price - a.price);
    case "discount":
      return list.sort((a, b) => b.discountPercentage - a.discountPercentage);
    case "rating":
      return list.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
    case "newest":
      return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    case "popular":
      return list.sort((a, b) => b.reviewCount - a.reviewCount);
    case "relevance":
    default:
      return list;
  }
}

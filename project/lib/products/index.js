import React from "react";
const cache = React.cache || ((fn) => fn);
import {
  MOCK_PRODUCTS,
  MOCK_DEPARTMENTS,
  MOCK_SUBCATEGORIES,
  MOCK_BRANDS,
  MOCK_STORES,
} from "./mock-data.js";
import { applyFilters, sortProducts } from "../catalog/filter-sort.js";

/**
 * STANDALONE DEMO DATA ACCESS LAYER
 *
 * Fully decoupled from Supabase. All functions execute in-memory over
 * `mock-data.js` while maintaining identical signatures and contracts.
 */

const DEFAULT_LIMIT = 500;

export async function getAllProducts({ limit = DEFAULT_LIMIT } = {}) {
  return MOCK_PRODUCTS.slice(0, limit);
}

export async function queryProductCatalog(filters = {}, { page = 1, pageSize = 12 } = {}) {
  let filtered = applyFilters(MOCK_PRODUCTS, filters);

  // Search query support
  if (filters.q && filters.q.trim()) {
    const q = filters.q.toLowerCase().trim();
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.subcategory.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }

  const sorted = sortProducts(filtered, filters.sort || "relevance");
  const total = sorted.length;
  const offset = (page - 1) * pageSize;
  const paginated = sorted.slice(offset, offset + pageSize);

  return {
    products: paginated,
    total,
  };
}

export const getProductBySlug = cache(async (slug) => {
  const product = MOCK_PRODUCTS.find((p) => p.slug === slug);
  if (!product) return null;

  const department = MOCK_DEPARTMENTS.find((d) => d.slug === product.category);
  const subcategory = MOCK_SUBCATEGORIES.find((s) => s.slug === product.subcategory);

  // Generate realistic offers across mock stores
  const formattedOffers = MOCK_STORES.slice(0, 3).map((store, index) => {
    const priceVariance = index === 0 ? 0 : index === 1 ? 50 : 100;
    const price = Math.max(199, product.price + priceVariance);
    const originalPrice = product.originalPrice;
    const discountPercentage =
      originalPrice > price ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;

    return {
      id: `offer-${store.slug}-${product.id}`,
      store: store.name,
      storeSlug: store.slug,
      price,
      originalPrice,
      discountPercentage,
      currency: "INR",
      available: true,
      isBest: index === 0,
      affiliateUrl: `${store.baseUrl}/dp/${product.slug}?tag=cloxtro-demo`,
    };
  });

  return {
    ...product,
    offers: formattedOffers,
    categoryLabel: department?.name || product.category,
    subcategoryLabel: subcategory?.name || product.subcategory,
  };
});

export async function getProductsByCategory(category, { limit = 200 } = {}) {
  return MOCK_PRODUCTS.filter((p) => p.category === category).slice(0, limit);
}

export async function getProductsBySubcategory(category, subcategory, { limit = 200 } = {}) {
  return MOCK_PRODUCTS.filter(
    (p) => p.category === category && p.subcategory === subcategory
  ).slice(0, limit);
}

export async function getSimilarProducts(product, limit = 4) {
  return MOCK_PRODUCTS.filter(
    (p) =>
      p.id !== product.id &&
      (p.subcategory === product.subcategory || p.category === product.category)
  ).slice(0, limit);
}

export async function getRelatedProducts(product, limit = 4) {
  return MOCK_PRODUCTS.filter(
    (p) => p.id !== product.id && p.category === product.category
  ).slice(0, limit);
}

export async function getProductsByIds(ids = []) {
  if (!ids.length) return [];
  const byId = new Map(MOCK_PRODUCTS.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export async function getTaxonomy() {
  const tree = {};
  MOCK_DEPARTMENTS.forEach((d) => (tree[d.slug] = []));
  const seen = new Set();

  MOCK_PRODUCTS.forEach((p) => {
    if (!p.subcategory || !tree[p.category]) return;
    const key = `${p.category}:${p.subcategory}`;
    if (seen.has(key)) return;
    seen.add(key);

    const sub = MOCK_SUBCATEGORIES.find((s) => s.slug === p.subcategory);
    tree[p.category].push({
      slug: p.subcategory,
      name: sub?.name || p.subcategory,
    });
  });

  return tree;
}

export async function getCategoryLabel(category) {
  const dep = MOCK_DEPARTMENTS.find((d) => d.slug === category);
  return dep?.name || { men: "Men", women: "Women", kids: "Kids" }[category] || category;
}

export async function getSubcategoryLabel(_category, subcategorySlug) {
  const sub = MOCK_SUBCATEGORIES.find((s) => s.slug === subcategorySlug);
  return sub?.name || subcategorySlug;
}

export async function getAllSubcategorySlugs() {
  return MOCK_SUBCATEGORIES.map((s) => s.slug);
}

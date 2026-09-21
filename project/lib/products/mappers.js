/**
 * Database → frontend adapter layer (§55).
 *
 * The frontend `Product` shape is defined in `lib/products/schema.js` and
 * was fixed by Part 2 — every component in `components/product/*` and
 * `components/catalog/*` reads that shape. Nothing in Part 3 changes that
 * contract; these functions are the ONLY place a Supabase row gets turned
 * into it, so a future schema change touches one file, not every
 * component.
 */

const TAG_BADGE_LABELS = {
  bestseller: "Bestseller",
  new: "New",
  trending: "Trending",
};

function tagsToBadges(tags = []) {
  return tags.map((t) => TAG_BADGE_LABELS[t]).filter(Boolean);
}

function offerStatusToAvailability(offerStatus, productStatus) {
  if (productStatus === "archived") return "out_of_stock";
  if (offerStatus === "available") return "in_stock";
  return "out_of_stock";
}

/**
 * Maps one row from the `product_listing` view (see migration §13) into
 * the frontend `Product` shape. Used for every catalog/grid/search
 * result, where a single primary image is sufficient.
 */
export function mapListingRowToProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    brand: row.brand,
    category: row.category,
    subcategory: row.subcategory,
    description: row.description || "",
    images: row.primary_image_url ? [row.primary_image_url] : [],
    // Part 4: the winning offer's id, so ProductCard's "View Deal" CTA
    // can link straight to /go/{offerId} instead of the product page
    // (§39). Not part of the original Part 2 schema.js contract — every
    // existing consumer that only destructures the documented fields is
    // unaffected by this addition.
    offerId: row.offer_id || null,
    price: row.price !== null ? Number(row.price) : 0,
    originalPrice: row.original_price !== null ? Number(row.original_price) : row.price !== null ? Number(row.price) : 0,
    discountPercentage: Number(row.discount_percentage) || 0,
    rating: Number(row.rating) || 0,
    reviewCount: Number(row.review_count) || 0,
    colors: Array.isArray(row.colors) ? row.colors : [],
    sizes: Array.isArray(row.sizes) ? row.sizes : [],
    material: row.material || "",
    fit: row.fit || "",
    occasion: row.occasion || "",
    tags: row.tags || [],
    availability: offerStatusToAvailability(row.offer_status, row.status),
    store: row.store || "",
    affiliateUrl: row.affiliate_url || "#",
    badges: tagsToBadges(row.tags),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Not part of the Part 2 frontend contract, but harmless to pass
    // through for anything that wants the raw lifecycle status (e.g. a
    // "no longer available" wishlist row) without breaking existing
    // consumers that only destructure the fields above.
    status: row.status,
  };
}

/**
 * Maps a full product-detail query (product row + its variants + its
 * images + its offers, fetched separately for the richer detail page) —
 * see `getProductBySlug` in `lib/products/index.js`.
 */
export function mapDetailToProduct({ product, brand, department, subcategory, variants, images, bestOffer, store }) {
  const colors = [];
  const seenColors = new Set();
  const sizes = new Set();
  let totalStock = 0;

  for (const v of variants || []) {
    if (v.color_name && !seenColors.has(v.color_name)) {
      seenColors.add(v.color_name);
      colors.push({ name: v.color_name, hex: v.color_hex || "#000000" });
    }
    if (v.size) sizes.add(v.size);
    totalStock += v.stock_quantity || 0;
  }

  const price = bestOffer ? Number(bestOffer.price) : 0;
  const originalPrice = bestOffer?.original_price !== null && bestOffer?.original_price !== undefined ? Number(bestOffer.original_price) : price;
  const discountPercentage = originalPrice > price && originalPrice > 0 ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;

  let availability = offerStatusToAvailability(bestOffer?.status, product.status);
  if (availability === "in_stock" && variants?.length && totalStock > 0 && totalStock <= 5) {
    availability = "low_stock";
  }

  const sortedImages = [...(images || [])].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || a.position - b.position);

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    brand: brand?.name || "",
    category: department?.slug || "",
    subcategory: subcategory?.slug || "",
    description: product.description || "",
    images: sortedImages.map((i) => i.url),
    price,
    originalPrice,
    discountPercentage,
    rating: Number(product.rating) || 0,
    reviewCount: Number(product.review_count) || 0,
    colors,
    sizes: [...sizes],
    material: product.material || "",
    fit: product.fit || "",
    occasion: product.occasion || "",
    tags: product.tags || [],
    availability,
    store: store?.name || "",
    affiliateUrl: bestOffer?.affiliate_url || "#",
    // Part 4: drives ProductCTA's /go/{offerId} link on the detail page.
    offerId: bestOffer?.id || null,
    badges: tagsToBadges(product.tags),
    createdAt: product.created_at,
    updatedAt: product.updated_at,
    status: product.status,
  };
}

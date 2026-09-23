import { SITE_URL, absoluteUrl } from "@/lib/seo/site";

/**
 * PART 6 §13-§15 — schema.org JSON-LD builders.
 *
 * Every field pulled from real product/offer data (`lib/products/schema.js`
 * shape) — never a fabricated rating, review count, availability, or
 * discount (§14). Deliberately omitted, on purpose, not by oversight:
 *
 * - `aggregateRating` — DOES map to real fields (`product.rating`,
 *   `product.reviewCount` exist in the schema), so it's the one rating-
 *   shaped field actually included below — but only when
 *   `reviewCount > 0`; a product with zero reviews gets no
 *   `aggregateRating` block at all rather than a fabricated "0 reviews"
 *   one (some rich-result validators flag `ratingCount: 0` as invalid).
 * - `sku` / `gtin` / `mpn` — no such field exists anywhere in the
 *   product schema or database — never invented (§14 "do NOT publish
 *   false... specifications").
 * - `priceValidUntil` — no expiry date is tracked per offer — omitted
 *   rather than guessed.
 *
 * §15 affiliate integrity: `Offer.seller` names the actual partner
 * store (`stores.name`), never Affiliate Demo itself — Affiliate Demo is not the merchant
 * of record, and schema.org's own `Offer.seller` field exists
 * specifically to express that distinction correctly.
 */

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Affiliate Demo",
    url: SITE_URL,
    description: "Affiliate Demo curates fashion deals and price comparisons across partner stores.",
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Affiliate Demo",
    url: SITE_URL,
    // No SearchAction: Affiliate Demo's search is a client-side-rendered results
    // page driven by URL query state (lib/catalog/query-state.js), not a
    // GET-with-{search_term_string}-substitution endpoint schema.org's
    // SearchAction expects — a SearchAction here would describe a
    // capability the site doesn't actually expose (§13 "use actual
    // data").
  };
}

export function breadcrumbSchema(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: absoluteUrl(item.href) } : {}),
    })),
  };
}

/**
 * @param {import("@/lib/products/schema").Product} product
 * @param {Array<{ id: string, store: string, price: number, available: boolean }>} [offers]
 *   Real offers for this product (§15), in `getOffersForProduct()`'s
 *   exact shape — pass its result directly. Only `available` offers are
 *   published (§14: an out-of-stock/discontinued offer is not a valid
 *   purchasable `Offer`). When none are available, the product's own
 *   `price`/`store` fields (still real database columns) are used as a
 *   single-offer fallback so the page still has SOME offer data rather
 *   than none.
 */
export function productSchema(product, offers = []) {
  const availableOffers = offers.filter((o) => o.available);
  const usableOffers = availableOffers.length > 0 ? availableOffers : [{ id: product.offerId, price: product.price, store: product.store }];

  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.images?.length ? product.images : undefined,
    brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
    url: absoluteUrl(`/product/${product.slug}`),
    offers:
      usableOffers.length === 1
        ? offerSchema(usableOffers[0], product)
        : {
            "@type": "AggregateOffer",
            priceCurrency: "INR",
            lowPrice: Math.min(...usableOffers.map((o) => o.price)),
            highPrice: Math.max(...usableOffers.map((o) => o.price)),
            offerCount: usableOffers.length,
            offers: usableOffers.map((o) => offerSchema(o, product)),
          },
  };

  if (product.reviewCount > 0) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: product.rating,
      reviewCount: product.reviewCount,
    };
  }

  return schema;
}

function offerSchema(offer, product) {
  return {
    "@type": "Offer",
    priceCurrency: "INR",
    price: offer.price,
    availability:
      product.availability === "out_of_stock"
        ? "https://schema.org/OutOfStock"
        : product.availability === "low_stock"
          ? "https://schema.org/LimitedAvailability"
          : "https://schema.org/InStock",
    // §15: the SELLER is the partner store, never Affiliate Demo — Affiliate Demo doesn't
    // hold or ship inventory. `url` points at Affiliate Demo's own tracked
    // redirect (never the raw merchant URL — §41 keeps that
    // server-side-only), which is itself a legitimate `Offer.url`: the
    // page a shopper actually lands on to act on this offer.
    ...(offer.store ? { seller: { "@type": "Organization", name: offer.store } } : {}),
    ...(offer.id ? { url: absoluteUrl(`/go/${offer.id}`) } : {}),
  };
}

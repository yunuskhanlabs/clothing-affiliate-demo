"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PriceTag from "./PriceTag";
import Rating from "./Rating";
import ProductBadge from "./ProductBadge";
import WishlistButton from "./WishlistButton";

export default function ProductCard({ product }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const href = `/product/${product.slug}`;
  const outOfStock = product.availability === "out_of_stock";

  // Instant single-tap / single-click navigation for the whole card
  const handleCardClick = (e) => {
    // If user tapped on wishlist button or a specific button/anchor, let that component handle it
    if (e.target.closest("button") || e.target.closest("[data-prevent-card-click]")) {
      return;
    }
    router.push(href);
  };

  return (
    <article
      onClick={handleCardClick}
      className="group relative flex flex-col cursor-pointer select-none [touch-action:manipulation] active:scale-[0.99] transition-transform duration-150"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-surface border border-border/50">
        {/* Skeleton */}
        {!loaded && !errored && (
          <div className="absolute inset-0 animate-pulse bg-surface-raised" aria-hidden="true" />
        )}

        {/* Primary Image */}
        {!errored && product.images?.[0] ? (
          <Link
            href={href}
            prefetch={true}
            aria-label={`View ${product.name}`}
            className="absolute inset-0 z-0 block focus-visible:outline focus-visible:outline-2 focus-visible:outline-tag"
          >
            <Image
              src={product.images[0]}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              onLoad={() => setLoaded(true)}
              onError={() => setErrored(true)}
              className={`object-cover transition-opacity duration-200 ${
                loaded ? "opacity-100" : "opacity-0"
              }`}
            />
          </Link>
        ) : (
          <Link
            href={href}
            prefetch={true}
            aria-label={`View ${product.name}`}
            className="absolute inset-0 z-0 flex items-center justify-center bg-gradient-to-br from-surface-raised to-surface text-xs text-paper-dim"
          >
            {product.name}
          </Link>
        )}

        {/* Badges */}
        <div className="pointer-events-none absolute inset-x-2 top-2 z-10 flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            {outOfStock ? (
              <ProductBadge label="Out of Stock" />
            ) : product.discountPercentage >= 30 ? (
              <ProductBadge label={`${product.discountPercentage}% OFF`} tone="deal" />
            ) : product.badges?.[0] ? (
              <ProductBadge label={product.badges[0]} />
            ) : null}
          </div>
        </div>

        {/* Wishlist Button - distinct click target with higher z-index */}
        <div className="absolute right-2 top-2 z-20" onClick={(e) => e.stopPropagation()}>
          <WishlistButton productId={product.id} productName={product.name} />
        </div>

        {/* Desktop Quick CTA Slide-in - strictly hidden on touch / mobile so it never blocks single-tap */}
        <div className="hidden lg:block pointer-events-none absolute inset-x-0 bottom-0 z-10 translate-y-full opacity-0 transition-all duration-200 ease-out group-hover:translate-y-0 group-hover:opacity-100">
          <div className="m-2 pointer-events-auto">
            {!outOfStock && product.offerId ? (
              <a
                href={`/go/${product.offerId}`}
                data-prevent-card-click="true"
                onClick={(e) => e.stopPropagation()}
                className="flex w-full items-center justify-center rounded bg-paper py-2.5 text-xs font-semibold uppercase tracking-wide text-ink transition-colors hover:bg-tag hover:text-ink shadow-md"
              >
                View Deal
              </a>
            ) : (
              <span className="flex w-full items-center justify-center rounded bg-paper py-2.5 text-xs font-semibold uppercase tracking-wide text-ink shadow-md">
                View Details
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Product Info */}
      <div className="mt-3 flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-paper-dim">{product.brand}</p>
        <h3 className="line-clamp-1 text-sm font-medium text-paper group-hover:text-tag transition-colors duration-150">
          {product.name}
        </h3>
        <PriceTag
          price={product.price}
          originalPrice={product.originalPrice}
          discountPercentage={product.discountPercentage}
        />
        <div className="flex items-center justify-between pt-0.5">
          <Rating rating={product.rating} reviewCount={product.reviewCount} />
          {product.colors?.length > 0 && (
            <div className="flex items-center gap-1" aria-label={`Available in ${product.colors.length} colors`}>
              {product.colors.slice(0, 4).map((c) => (
                <span
                  key={c.name}
                  className="h-2.5 w-2.5 rounded-full border border-border-strong"
                  style={{ backgroundColor: c.hex }}
                  title={c.name}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

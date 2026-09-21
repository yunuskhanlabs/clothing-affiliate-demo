"use client";

import { useEffect, useState } from "react";
import Gallery from "./Gallery";
import PriceTag from "./PriceTag";
import Rating from "./Rating";
import { ColorSelector, SizeSelector } from "./VariantSelector";
import ProductCTA from "./ProductCTA";
import WishlistButton from "./WishlistButton";
import DeliveryReturnInfo from "./DeliveryReturnInfo";
import AffiliateDisclosure from "./AffiliateDisclosure";
import OfferComparison from "./OfferComparison";
import { recordProductView } from "@/lib/hooks/useRecentlyViewed";
import { trackProductView } from "@/lib/analytics/trackView";

export default function ProductDetailClient({ product, offers, priceDrop }) {
  const [color, setColor] = useState(product.colors?.[0] || null);
  const [size, setSize] = useState(null);

  useEffect(() => {
    recordProductView(product.id); // Part 2/3: local/synced "recently viewed" feature
    trackProductView(product.id); // Part 4: analytics event, separate concern (§25)
  }, [product.id]);

  const available = product.availability !== "out_of_stock";

  return (
    <div className="grid items-start gap-8 lg:grid-cols-12 lg:gap-12">
      <div className="lg:col-span-5 lg:sticky lg:top-28">
        <Gallery images={product.images} productName={product.name} />
      </div>

      <div className="lg:col-span-7">
        {/* Information hierarchy per §26: name → rating → price → discount →
            variants → availability → primary action → info */}
        <p className="text-xs uppercase tracking-[0.15em] text-paper-dim">{product.brand}</p>
        <h1 className="mt-2 font-display text-2xl text-paper sm:text-3xl">{product.name}</h1>

        <div className="mt-3">
          <Rating rating={product.rating} reviewCount={product.reviewCount} size="lg" />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <PriceTag price={product.price} originalPrice={product.originalPrice} discountPercentage={product.discountPercentage} size="lg" />
          {/* §37: only shown when price_history confirms a genuine recent
              decrease — never derived from the MRP discount percentage above. */}
          {priceDrop && (
            <span className="rounded-sm bg-tag/15 px-2 py-1 text-xs font-semibold text-tag">
              ₹{priceDrop.amount.toLocaleString("en-IN")} lower than before
            </span>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-5">
          <ColorSelector colors={product.colors} selected={color} onSelect={setColor} />
          <SizeSelector sizes={product.sizes} selected={size} onSelect={setSize} />
        </div>

        <p className={`mt-4 text-xs font-semibold uppercase tracking-wide ${available ? "text-paper-muted" : "text-tag"}`}>
          {product.availability === "in_stock" && "In stock"}
          {product.availability === "low_stock" && "Only a few left"}
          {product.availability === "out_of_stock" && "Out of stock"}
        </p>

        <div className="mt-6 flex items-center gap-4">
          <ProductCTA offerId={product.offerId} available={available} />
          <WishlistButton productId={product.id} productName={product.name} className="static h-11 w-11 border border-border-strong bg-transparent" />
        </div>

        <AffiliateDisclosure className="mt-3" />

        {offers && offers.length > 1 && (
          <div className="mt-6 border-t border-border pt-6">
            <OfferComparison offers={offers} />
          </div>
        )}

        <p className="mt-8 text-sm leading-relaxed text-paper-muted">{product.description}</p>

        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-6 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-paper-dim">Material</dt>
            <dd className="mt-1 text-paper">{product.material}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-paper-dim">Fit</dt>
            <dd className="mt-1 text-paper">{product.fit}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-paper-dim">Occasion</dt>
            <dd className="mt-1 text-paper">{product.occasion}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-paper-dim">Category</dt>
            <dd className="mt-1 capitalize text-paper">
              {product.category} / {(product.subcategory || "").replace("-", " ")}
            </dd>
          </div>
        </dl>

        <DeliveryReturnInfo store={product.store} />
      </div>
    </div>
  );
}

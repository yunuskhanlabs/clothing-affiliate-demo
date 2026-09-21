import { formatPrice } from "@/lib/format";

export default function PriceTag({ price, originalPrice, discountPercentage, size = "sm" }) {
  const hasDiscount = discountPercentage > 0 && originalPrice > price;
  const priceClass = size === "lg" ? "text-2xl sm:text-3xl" : "text-sm sm:text-base";

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={`font-display ${priceClass} text-paper`}>{formatPrice(price)}</span>
      {hasDiscount && (
        <>
          <span className="text-xs text-paper-dim line-through">{formatPrice(originalPrice)}</span>
          <span className="text-xs font-semibold text-tag">{discountPercentage}% off</span>
        </>
      )}
    </div>
  );
}

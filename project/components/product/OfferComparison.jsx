import { formatPrice } from "@/lib/format";

/**
 * Renders every store's offer for a product (§32/§34). The `offers` prop
 * is already sorted and flagged by `lib/products/offers.js`'s
 * `getOffersForProduct()` — this component only renders, it never
 * re-ranks or filters, so there is exactly one place "Best Price" is
 * decided (§35 — commission never enters that decision because the data
 * this component receives was never joined against commission/conversion
 * data in the first place).
 */
export default function OfferComparison({ offers }) {
  if (!offers?.length) return null;

  return (
    <div>
      <p className="mb-3 font-display text-lg text-paper">Compare prices</p>
      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-paper-dim">
              <th className="px-4 py-3 font-medium">Store</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Discount</th>
              <th className="px-4 py-3 font-medium">Availability</th>
              <th className="px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((offer) => (
              <tr key={offer.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3">
                  <span className="text-paper">{offer.store}</span>
                  {offer.isBest && (
                    <span className="ml-2 rounded-sm bg-tag px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink">
                      Best Price
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="font-display text-paper">{formatPrice(offer.price)}</span>
                  {offer.discountPercentage > 0 && (
                    <span className="ml-1.5 text-xs text-paper-dim line-through">{formatPrice(offer.originalPrice)}</span>
                  )}
                </td>
                <td className="hidden px-4 py-3 text-paper-muted sm:table-cell">
                  {offer.discountPercentage > 0 ? `${offer.discountPercentage}% off` : "—"}
                </td>
                <td className="px-4 py-3">
                  <span className={offer.available ? "text-paper-muted" : "text-paper-dim"}>
                    {offer.available ? "Available" : "Unavailable"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {offer.available ? (
                    <a
                      href={`/go/${offer.id}`}
                      className="inline-block rounded-sm border border-border-strong px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-paper transition-colors hover:border-tag hover:text-tag"
                    >
                      View Deal
                    </a>
                  ) : (
                    <span className="text-xs text-paper-dim">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

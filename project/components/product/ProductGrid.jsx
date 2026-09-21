import ProductCard from "./ProductCard";
import ScrollReveal from "@/components/ui/ScrollReveal";
import { EmptyState } from "@/components/ui/States";

const GRID_CLASSES = "grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4";

export function ProductCardSkeleton() {
  return (
    <div>
      <div className="aspect-[3/4] w-full animate-pulse rounded-sm bg-surface-raised" />
      <div className="mt-3 h-3 w-1/3 animate-pulse rounded-sm bg-surface-raised" />
      <div className="mt-2 h-3 w-3/4 animate-pulse rounded-sm bg-surface-raised" />
      <div className="mt-2 h-3 w-1/2 animate-pulse rounded-sm bg-surface-raised" />
    </div>
  );
}

/**
 * @param {object} props
 * @param {import("@/lib/products/schema").Product[]} [props.products] - when omitted/undefined, renders `skeletonCount` skeletons (loading state)
 * @param {number} [props.skeletonCount]
 * @param {boolean} [props.reveal] - wrap cards in scroll-triggered reveal (default true)
 * @param {React.ReactNode} [props.emptyAction]
 */
export default function ProductGrid({ products, skeletonCount = 8, reveal = true, emptyTitle, emptyDescription, emptyAction }) {
  if (!products) {
    return (
      <div className={GRID_CLASSES}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <EmptyState
        title={emptyTitle || "No products found"}
        description={emptyDescription || "Try adjusting your filters or search terms."}
        action={emptyAction}
      />
    );
  }

  return (
    <div className={GRID_CLASSES}>
      {products.map((product, i) =>
        reveal ? (
          <ScrollReveal key={product.id} delay={(i % 4) * 60}>
            <ProductCard product={product} />
          </ScrollReveal>
        ) : (
          <ProductCard key={product.id} product={product} />
        )
      )}
    </div>
  );
}

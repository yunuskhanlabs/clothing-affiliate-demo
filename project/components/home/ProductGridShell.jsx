import Section, { SectionHeading } from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import ProductGrid from "@/components/product/ProductGrid";

/**
 * Homepage section shell — Part 1 built the chrome (eyebrow/heading/"view
 * all"/skeleton grid); Part 2 extends it to accept a real `products` array
 * and render `ProductCard` via `ProductGrid` instead of the bare skeleton.
 * `count` remains the loading-state fallback when `products` is undefined,
 * per MASTER-ARCHITECTURE.md §8 — don't remove it, Part 3's async data
 * fetching will rely on this same "undefined = loading" contract.
 */
export default function ProductGridShell({
  id,
  eyebrow,
  title,
  description,
  viewAllHref = "/deals",
  count = 4,
  products,
  emptyDescription,
}) {
  return (
    <Section id={id}>
      <SectionHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
        action={
          <Button as="link" href={viewAllHref} variant="ghost" className="normal-case">
            View all →
          </Button>
        }
      />
      <ProductGrid products={products} skeletonCount={count} emptyDescription={emptyDescription} />
    </Section>
  );
}

"use client";

import { useMemo } from "react";
import Container from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/Section";
import { EmptyState, LoadingState } from "@/components/ui/States";
import Button from "@/components/ui/Button";
import ProductGrid from "@/components/product/ProductGrid";
import { useWishlist } from "@/lib/wishlist/WishlistProvider";
import { MOCK_PRODUCTS } from "@/lib/products/mock-data";

export default function WishlistPage() {
  const { ids, ready } = useWishlist();

  const savedProducts = useMemo(() => {
    return MOCK_PRODUCTS.filter((p) => ids.has(p.id));
  }, [ids]);

  if (!ready) {
    return (
      <Container className="pb-16 pt-24 sm:pt-28">
        <SectionHeading eyebrow="Saved" title="Wishlist" />
        <LoadingState label="Loading your wishlist" />
      </Container>
    );
  }

  return (
    <Container className="pb-16 pt-24 sm:pt-28">
      <SectionHeading
        eyebrow="Saved"
        title="Wishlist"
        description={`${savedProducts.length} item${savedProducts.length === 1 ? "" : "s"} saved.`}
      />

      {savedProducts.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          description="Tap the heart icon on any product to add it here."
          action={
            <Button as="link" href="/products" variant="secondary" className="mt-2">
              Browse products
            </Button>
          }
        />
      ) : (
        <ProductGrid products={savedProducts} reveal={false} />
      )}
    </Container>
  );
}

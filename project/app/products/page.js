import { Suspense } from "react";
import Container from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/Section";
import { LoadingState } from "@/components/ui/States";
import CatalogView from "@/components/catalog/CatalogView";

export const metadata = {
  title: "All Products — Affiliate Demo",
  description: "Browse the full Affiliate Demo catalog — filter by category, brand, price, size, color and more.",
  alternates: { canonical: "/products" },
  openGraph: { title: "All Products — Affiliate Demo", description: "Browse the full Affiliate Demo catalog — filter by category, brand, price, size, color and more.", url: "/products" },
};

export default function ProductsPage() {
  return (
    <Container className="pb-16 pt-24 sm:pt-28">
      <SectionHeading eyebrow="Catalog" title="All products" description="Every piece we track, in one place." />
      <Suspense fallback={<LoadingState label="Loading catalog" />}>
        <CatalogView basePath="/products" />
      </Suspense>
    </Container>
  );
}

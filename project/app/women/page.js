import { Suspense } from "react";
import Container from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/Section";
import { LoadingState } from "@/components/ui/States";
import CatalogView from "@/components/catalog/CatalogView";

export const metadata = {
  title: "Women — CLOXTRO",
  description: "Shop Women's fashion — trending pieces, deals, and new arrivals curated by CLOXTRO.",
  alternates: { canonical: "/women" },
  openGraph: { title: "Women — CLOXTRO", description: "Shop Women's fashion — trending pieces, deals, and new arrivals curated by CLOXTRO.", url: "/women" },
};

export default function WomenPage() {
  return (
    <Container className="pb-16 pt-24 sm:pt-28">
      <SectionHeading eyebrow="Department" title="Women" description="Curated Women picks, updated daily." />
      <Suspense fallback={<LoadingState label="Loading catalog" />}>
        <CatalogView basePath="/women" lockedFilters={{ category: "women" }} hideFilterKeys={["category"]} />
      </Suspense>
    </Container>
  );
}

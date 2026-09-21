import { Suspense } from "react";
import Container from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/Section";
import { LoadingState } from "@/components/ui/States";
import CatalogView from "@/components/catalog/CatalogView";

export const metadata = {
  title: "Men — CLOXTRO",
  description: "Shop Men's fashion — trending pieces, deals, and new arrivals curated by CLOXTRO.",
  alternates: { canonical: "/men" },
  openGraph: { title: "Men — CLOXTRO", description: "Shop Men's fashion — trending pieces, deals, and new arrivals curated by CLOXTRO.", url: "/men" },
};

export default function MenPage() {
  return (
    <Container className="pb-16 pt-24 sm:pt-28">
      <SectionHeading eyebrow="Department" title="Men" description="Curated Men picks, updated daily." />
      <Suspense fallback={<LoadingState label="Loading catalog" />}>
        <CatalogView basePath="/men" lockedFilters={{ category: "men" }} hideFilterKeys={["category"]} />
      </Suspense>
    </Container>
  );
}

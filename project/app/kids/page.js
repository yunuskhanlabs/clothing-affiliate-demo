import { Suspense } from "react";
import Container from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/Section";
import { LoadingState } from "@/components/ui/States";
import CatalogView from "@/components/catalog/CatalogView";

export const metadata = {
  title: "Kids — CLOXTRO",
  description: "Shop Kids's fashion — trending pieces, deals, and new arrivals curated by CLOXTRO.",
  alternates: { canonical: "/kids" },
  openGraph: { title: "Kids — CLOXTRO", description: "Shop Kids's fashion — trending pieces, deals, and new arrivals curated by CLOXTRO.", url: "/kids" },
};

export default function KidsPage() {
  return (
    <Container className="pb-16 pt-24 sm:pt-28">
      <SectionHeading eyebrow="Department" title="Kids" description="Curated Kids picks, updated daily." />
      <Suspense fallback={<LoadingState label="Loading catalog" />}>
        <CatalogView basePath="/kids" lockedFilters={{ category: "kids" }} hideFilterKeys={["category"]} />
      </Suspense>
    </Container>
  );
}

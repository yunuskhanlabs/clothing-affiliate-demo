import { Suspense } from "react";
import Container from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/Section";
import { LoadingState } from "@/components/ui/States";
import SearchPageBody from "@/components/catalog/SearchPageBody";

export const metadata = {
  title: "Search — Affiliate Demo",
  description: "Search the Affiliate Demo catalog by name, brand, category, color, or price.",
  alternates: { canonical: "/search" },
  // PART 6 §9: arbitrary user search queries must never be indexed —
  // `follow: true` still lets crawlers reach linked product pages from
  // any search result that does get crawled despite this.
  robots: { index: false, follow: true },
};

export default function SearchPage() {
  return (
    <Container className="pb-16 pt-24 sm:pt-28">
      <SectionHeading eyebrow="Search" title="Find something" />
      <Suspense fallback={<LoadingState label="Loading" />}>
        <SearchPageBody />
      </Suspense>
    </Container>
  );
}

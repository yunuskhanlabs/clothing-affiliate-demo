import { Suspense } from "react";
import { notFound } from "next/navigation";
import Container from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/Section";
import { LoadingState } from "@/components/ui/States";
import Breadcrumb from "@/components/product/Breadcrumb";
import CatalogView from "@/components/catalog/CatalogView";
import { getAllSubcategorySlugs, getSubcategoryLabel } from "@/lib/products";

/**
 * PART 6 §7-§8: this route's own bare path (`/categories/{slug}`) is a
 * stable, curated landing page and gets a real canonical. It does NOT
 * canonicalize away its own filter/sort query parameters
 * (`?price_max=...&sort=...`) to this bare URL — CatalogView's URL-state
 * params represent genuinely different, still-useful views of the same
 * category (§8 "preserve deep linking"), not accidental duplicates, so
 * collapsing them all onto one canonical would tell search engines to
 * ignore user-facing states people actually share/bookmark. The
 * duplicate-content risk that canonicalization exists to prevent is
 * handled instead by §9's approach on the actual arbitrary-query
 * surface (`/search`), not here.
 */
export async function generateMetadata({ params }) {
  const slugs = await getAllSubcategorySlugs();
  if (!slugs.includes(params.slug)) notFound();
  const label = await getSubcategoryLabel(null, params.slug);
  const canonicalPath = `/categories/${params.slug}`;
  const title = `${label} — Affiliate Demo`;
  const description = `Shop ${label} across Men, Women and Kids — filter by price, size, color, brand and more.`;
  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: { title, description, url: canonicalPath },
  };
}

export default async function CategoryPage({ params }) {
  const slugs = await getAllSubcategorySlugs();
  if (!slugs.includes(params.slug)) notFound();
  const label = await getSubcategoryLabel(null, params.slug);

  return (
    <Container className="pb-16 pt-24 sm:pt-28">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Categories", href: "/categories" }, { label }]} />
      <SectionHeading eyebrow="Category" title={label} description={`Every ${label.toLowerCase()} we track, across Men, Women and Kids.`} />
      <Suspense fallback={<LoadingState label="Loading catalog" />}>
        <CatalogView basePath={`/categories/${params.slug}`} lockedFilters={{ subcategory: params.slug }} hideFilterKeys={[]} />
      </Suspense>
    </Container>
  );
}

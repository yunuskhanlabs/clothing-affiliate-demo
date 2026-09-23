import { notFound } from "next/navigation";
import Section, { SectionHeading } from "@/components/ui/Section";
import Container from "@/components/ui/Container";
import Breadcrumb from "@/components/product/Breadcrumb";
import ProductDetailClient from "@/components/product/ProductDetailClient";
import ProductGrid from "@/components/product/ProductGrid";
import FrequentlyViewed from "@/components/product/FrequentlyViewed";
import AffiliateDisclosure from "@/components/product/AffiliateDisclosure";
import { getProductBySlug, getSimilarProducts, getRelatedProducts, getCategoryLabel, getSubcategoryLabel } from "@/lib/products";
import { getOffersForProduct } from "@/lib/products/offers";
import { getRecentPriceDrop } from "@/lib/products/price-history";
import { absoluteUrl } from "@/lib/seo/site";
import { productSchema, breadcrumbSchema } from "@/lib/seo/schema";

/**
 * PART 6 §5-§7, §14, §16: metadata built entirely from this specific
 * product's own real fields — never a shared template string repeated
 * across products (§5 "Do NOT hardcode identical metadata for every
 * product"). `alternates.canonical` is the product's own stable slug
 * URL — this page never receives filter/sort/tracking query parameters
 * itself (those live on catalog/listing routes), so there is no
 * duplicate-content variant of this exact URL to canonicalize away
 * (§7). Open Graph image uses the product's own primary photo where one
 * exists, so social shares don't inherit an unrelated site-wide image.
 */
export async function generateMetadata({ params }) {
  const product = await getProductBySlug(params.slug);
  if (!product || product.status === "archived" || product.status === "inactive") notFound();

  const canonicalPath = `/product/${product.slug}`;
  const title = `${product.name} — Affiliate Demo`;
  const description = product.description;
  const image = product.images?.[0];

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title,
      description,
      url: absoluteUrl(canonicalPath),
      type: "website", // schema.org Product/Offer JSON-LD below carries the commerce-specific facts; OG type stays generic (no "product" OG namespace tags are wired up)
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function ProductDetailPage({ params }) {
  const product = await getProductBySlug(params.slug);
  if (!product || product.status === "archived" || product.status === "inactive") notFound();

  const [similar, related, priceDrop] = await Promise.all([
    getSimilarProducts(product, 4),
    getRelatedProducts(product, 4),
    product.offerId ? getRecentPriceDrop(product.offerId) : Promise.resolve(null),
  ]);

  const categoryLabel = product.categoryLabel || product.category;
  const subcategoryLabel = product.subcategoryLabel || product.subcategory;
  const offers = product.offers?.length ? product.offers : await getOffersForProduct(product.id);

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: categoryLabel, href: `/${product.category}` },
    { label: subcategoryLabel, href: `/categories/${product.subcategory}` },
    { label: product.name },
  ];

  return (
    <>
      {/* PART 6 §13-§15: Product + Offer/AggregateOffer + BreadcrumbList
          JSON-LD, built strictly from this product's and its offers' real
          database fields — see lib/seo/schema.js for exactly which
          fields are (and are deliberately never) included. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema(product, offers)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema(breadcrumbItems)) }} />

      <Container className="pt-28 sm:pt-32">
        <Breadcrumb items={breadcrumbItems} />
        <ProductDetailClient product={product} offers={offers} priceDrop={priceDrop} />
      </Container>

      {similar.length > 0 && (
        <Section id="similar-products">
          <SectionHeading eyebrow="You might like" title="Similar products" />
          <ProductGrid products={similar} />
        </Section>
      )}

      {related.length > 0 && (
        <Section id="related-products">
          <SectionHeading eyebrow="Complete the look" title="Related products" />
          <ProductGrid products={related} />
        </Section>
      )}

      <FrequentlyViewed excludeId={product.id} limit={4} title="Frequently viewed" />

      <Container className="pb-16">
        <AffiliateDisclosure />
      </Container>
    </>
  );
}

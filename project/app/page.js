import HeroSlider from "@/components/home/HeroSlider";
import CategoryShell from "@/components/home/CategoryShell";
import CategoryHighlights from "@/components/home/CategoryHighlights";
import ProductGridShell from "@/components/home/ProductGridShell";
import PriceBandShell from "@/components/home/PriceBandShell";
import FrequentlyViewed from "@/components/product/FrequentlyViewed";
import PersonalizedShell from "@/components/home/PersonalizedShell";
import { getAllProducts } from "@/lib/products";
import { sortProducts } from "@/lib/catalog/filter-sort";

export const metadata = {
  title: "Affiliate Demo — Fashion Discovery & Deals",
  description:
    "Affiliate Demo curates the best fashion deals across the web — trending pieces, price drops, and new arrivals, all in one place.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Affiliate Demo — Fashion Discovery & Deals",
    description:
      "Affiliate Demo curates the best fashion deals across the web — trending pieces, price drops, and new arrivals, all in one place.",
    url: "/",
  },
};

export default async function HomePage() {
  const all = await getAllProducts();

  const trending = sortProducts(all.filter((p) => p.tags.includes("trending")), "popular").slice(0, 8);
  const deals = sortProducts(all.filter((p) => p.discountPercentage > 0), "discount").slice(0, 8);
  const newArrivals = sortProducts(all, "newest").slice(0, 8);
  const bestSellers = sortProducts(
    all.filter((p) => p.tags.includes("bestseller")).length >= 8 ? all.filter((p) => p.tags.includes("bestseller")) : all,
    "popular"
  ).slice(0, 8);
  const under499 = sortProducts(all.filter((p) => p.price <= 499), "price_asc").slice(0, 8);
  const under999 = sortProducts(
    all.filter((p) => p.price <= 999 && p.price > 499),
    "price_asc"
  ).slice(0, 8);
  const seasonal = sortProducts(all, "rating").slice(0, 8);

  return (
    <>
      <HeroSlider />
      <CategoryHighlights />
      <CategoryShell />
      <ProductGridShell
        id="trending"
        eyebrow="Right now"
        title="Trending products"
        description="What everyone's adding to cart this week."
        viewAllHref="/products?trending=1"
        products={trending}
      />
      <ProductGridShell
        id="deals"
        eyebrow="Today only"
        title="Today's best deals"
        description="Real price drops, tracked across every store we watch."
        viewAllHref="/deals"
        products={deals}
      />
      <PriceBandShell />
      <ProductGridShell
        id="under-499"
        eyebrow="Budget edit"
        title="Under ₹499"
        viewAllHref="/deals?price_max=499"
        products={under499}
      />
      <ProductGridShell
        id="under-999"
        eyebrow="Budget edit"
        title="Under ₹999"
        viewAllHref="/deals?price_max=999"
        products={under999}
      />
      <ProductGridShell id="new-arrivals" eyebrow="Just landed" title="New arrivals" viewAllHref="/products?sort=newest" products={newArrivals} />
      <ProductGridShell
        id="best-sellers"
        eyebrow="Most loved"
        title="Best sellers"
        viewAllHref="/products?bestseller=1"
        products={bestSellers}
      />
      <ProductGridShell
        id="seasonal"
        eyebrow="Edit"
        title="Seasonal collection"
        description="Pieces built for what's next on the calendar."
        viewAllHref="/products?sort=rating"
        products={seasonal}
      />
      <FrequentlyViewed limit={8} title="Recently viewed" />
      <PersonalizedShell />
    </>
  );
}

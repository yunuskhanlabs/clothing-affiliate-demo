import Hero from "@/components/home/Hero";
import CategoryShell from "@/components/home/CategoryShell";
import ProductGridShell from "@/components/home/ProductGridShell";
import PriceBandShell from "@/components/home/PriceBandShell";
import PersonalizedShell from "@/components/home/PersonalizedShell";

export default function HomePage() {
  return (
    <>
      <Hero />
      <CategoryShell />
      <ProductGridShell
        id="trending"
        eyebrow="Right now"
        title="Trending products"
        description="What everyone's adding to cart this week."
      />
      <ProductGridShell
        id="deals"
        eyebrow="Today only"
        title="Today's best deals"
        description="Real price drops, tracked across every store we watch."
      />
      <PriceBandShell />
      <ProductGridShell
        id="new-arrivals"
        eyebrow="Just landed"
        title="New arrivals"
      />
      <ProductGridShell
        id="best-sellers"
        eyebrow="Most loved"
        title="Best sellers"
      />
      <ProductGridShell
        id="seasonal"
        eyebrow="Edit"
        title="Seasonal collection"
        description="Pieces built for what's next on the calendar."
      />
      <PersonalizedShell />
    </>
  );
}

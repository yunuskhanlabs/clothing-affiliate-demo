import Section, { SectionHeading } from "@/components/ui/Section";
import ProductGrid from "@/components/product/ProductGrid";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getPersonalizedRecommendations } from "@/lib/ai/recommendations";

/** True when the app is running against a dummy/absent Supabase URL (demo mode). */
const IS_DEMO_MODE =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes("dummy-demo") ||
  process.env.DEMO_MODE === "true";

/**
 * Part 5: wired to the real recommendation engine (§56-§58). Signed-in
 * users with wishlist history get personalized picks; everyone else
 * (including signed-out visitors, §57 "a new user should still receive
 * useful recommendations") sees the popularity-based fallback — never an
 * empty section, never fabricated personalization.
 */
export default async function PersonalizedShell() {
  let wishlistProductIds = [];

  if (!IS_DEMO_MODE) {
    // Only attempt Supabase auth/DB calls when a real URL is configured.
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data } = await supabase
        .from("wishlist_items")
        .select("product_id")
        .eq("user_id", user.id)
        .limit(20);
      wishlistProductIds = (data || []).map((w) => w.product_id);
    }
  }

  const { products, personalized } = await getPersonalizedRecommendations({ wishlistProductIds });

  return (
    <Section id="for-you">
      <SectionHeading
        eyebrow="For you"
        title={personalized ? "Picked for you" : "Popular right now"}
        description={personalized ? "Based on what you've saved." : "Sign in and save a few pieces — Affiliate Demo will start learning your style."}
      />
      <ProductGrid products={products} />
    </Section>
  );
}

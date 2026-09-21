import { MOCK_STORES } from "./mock-data";

export async function getOffersForProduct(productId) {
  return MOCK_STORES.slice(0, 3).map((store, index) => {
    const priceVariance = index === 0 ? 0 : index === 1 ? 50 : 100;
    const price = Math.max(199, 899 + priceVariance);
    const originalPrice = 1499;
    const discountPercentage = Math.round(((originalPrice - price) / originalPrice) * 100);

    return {
      id: `offer-${store.slug}-${productId}`,
      store: store.name,
      storeSlug: store.slug,
      price,
      originalPrice,
      discountPercentage,
      currency: "INR",
      available: true,
      isBest: index === 0,
      affiliateUrl: `${store.baseUrl}/dp/${productId}?tag=cloxtro-demo`,
    };
  });
}

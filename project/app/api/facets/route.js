import { NextResponse } from "next/server";
import { MOCK_BRANDS, MOCK_PRODUCTS } from "@/lib/products/mock-data";

/**
 * GET /api/facets — Standalone Demo Version
 *
 * In-memory facets derived directly from mock catalog data.
 */
export async function GET() {
  const colorMap = new Map();
  MOCK_PRODUCTS.forEach((p) => {
    p.colors.forEach((c) => {
      if (c.name && !colorMap.has(c.name)) {
        colorMap.set(c.name, c.hex || "#8a8577");
      }
    });
  });

  const uniqueSorted = (values) => [...new Set(values.filter(Boolean))].sort();

  return NextResponse.json({
    brands: MOCK_BRANDS.map((b) => b.name),
    colors: [...colorMap.entries()].map(([name, hex]) => ({ name, hex })),
    materials: uniqueSorted(MOCK_PRODUCTS.map((p) => p.material)),
    fits: uniqueSorted(MOCK_PRODUCTS.map((p) => p.fit)),
    occasions: uniqueSorted(MOCK_PRODUCTS.map((p) => p.occasion)),
  });
}

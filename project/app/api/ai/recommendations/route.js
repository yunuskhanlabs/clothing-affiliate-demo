import { NextResponse } from "next/server";
import { MOCK_PRODUCTS } from "@/lib/products/mock-data";

export const dynamic = "force-dynamic";

export async function GET() {
  // Return top products for personalized recommendations rail in demo mode
  const recommended = MOCK_PRODUCTS.slice(0, 8);
  return NextResponse.json({
    products: recommended,
    mode: "demo",
  });
}

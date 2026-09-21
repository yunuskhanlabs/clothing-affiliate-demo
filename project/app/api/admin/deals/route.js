import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { MOCK_PRODUCTS } from "@/lib/products/mock-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const deals = MOCK_PRODUCTS.filter((p) => p.discountPercentage >= 40).map((p, i) => ({
    id: `deal-${i + 1}`,
    title: `${p.discountPercentage}% OFF on ${p.name}`,
    product_id: p.id,
    product_name: p.name,
    discount_percentage: p.discountPercentage,
    status: "active",
    start_date: "2026-03-01",
    end_date: "2026-03-31",
  }));
  return NextResponse.json({ deals });
}

export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await request.json();
  const deal = {
    id: `deal-${Date.now()}`,
    title: body.title || "New Deal",
    status: "active",
  };
  return NextResponse.json({ deal }, { status: 201 });
}

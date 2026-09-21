import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { MOCK_PRODUCTS } from "@/lib/products/mock-data";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.toLowerCase() || "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 25));

  let filtered = MOCK_PRODUCTS;
  if (q) {
    filtered = filtered.filter((p) => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q));
  }

  const mapped = filtered.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    status: p.availability === "in_stock" ? "active" : "out_of_stock",
    rating: p.rating,
    review_count: p.reviewCount,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    price: p.price,
    brands: { name: p.brand },
    categories: { name: p.category.toUpperCase(), slug: p.category },
  }));

  return NextResponse.json({
    products: mapped,
    total: mapped.length,
    page,
    pageSize,
  });
}

export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await request.json();
  return NextResponse.json({ product: { id: `p-${Date.now()}`, ...body } }, { status: 201 });
}

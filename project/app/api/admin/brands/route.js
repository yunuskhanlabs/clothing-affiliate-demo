import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { MOCK_BRANDS } from "@/lib/products/mock-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const brands = MOCK_BRANDS.map((b, idx) => ({
    id: `brand-${idx + 1}`,
    name: b.name,
    slug: b.slug,
    status: "active",
  }));
  return NextResponse.json({ brands });
}

export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await request.json();
  const brand = {
    id: `brand-${Date.now()}`,
    name: body.name || "New Brand",
    slug: body.slug || "new-brand",
    status: "active",
  };
  return NextResponse.json({ brand }, { status: 201 });
}

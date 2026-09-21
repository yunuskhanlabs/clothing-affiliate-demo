import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { MOCK_DEPARTMENTS, MOCK_SUBCATEGORIES } from "@/lib/products/mock-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const categories = [
    ...MOCK_DEPARTMENTS.map((d, i) => ({ id: `cat-dep-${i}`, ...d })),
    ...MOCK_SUBCATEGORIES.map((s, i) => ({ id: `cat-sub-${i}`, ...s })),
  ];
  return NextResponse.json({ categories });
}

export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await request.json();
  const category = {
    id: `cat-${Date.now()}`,
    name: body.name || "New Category",
    slug: body.slug || "new-category",
    kind: body.kind || "subcategory",
  };
  return NextResponse.json({ category }, { status: 201 });
}

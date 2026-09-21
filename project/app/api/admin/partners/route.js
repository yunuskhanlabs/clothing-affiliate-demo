import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { MOCK_STORES } from "@/lib/products/mock-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const stores = MOCK_STORES.map((s) => ({
    ...s,
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
  }));
  return NextResponse.json({ stores });
}

export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await request.json();
  const newStore = {
    id: `store-${Date.now()}`,
    name: body.name || "New Store",
    slug: body.slug || "new-store",
    base_url: body.base_url || "https://example.com",
    status: "active",
  };
  return NextResponse.json({ store: newStore }, { status: 201 });
}

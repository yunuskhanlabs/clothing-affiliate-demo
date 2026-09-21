import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const articles = [
    {
      id: "art-1",
      title: "Summer 2026 Style Guide: Essential Linen & Minimalist Staples",
      slug: "summer-2026-style-guide",
      status: "published",
      updated_at: "2026-03-12T10:00:00Z",
    },
    {
      id: "art-2",
      title: "How to Build a Capsule Wardrobe Under ₹5000",
      slug: "capsule-wardrobe-under-5000",
      status: "published",
      updated_at: "2026-03-08T14:30:00Z",
    },
    {
      id: "art-3",
      title: "Best Denim Fits Ranked: Straight vs Baggy vs Tapered",
      slug: "best-denim-fits-ranked",
      status: "published",
      updated_at: "2026-03-02T11:20:00Z",
    },
  ];
  return NextResponse.json({ articles });
}

export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await request.json();
  return NextResponse.json({ article: { id: `art-${Date.now()}`, ...body } }, { status: 201 });
}

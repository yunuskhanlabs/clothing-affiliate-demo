import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";

export async function GET() {
  const admin = await requireAdmin();
  if (admin) {
    return NextResponse.json({ user: admin.user });
  }
  return NextResponse.json({ user: null });
}

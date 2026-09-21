import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const limited = await rateLimitOr429Async(request, "admin-brands", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const patch = {};
  for (const key of ["name", "slug", "logo_url", "status"]) {
    if (key in body) patch[key] = body[key];
  }

  const { data, error } = await admin.supabase.from("brands").update(patch).eq("id", params.id).select().single();
  if (error) {
    console.error("/api/admin/brands/[id] PATCH:", error.message);
    return NextResponse.json({ error: "Could not update brand." }, { status: 400 });
  }

  await logAdminAction({ supabase: admin.supabase, actor: admin.user, action: "brand.updated", entityType: "brand", entityId: params.id, metadata: { changedKeys: Object.keys(patch) } });
  return NextResponse.json({ brand: data });
}

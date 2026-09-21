import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const limited = await rateLimitOr429Async(request, "admin-deals", { limit: 30, windowMs: 60_000 });
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
  for (const key of ["headline", "ends_at", "is_active"]) {
    if (key in body) patch[key] = body[key];
  }

  const { data, error } = await admin.supabase.from("deals").update(patch).eq("id", params.id).select().single();
  if (error) {
    console.error("/api/admin/deals/[id] PATCH:", error.message);
    return NextResponse.json({ error: "Could not update deal." }, { status: 400 });
  }

  await logAdminAction({ supabase: admin.supabase, actor: admin.user, action: "deal.updated", entityType: "deal", entityId: params.id, metadata: { changedKeys: Object.keys(patch) } });
  return NextResponse.json({ deal: data });
}

export async function DELETE(request, { params }) {
  const limited = await rateLimitOr429Async(request, "admin-deals", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const { error } = await admin.supabase.from("deals").delete().eq("id", params.id);
  if (error) {
    console.error("/api/admin/deals/[id] DELETE:", error.message);
    return NextResponse.json({ error: "Could not remove deal." }, { status: 400 });
  }

  await logAdminAction({ supabase: admin.supabase, actor: admin.user, action: "deal.removed", entityType: "deal", entityId: params.id });
  return NextResponse.json({ ok: true });
}

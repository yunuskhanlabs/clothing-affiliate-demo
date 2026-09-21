import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const limited = await rateLimitOr429Async(request, "admin-categories", { limit: 30, windowMs: 60_000 });
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
  for (const key of ["name", "slug", "parent_id", "sort_order"]) {
    if (key in body) patch[key] = body[key];
  }

  const { data, error } = await admin.supabase.from("categories").update(patch).eq("id", params.id).select().single();
  if (error) {
    console.error("/api/admin/categories/[id] PATCH:", error.message);
    return NextResponse.json({ error: "Could not update category." }, { status: 400 });
  }

  await logAdminAction({ supabase: admin.supabase, actor: admin.user, action: "category.updated", entityType: "category", entityId: params.id, metadata: { changedKeys: Object.keys(patch) } });
  return NextResponse.json({ category: data });
}

/**
 * §15: "do not delete categories that still have dependent products
 * without a safe migration strategy." This route refuses outright when
 * dependents exist, rather than attempting an automatic migration —
 * safer default; an admin who genuinely wants to retire a category first
 * reassigns its products via the product edit screen.
 */
export async function DELETE(request, { params }) {
  const limited = await rateLimitOr429Async(request, "admin-categories", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const { count } = await admin.supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .or(`department_id.eq.${params.id},subcategory_id.eq.${params.id}`);

  if (count && count > 0) {
    return NextResponse.json({ error: `Cannot remove — ${count} product(s) still reference this category. Reassign them first.` }, { status: 409 });
  }

  const { error } = await admin.supabase.from("categories").delete().eq("id", params.id);
  if (error) {
    console.error("/api/admin/categories/[id] DELETE:", error.message);
    return NextResponse.json({ error: "Could not remove category." }, { status: 400 });
  }

  await logAdminAction({ supabase: admin.supabase, actor: admin.user, action: "category.deleted", entityType: "category", entityId: params.id });
  return NextResponse.json({ ok: true });
}

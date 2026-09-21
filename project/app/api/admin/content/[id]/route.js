import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";
import { isValidImageUrl } from "@/lib/security/url-validation";

export const dynamic = "force-dynamic";

const FIELDS = ["title", "slug", "excerpt", "body", "featured_image", "status", "published_at"];

export async function GET(request, { params }) {
  const limited = await rateLimitOr429Async(request, "admin-content", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const { data: article, error } = await admin.supabase.from("content_articles").select("*").eq("id", params.id).maybeSingle();
  if (error || !article) return NextResponse.json({ error: "Article not found." }, { status: 404 });

  const { data: links } = await admin.supabase
    .from("content_article_products")
    .select("position, products(id, name, slug)")
    .eq("article_id", params.id)
    .order("position");

  return NextResponse.json({ article, products: (links || []).map((l) => l.products) });
}

export async function PATCH(request, { params }) {
  const limited = await rateLimitOr429Async(request, "admin-content", { limit: 30, windowMs: 60_000 });
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
  for (const key of FIELDS) {
    if (key in body) patch[key] = body[key];
  }

  if (patch.featured_image && !isValidImageUrl(patch.featured_image)) {
    return NextResponse.json({ error: "Invalid featured image URL. Must be a valid HTTP or HTTPS URL." }, { status: 400 });
  }
  // Publishing sets published_at automatically if the caller didn't supply one.
  if (patch.status === "published" && !patch.published_at) patch.published_at = new Date().toISOString();

  let article = null;
  if (Object.keys(patch).length) {
    const { data, error } = await admin.supabase.from("content_articles").update(patch).eq("id", params.id).select().single();
    if (error) {
      console.error("/api/admin/content/[id] PATCH:", error.message);
      return NextResponse.json({ error: "Could not update article." }, { status: 400 });
    }
    article = data;
  }

  if (Array.isArray(body.productIds)) {
    await admin.supabase.from("content_article_products").delete().eq("article_id", params.id);
    if (body.productIds.length) {
      const rows = body.productIds.map((product_id, position) => ({ article_id: params.id, product_id, position }));
      const { error: linkError } = await admin.supabase.from("content_article_products").insert(rows);
      if (linkError) console.error("content_article_products replace:", linkError.message);
    }
  }

  await logAdminAction({
    supabase: admin.supabase,
    actor: admin.user,
    action: "content.updated",
    entityType: "content_article",
    entityId: params.id,
    metadata: { changedKeys: Object.keys(patch), productsLinked: Array.isArray(body.productIds) ? body.productIds.length : undefined },
  });

  return NextResponse.json({ article });
}

export async function DELETE(request, { params }) {
  const limited = await rateLimitOr429Async(request, "admin-content", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const { error } = await admin.supabase.from("content_articles").update({ status: "archived" }).eq("id", params.id);
  if (error) {
    console.error("/api/admin/content/[id] DELETE:", error.message);
    return NextResponse.json({ error: "Could not archive article." }, { status: 400 });
  }

  await logAdminAction({ supabase: admin.supabase, actor: admin.user, action: "content.archived", entityType: "content_article", entityId: params.id });
  return NextResponse.json({ ok: true });
}

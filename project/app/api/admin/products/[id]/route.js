import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";
import { isValidImageUrl } from "@/lib/security/url-validation";

export const dynamic = "force-dynamic";

const PRODUCT_FIELDS = ["name", "description", "brand_id", "department_id", "subcategory_id", "material", "fit", "occasion", "tags", "status", "rating", "review_count"];

export async function GET(request, { params }) {
  const limited = await rateLimitOr429Async(request, "admin-products", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const { data: product, error } = await admin.supabase.from("products").select("*").eq("id", params.id).maybeSingle();
  if (error || !product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  const [{ data: variants }, { data: images }] = await Promise.all([
    admin.supabase.from("product_variants").select("*").eq("product_id", params.id).order("created_at"),
    admin.supabase.from("product_images").select("*").eq("product_id", params.id).order("position"),
  ]);

  return NextResponse.json({ product, variants: variants || [], images: images || [] });
}

/**
 * PATCH /api/admin/products/[id]
 * Body: { product?: {...fields}, variants?: [...], images?: [...] }
 *
 * `variants`/`images`, when present, are treated as the FULL desired set
 * (§13, §14): rows with an existing `id` are updated, rows without one
 * are inserted, and existing rows not present in the payload are
 * deleted. This uses the same `product_variants`/`product_images` tables
 * the public storefront reads (§13 "use the same database model as the
 * public site... do not duplicate variant logic").
 *
 * Not wrapped in a single database transaction (PostgREST issues one
 * statement per call) — see PHASE-5-CONTEXT.md's "known limitations" for
 * the documented tradeoff; each individual write is still atomic, and a
 * partial failure is reported rather than silently swallowed (§71 shape,
 * applied here even though this endpoint itself isn't the bulk-ops one).
 */
export async function PATCH(request, { params }) {
  const limited = await rateLimitOr429Async(request, "admin-products", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const changes = {};
  const errors = [];
  let updatedProduct = null;

  if (body.product && typeof body.product === "object") {
    const patch = {};
    for (const key of PRODUCT_FIELDS) {
      if (key in body.product) patch[key] = body.product[key];
    }
    if (Object.keys(patch).length > 0) {
      const { data, error } = await admin.supabase.from("products").update(patch).eq("id", params.id).select().single();
      if (error) errors.push(`product: ${error.message}`);
      else {
        updatedProduct = data;
        changes.product = patch;
      }
    }
  }

  if (Array.isArray(body.variants)) {
    const { data: existing } = await admin.supabase.from("product_variants").select("id").eq("product_id", params.id);
    const keepIds = body.variants.filter((v) => v.id).map((v) => v.id);
    const toDelete = (existing || []).map((v) => v.id).filter((id) => !keepIds.includes(id));
    if (toDelete.length) {
      const { error } = await admin.supabase.from("product_variants").delete().in("id", toDelete);
      if (error) errors.push(`variants delete: ${error.message}`);
    }
    for (const v of body.variants) {
      const row = {
        product_id: params.id,
        sku: v.sku,
        color_name: v.color_name || null,
        color_hex: v.color_hex || null,
        size: v.size || null,
        stock_quantity: v.stock_quantity ?? 0,
        is_default: !!v.is_default,
      };
      const { error } = v.id
        ? await admin.supabase.from("product_variants").update(row).eq("id", v.id)
        : await admin.supabase.from("product_variants").insert(row);
      if (error) errors.push(`variant ${v.sku || ""}: ${error.message}`);
    }
    changes.variants = body.variants.length;
  }

  if (Array.isArray(body.images)) {
    for (const img of body.images) {
      if (!img || !img.url || !isValidImageUrl(img.url)) {
        return NextResponse.json(
          { error: "Invalid image URL. Each image must have a valid HTTP or HTTPS URL." },
          { status: 400 }
        );
      }
    }
    const { data: existing } = await admin.supabase.from("product_images").select("id").eq("product_id", params.id);
    const keepIds = body.images.filter((i) => i.id).map((i) => i.id);
    const toDelete = (existing || []).map((i) => i.id).filter((id) => !keepIds.includes(id));
    if (toDelete.length) {
      const { error } = await admin.supabase.from("product_images").delete().in("id", toDelete);
      if (error) errors.push(`images delete: ${error.message}`);
    }
    for (const [index, img] of body.images.entries()) {
      const row = {
        product_id: params.id,
        variant_id: img.variant_id || null,
        url: img.url,
        alt_text: img.alt_text || null,
        position: img.position ?? index,
        is_primary: !!img.is_primary,
      };
      const { error } = img.id
        ? await admin.supabase.from("product_images").update(row).eq("id", img.id)
        : await admin.supabase.from("product_images").insert(row);
      if (error) errors.push(`image: ${error.message}`);
    }
    changes.images = body.images.length;
  }

  await logAdminAction({
    supabase: admin.supabase,
    actor: admin.user,
    action: "product.updated",
    entityType: "product",
    entityId: params.id,
    metadata: { changedKeys: Object.keys(changes), errorCount: errors.length },
  });

  if (errors.length) {
    // Report exactly what happened rather than a blanket "success" (§71
    // shape) — some writes may have applied even if others failed.
    return NextResponse.json({ product: updatedProduct, partial: true, errors }, { status: 207 });
  }
  return NextResponse.json({ product: updatedProduct, ok: true });
}

/**
 * DELETE here means "archive" (§12) — products are never hard-deleted as
 * the normal discontinuation path. A real hard-delete is not exposed by
 * this endpoint at all.
 */
export async function DELETE(request, { params }) {
  const limited = await rateLimitOr429Async(request, "admin-products", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const { data, error } = await admin.supabase.from("products").update({ status: "archived" }).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: "Could not archive product." }, { status: 400 });

  await logAdminAction({
    supabase: admin.supabase,
    actor: admin.user,
    action: "product.archived",
    entityType: "product",
    entityId: params.id,
  });

  return NextResponse.json({ product: data, ok: true });
}

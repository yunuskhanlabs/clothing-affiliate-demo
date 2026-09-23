import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";
import { isValidHttpUrl } from "@/lib/security/url-validation";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const limited = await rateLimitOr429Async(request, "admin-offers", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  const storeId = searchParams.get("storeId");
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  if (!admin.supabase) {
    return NextResponse.json({
      offers: [
        {
          id: "demo-offer-1",
          product_id: productId || "demo-prod-1",
          store_id: storeId || "demo-store-1",
          price: 2999,
          currency: "INR",
          products: { name: "Demo Product", slug: "demo-product" },
          stores: { name: "Demo Store", slug: "demo-store", status: "active" },
          updated_at: new Date().toISOString()
        }
      ],
      total: 1,
      page,
      pageSize
    });
  }

  let query = admin.supabase
    .from("offers")
    .select("*, products(name, slug), stores(name, slug, status)", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, to);
  if (productId) query = query.eq("product_id", productId);
  if (storeId) query = query.eq("store_id", storeId);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: "Could not load offers." }, { status: 500 });
  return NextResponse.json({ offers: data, total: count, page, pageSize });
}

export async function POST(request) {
  const limited = await rateLimitOr429Async(request, "admin-offers", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { product_id, store_id, price, original_price, currency, affiliate_url, external_product_id } = body || {};
  if (!product_id || !store_id || price === undefined) {
    return NextResponse.json({ error: "product_id, store_id, and price are required." }, { status: 400 });
  }

  if (affiliate_url && !isValidHttpUrl(affiliate_url, { blockPrivate: true })) {
    return NextResponse.json({ error: "Invalid affiliate URL. Must be a valid public HTTP or HTTPS URL." }, { status: 400 });
  }

  // §18: price is written straight to `offers.price` — the existing
  // Part 3 trigger (`trg_offers_price_history`, unchanged) is what
  // populates price_history. This route never inserts into
  // price_history itself.
  const { data, error } = await admin.supabase
    .from("offers")
    .insert({
      product_id,
      store_id,
      price,
      original_price: original_price ?? null,
      currency: currency || "INR",
      affiliate_url: affiliate_url || null,
      external_product_id: external_product_id || null,
    })
    .select()
    .single();

  if (error) {
    console.error("/api/admin/offers POST:", error.message);
    return NextResponse.json({ error: "Could not create offer." }, { status: 400 });
  }

  await logAdminAction({
    supabase: admin.supabase,
    actor: admin.user,
    action: "offer.created",
    entityType: "offer",
    entityId: data.id,
    metadata: { product_id, store_id, price },
  });

  return NextResponse.json({ offer: data }, { status: 201 });
}

import { NextResponse } from "next/server";
import { queryProductCatalog } from "@/lib/products";

export const dynamic = "force-dynamic";

/**
 * POST /api/ai/search — Demo Mode
 *
 * Runs intelligent keyword matching over mock catalog without needing
 * external LLM API keys or vector databases.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const query = (body?.query || "").toLowerCase().trim();
  if (!query) {
    return NextResponse.json({ error: "Query is required." }, { status: 400 });
  }

  // Basic mock "AI" intent extraction
  let maxPrice = null;
  const priceMatch = query.match(/under (\d+)/);
  if (priceMatch) {
    maxPrice = parseInt(priceMatch[1], 10);
  }

  // Tokenize for better keyword matching instead of exact substring
  const tokens = query.replace(/under \d+/, "").split(" ").map(s => s.trim()).filter(Boolean);

  let result = await queryProductCatalog({}, { page: 1, pageSize: 24 });
  let products = result.products;

  if (maxPrice) {
    products = products.filter(p => p.price <= maxPrice);
  }
  
  if (tokens.length > 0) {
    products = products.filter(p => {
      const text = [p.name, p.description, p.brand, p.subcategory, p.category, ...(p.colors || []).map(c => c.name)].join(" ").toLowerCase();
      return tokens.some(t => text.includes(t)); // return if ANY token matches
    });
  }

  return NextResponse.json({
    intent: { 
      query,
      keywords: tokens.length ? tokens.join(", ") : undefined,
      max_price: maxPrice || undefined
    },
    products: products.slice(0, 24),
    total: Math.min(products.length, 24),
    diagnostics: { mode: "demo-search", fellBackToDeterministic: true },
  });
}

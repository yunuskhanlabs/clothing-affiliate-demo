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

  const query = body?.query || "";
  const result = await queryProductCatalog({ q: query }, { page: 1, pageSize: 24 });

  return NextResponse.json({
    intent: { summary: `Showing demo search results for "${query}"` },
    products: result.products,
    total: result.total,
    diagnostics: { mode: "demo-search", matches: result.total },
  });
}

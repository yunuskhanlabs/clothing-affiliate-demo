import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";

/**
 * GET /auth/callback?code=...
 *
 * Supabase's email-confirmation and password-reset links redirect here
 * with a one-time `code`, which this route exchanges for a real session
 * cookie (via @supabase/ssr) before sending the user on. Session
 * persistence (§21) relies on this exchange actually happening
 * server-side so the cookie is set before the browser navigates further.
 */
export async function GET(request) {
  const limited = await rateLimitOr429Async(request, "auth-callback", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  let next = searchParams.get("next") || "/account";

  if (!next.startsWith("/") || next.startsWith("//")) {
    next = "/account";
  }

  if (code) {
    const supabase = getSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${next}`);
}

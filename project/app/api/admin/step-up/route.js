import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { issueStepUpToken, applyStepUpCookie } from "@/lib/admin/step-up";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/step-up  { password }
 *
 * Re-verifies the currently-logged-in admin's password via Supabase Auth
 * (the project's existing auth capability — no separate MFA system was
 * available to build on, §6 "use the authentication capabilities
 * available in the project") and, on success, issues a 10-minute
 * step-up token. Sensitive routes (partner credentials, tracking config,
 * high-impact bulk mutations) check for this token in addition to the
 * normal admin session — see `lib/admin/step-up.js`.
 *
 * The password itself is never logged or written to the audit log
 * (§6 "do not store passwords... in application logs") — only the fact
 * that a step-up occurred is recorded, by the calling route, via
 * `stepUpUsed: true` in its own audit entry.
 */
export async function POST(request) {
  const limited = await rateLimitOr429Async(request, "admin-step-up", { limit: 5, windowMs: 60_000 });
  if (limited) return limited;

  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const password = body?.password;
  if (typeof password !== "string" || !password) {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }

  // Re-verification, not a fresh login flow: uses the same session-aware
  // client so the existing session cookie stays intact regardless of
  // outcome — a failed re-auth attempt must not sign the admin out.
  let authError = null;
  if (!admin.supabase) {
    const expectedPassword = process.env.DEMO_ADMIN_PASSWORD || "demo123";
    if (password !== expectedPassword) authError = new Error("Invalid demo password");
  } else {
    const { error } = await admin.supabase.auth.signInWithPassword({
      email: admin.user.email,
      password,
    });
    authError = error;
  }

  if (authError) {
    console.log(`[AUTH] STEP_UP_FAILED admin="${admin?.user?.email || "unknown"}" reason="invalid_password"`);
    return NextResponse.json({ error: "Re-authentication failed." }, { status: 401 });
  }

  console.log(`[AUTH] STEP_UP_SUCCESS admin="${admin?.user?.email || "unknown"}"`);
  const { token, expiresAt } = issueStepUpToken(admin.user.id);
  const response = NextResponse.json({ ok: true, expiresAt });
  applyStepUpCookie(response, token);
  return response;
}

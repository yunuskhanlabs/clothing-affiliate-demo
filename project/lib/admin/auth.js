import "server-only";
import { cookies } from "next/headers";

/**
 * Admin authorization check — Demo Mode
 *
 * In standalone demo mode, grants admin access with the demo credentials.
 */
import crypto from "node:crypto";

function getSecret() {
  return process.env.STEP_UP_SECRET || "demo-safe-step-up-secret-12345";
}

export async function requireAdmin() {
  const cookieStore = cookies();
  const token = cookieStore.get("demo_admin_auth")?.value;

  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [expiresAtStr, signature] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || !signature) return null;
  if (Math.floor(Date.now() / 1000) > expiresAt) return null;

  const email = process.env.DEMO_ADMIN_EMAIL || "admin@demo.com";
  const expected = crypto.createHmac("sha256", getSecret()).update(`admin.${email}.${expiresAt}`).digest("hex");
  
  if (expected !== signature) return null;

  return {
    user: {
      id: "demo-admin-id",
      email,
      role: "admin",
      user_metadata: { role: "admin", name: "Demo Admin" },
    },
    supabase: null,
  };
}

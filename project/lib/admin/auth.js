import "server-only";
import { cookies } from "next/headers";

/**
 * Admin authorization check — Demo Mode
 *
 * In standalone demo mode, grants admin access with the demo credentials.
 */
export async function requireAdmin() {
  const cookieStore = cookies();
  const hasAuth = cookieStore.get("demo_admin_auth");

  if (!hasAuth) {
    return null;
  }

  return {
    user: {
      id: "demo-admin-id",
      email: "admin@demo.com",
      role: "admin",
      user_metadata: { role: "admin", name: "Demo Admin" },
    },
    supabase: null,
  };
}

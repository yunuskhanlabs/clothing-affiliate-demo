import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import AdminShell from "@/components/admin/AdminShell";

// PART 6 §4: admin pages must never be indexed. This applies regardless
// of whether a given request actually reaches an authenticated admin —
// the meta tag is emitted on every render of anything under this
// layout, authenticated or redirected.
export const metadata = { robots: { index: false, follow: false } };

/**
 * §4/§5: this redirect is a CONVENIENCE for normal navigation — it is
 * NOT the security boundary. The real boundary is server-side on every
 * `/api/admin/**` route (`requireAdmin()`, called independently there)
 * and, underneath that, PostgreSQL RLS (`is_admin(auth.uid())` policies
 * from Part 3). A non-admin who somehow rendered this layout would still
 * find every mutation rejected at the API/database layer — this redirect
 * just avoids showing them an empty admin shell in the first place.
 */
export default async function AdminLayout({ children }) {
  const admin = await requireAdmin();
  if (!admin) redirect("/account?next=/admin");

  return <AdminShell adminEmail={admin.user.email}>{children}</AdminShell>;
}

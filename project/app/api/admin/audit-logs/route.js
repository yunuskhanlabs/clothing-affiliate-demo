import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const logs = [
    {
      id: "log-1",
      created_at: "2026-03-21T14:15:00Z",
      actor_email: "admin@demo.com",
      action: "product.updated",
      entity_type: "product",
      entity_id: "p-0001",
      step_up_authenticated: true,
    },
    {
      id: "log-2",
      created_at: "2026-03-21T10:00:00Z",
      actor_email: "admin@demo.com",
      action: "deal.activated",
      entity_type: "deal",
      entity_id: "deal-1",
      step_up_authenticated: false,
    },
    {
      id: "log-3",
      created_at: "2026-03-20T18:30:00Z",
      actor_email: "admin@demo.com",
      action: "partner.verified",
      entity_type: "store",
      entity_id: "store-1",
      step_up_authenticated: false,
    },
  ];
  return NextResponse.json({ logs, total: logs.length });
}

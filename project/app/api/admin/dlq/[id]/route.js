import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { markDlqStatus } from "@/lib/automation/dlq";
import { replayOfferRefreshItem, replayEmbeddingsBackfillItem } from "@/lib/automation/jobs";
import { logAdminAction } from "@/lib/admin/audit";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/dlq/[id]  { action: "replay" | "resolve" | "ignore" }
 * Every branch logs to the audit trail (§34 "record the replay action in
 * the audit log").
 */
export async function PATCH(request, { params }) {
  const limited = await rateLimitOr429Async(request, "admin-dlq-patch", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const action = body?.action;
  if (!["replay", "resolve", "ignore"].includes(action)) {
    return NextResponse.json({ error: "action must be replay, resolve, or ignore." }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const { data: item, error } = await supabaseAdmin.from("automation_dlq").select("*").eq("id", params.id).maybeSingle();
  if (error || !item) return NextResponse.json({ error: "DLQ item not found." }, { status: 404 });

  if (action === "resolve" || action === "ignore") {
    const updated = await markDlqStatus(params.id, action === "resolve" ? "resolved" : "ignored");
    await logAdminAction({ supabase: admin.supabase, actor: admin.user, action: `dlq.${action}`, entityType: "automation_dlq", entityId: params.id, metadata: { job: item.job_name } });
    return NextResponse.json({ item: updated });
  }

  // action === "replay"
  const REPLAYERS = { offer_refresh: replayOfferRefreshItem, embeddings_backfill: replayEmbeddingsBackfillItem };
  const replay = REPLAYERS[item.job_name];
  if (!replay) {
    return NextResponse.json({ error: `Replay isn't wired for job "${item.job_name}" yet.` }, { status: 400 });
  }

  try {
    await replay(item);
    const updated = await markDlqStatus(params.id, "resolved");
    await logAdminAction({
      supabase: admin.supabase,
      actor: admin.user,
      action: "dlq.replayed",
      entityType: "automation_dlq",
      entityId: params.id,
      metadata: { job: item.job_name, outcome: "success" },
    });
    return NextResponse.json({ item: updated, replaySucceeded: true });
  } catch (err) {
    await logAdminAction({
      supabase: admin.supabase,
      actor: admin.user,
      action: "dlq.replayed",
      entityType: "automation_dlq",
      entityId: params.id,
      metadata: { job: item.job_name, outcome: "failed", error: err.message },
    });
    return NextResponse.json({ error: `Replay failed: ${err.message}`, replaySucceeded: false }, { status: 502 });
  }
}

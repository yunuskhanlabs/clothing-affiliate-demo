import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyHmacSignature, isWithinReplayWindow, hashPayload } from "@/lib/affiliate/webhook-verify";
import { getNetworkAdapter } from "@/lib/affiliate/network-adapters";
import { resolveRequestId, withRequestId } from "@/lib/observability/request-id";
import { logError, logWarn } from "@/lib/observability/logger";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secretFor(network) {
  // One shared secret per network, e.g. AFFILIATE_WEBHOOK_SECRET_GENERIC.
  // Falls back to the bare AFFILIATE_WEBHOOK_SECRET so the "generic"
  // adapter has something to verify against in local/dev setups without
  // per-network provisioning. Never returned to the caller, never logged.
  const key = `AFFILIATE_WEBHOOK_SECRET_${network.toUpperCase()}`;
  return process.env[key] || process.env.AFFILIATE_WEBHOOK_SECRET || null;
}

/**
 * POST /api/webhooks/affiliate/{network}
 *
 * Network → this endpoint, verified BEFORE any business logic runs
 * (§20). Required header: `x-cloxtro-signature: <hex hmac-sha256 of the raw
 * body>`. Optional header: `x-cloxtro-timestamp: <unix seconds>` — checked
 * against a 5-minute replay window when present (§21). Neither header
 * name is a real network's actual convention (no specific network was
 * integrated this phase, §22) — a real adapter would read whatever
 * header/format that network actually uses.
 */

export async function POST(request, { params }) {
  const limited = await rateLimitOr429Async(request, "webhooks", { limit: 100, windowMs: 60_000 });
  if (limited) return limited;

  const network = (params.network || "").toLowerCase();
  // §46: this route is excluded from middleware.js's matcher for latency
  // (session-cookie refresh is irrelevant to a service-role-driven,
  // session-agnostic webhook), so it resolves its own correlation id
  // rather than reading one middleware would otherwise have set.
  const requestId = resolveRequestId(request.headers);
  const json = (body, init) => withRequestId(NextResponse.json(body, init), requestId);

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-cloxtro-signature");
  const timestampHeader = request.headers.get("x-cloxtro-timestamp");
  const secret = secretFor(network);

  // ---- 1. Verify authenticity BEFORE touching any business data. ----
  if (!secret || !verifyHmacSignature({ rawBody, signatureHeader, secret })) {
    // Deliberately generic message + no indication of *why* (missing
    // header vs. bad signature vs. unconfigured secret) — §54 "do not
    // expose internal database/network secrets," extended here to not
    // leak verification internals either.
    logWarn("webhook signature rejected", { requestId, network });
    return json({ error: "unauthorized" }, { status: 401 });
  }

  // ---- 2. Replay-window check, only when the network signs a timestamp. ----
  if (timestampHeader && !isWithinReplayWindow(Number(timestampHeader))) {
    return json({ error: "stale request" }, { status: 401 });
  }

  // ---- 3. Only now parse the business payload. ----
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid JSON" }, { status: 400 });
  }

  const adapter = getNetworkAdapter(network);
  if (!adapter) {
    return json({ error: `unsupported network: ${network}` }, { status: 404 });
  }

  let normalized;
  try {
    normalized = adapter.normalize(payload);
  } catch (err) {
    return json({ error: `invalid payload: ${err.message}` }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const payloadHash = hashPayload(rawBody);

  // ---- 4. Idempotency ledger — reject exact-duplicate deliveries (§21, §23). ----
  const { error: eventInsertError } = await supabase.from("webhook_events").insert({
    network,
    external_event_id: normalized.eventId,
    payload_hash: payloadHash,
    status: "processed",
    metadata: { requestId },
  });
  if (eventInsertError) {
    if (eventInsertError.code === "23505") {
      // Same (network, event_id) or (network, payload_hash) seen before —
      // acknowledge without reprocessing, per §21.
      return json({ ok: true, duplicate: true }, { status: 200 });
    }
    logError("webhook_events insert failed", { requestId, network, error: eventInsertError.message });
    return json({ error: "internal error" }, { status: 500 });
  }

  // ---- 5. Resolve store (required — every conversion belongs to one). ----
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, status")
    .eq("slug", normalized.storeSlug)
    .maybeSingle();
  if (storeError || !store) {
    return json({ error: `unknown store_slug: ${normalized.storeSlug}` }, { status: 400 });
  }

  // ---- 6. Resolve click attribution where possible (§16, §52) — tolerant of a miss. ----
  let click = null;
  if (normalized.clickRef && UUID_RE.test(normalized.clickRef)) {
    const { data } = await supabase
      .from("affiliate_clicks")
      .select("id, offer_id, product_id")
      .eq("click_uuid", normalized.clickRef)
      .maybeSingle();
    click = data || null;
  }

  // "paid" implies the underlying conversion was approved; the paid
  // state itself lives on the commission row, not conversions (§18).
  const conversionStatus = normalized.status === "paid" ? "approved" : normalized.status;
  const commissionStatus = normalized.status; // pending | approved | rejected | paid — same value, different table

  // ---- 7. Upsert the conversion (idempotent on network+store+external_transaction_id, §23). ----
  const { data: conversion, error: conversionError } = await supabase
    .from("conversions")
    .upsert(
      {
        network,
        store_id: store.id,
        offer_id: click?.offer_id || null,
        product_id: click?.product_id || null,
        click_id: click?.id || null,
        external_click_ref: normalized.clickRef,
        external_transaction_id: normalized.externalTransactionId,
        order_value: normalized.orderValue,
        currency: normalized.currency,
        status: conversionStatus,
        raw_payload: payload, // network payloads here carry no auth secrets themselves — the signature is a header, not a body field
        occurred_at: normalized.timestamp ? new Date(normalized.timestamp * 1000).toISOString() : new Date().toISOString(),
      },
      { onConflict: "network,store_id,external_transaction_id" }
    )
    .select()
    .single();

  if (conversionError) {
    logError("conversions upsert failed", { requestId, network, error: conversionError.message });
    return json({ error: "internal error" }, { status: 500 });
  }

  // ---- 8. Upsert the commission (§18, §19) — only when an amount was actually reported. ----
  // Never fabricate a commission amount (§18) — a conversion with no
  // reported amount yet stays a conversion-only record until a later
  // delivery includes one.
  if (normalized.commissionAmount !== null) {
    const now = new Date().toISOString();
    const { error: commissionError } = await supabase.from("commissions").upsert(
      {
        conversion_id: conversion.id,
        store_id: store.id,
        offer_id: click?.offer_id || null,
        product_id: click?.product_id || null,
        amount: normalized.commissionAmount,
        currency: normalized.currency,
        status: commissionStatus,
        approved_at: commissionStatus === "approved" || commissionStatus === "paid" ? now : null,
        paid_at: commissionStatus === "paid" ? now : null,
      },
      { onConflict: "conversion_id" }
    );
    if (commissionError) {
      logError("commissions upsert failed", { requestId, network, error: commissionError.message });
      // The conversion itself was recorded successfully — a commission
      // write failure shouldn't be reported as a total failure to the
      // network (it may retry the whole delivery and hit the idempotency
      // guard above unnecessarily). Log and continue.
    }
  }

  return json({ ok: true }, { status: 200 });
}

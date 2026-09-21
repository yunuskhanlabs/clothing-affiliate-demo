import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { hasValidStepUp } from "@/lib/admin/step-up";
import { logAdminAction } from "@/lib/admin/audit";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";
import { isValidHttpUrl, isValidImageUrl } from "@/lib/security/url-validation";

export const dynamic = "force-dynamic";

// §6/§17/§19: partner credential/tracking-config changes are explicitly
// on the sensitive-action list. Everything else about a partner (name,
// logo, base URL, active/inactive/suspended status) is an ordinary
// low-risk catalog edit and does NOT require step-up (§94 "do not make
// every harmless action unnecessarily require re-authentication").
const SENSITIVE_FIELDS = ["affiliate_network", "tracking_param_name", "tracking_param_template", "network_ids"];
const ORDINARY_FIELDS = ["name", "slug", "base_url", "logo_url", "status"];

export async function PATCH(request, { params }) {
  const limited = await rateLimitOr429Async(request, "admin-partners", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const requestedKeys = Object.keys(body || {});
  const touchesSensitive = requestedKeys.some((key) => SENSITIVE_FIELDS.includes(key));

  if (touchesSensitive && !hasValidStepUp(request, admin.user.id)) {
    return NextResponse.json(
      { error: "This change requires step-up re-authentication.", stepUpRequired: true },
      { status: 401 }
    );
  }

  const patch = {};
  for (const key of [...ORDINARY_FIELDS, ...SENSITIVE_FIELDS]) {
    if (key in body) patch[key] = body[key];
  }

  if (patch.base_url && !isValidHttpUrl(patch.base_url, { blockPrivate: true })) {
    return NextResponse.json({ error: "Invalid base URL. Must be a valid public HTTP or HTTPS URL." }, { status: 400 });
  }
  if (patch.logo_url && !isValidImageUrl(patch.logo_url, { blockPrivate: true })) {
    return NextResponse.json({ error: "Invalid logo URL. Must be a valid public HTTP or HTTPS URL." }, { status: 400 });
  }

  const { data, error } = await admin.supabase.from("stores").update(patch).eq("id", params.id).select().single();
  if (error) {
    console.error("/api/admin/partners/[id] PATCH:", error.message);
    return NextResponse.json({ error: "Could not update partner." }, { status: 400 });
  }

  // Metadata records WHICH fields changed, never the tracking-param
  // VALUES themselves for the sensitive set (§6 "do not store... secrets
  // in application logs" — a tracking param name isn't a secret in the
  // traditional sense, but this stays conservative since network_ids can
  // carry a publisher/merchant identifier some networks treat as
  // semi-sensitive).
  await logAdminAction({
    supabase: admin.supabase,
    actor: admin.user,
    action: "partner.updated",
    entityType: "store",
    entityId: params.id,
    metadata: { changedKeys: requestedKeys, sensitive: touchesSensitive },
    stepUpUsed: touchesSensitive,
  });

  return NextResponse.json({ store: data });
}

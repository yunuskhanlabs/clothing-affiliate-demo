import { requireAdmin } from "@/lib/admin/auth";
import { redirect } from "next/navigation";

/**
 * Read-only by design (§67 "do not expose API keys in frontend"; "do not
 * allow arbitrary admin-entered prompts to execute privileged system
 * actions"). Provider/model/feature-flag values live in environment
 * variables, changed via deployment config, not this page — this is
 * where an admin confirms what's currently active without anything here
 * being able to leak or mutate a secret.
 */
export default async function AdminSettingsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/account?next=/admin/settings");

  const aiProvider = process.env.AI_PROVIDER || "local";
  const openaiConfigured = !!process.env.OPENAI_API_KEY;
  const webhookConfigured = !!process.env.AFFILIATE_WEBHOOK_SECRET;
  const stepUpConfigured = !!process.env.STEP_UP_SECRET;

  const rows = [
    { label: "AI provider", value: aiProvider, note: aiProvider === "local" ? "Rule-based, always available, no key needed" : "External model provider" },
    { label: "OpenAI key configured", value: openaiConfigured ? "Yes" : "No", note: "Set OPENAI_API_KEY to activate the openai provider" },
    { label: "Affiliate webhook secret configured", value: webhookConfigured ? "Yes" : "No" },
    { label: "Step-up secret configured", value: stepUpConfigured ? "Yes" : "No" },
    { label: "Intent cache TTL", value: "6 hours", note: "lib/ai/cache.js" },
    { label: "Vector dimensions", value: "384", note: "product_embeddings.embedding — see 0009 migration" },
    { label: "RRF constant (k)", value: "60", note: "hybrid_search() default" },
  ];

  return (
    <div className="max-w-2xl">
      <h1 className="mb-2 font-display text-2xl text-paper">Settings</h1>
      <p className="mb-6 text-sm text-paper-dim">
        Configuration is environment-driven, not editable here — this avoids ever exposing a secret to the browser or letting an admin-entered
        value trigger a privileged action (§67).
      </p>
      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-border last:border-b-0">
                <td className="w-1/3 px-4 py-3 text-paper-dim">{r.label}</td>
                <td className="px-4 py-3 text-paper">{r.value}</td>
                <td className="px-4 py-3 text-xs text-paper-dim">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

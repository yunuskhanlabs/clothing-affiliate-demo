import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — SERVER-ONLY (§4, §53).
 *
 * The `server-only` import above makes Next.js throw a build error if
 * this file is ever imported from a "use client" component or anything
 * that ends up in the browser bundle — a hard guardrail, not just a
 * comment.
 *
 * Bypasses Row Level Security entirely. Use this ONLY for operations that
 * legitimately need to cross RLS boundaries from trusted server code —
 * for example, the price-alert foundation's future server-side matching
 * job (Part 5) or admin data-maintenance scripts. Every user-facing
 * read/write in Part 3's route handlers uses `getSupabaseServerClient()`
 * (anon key + user session) instead, so RLS stays the actual
 * authorization boundary — see PHASE-3-CONTEXT.md §22 "Security
 * decisions" for which routes use which client and why.
 */
let adminClient;

export function getSupabaseAdminClient() {
  if (!adminClient) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — see .env.local.example");
    }
    adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

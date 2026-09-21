import { NextResponse } from "next/server";
import { runJob, KNOWN_JOBS } from "@/lib/automation/jobs";
import { resolveRequestId, withRequestId } from "@/lib/observability/request-id";
import { logError, logInfo } from "@/lib/observability/logger";
import { rateLimitOr429Async } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/automation
 *
 * §29: "Automation should use the project's available scheduled-job
 * mechanism." This project deploys on Vercel (see `vercel.json` at the
 * repo root, which schedules a call to this exact endpoint) — Vercel
 * Cron is that mechanism. Vercel signs scheduled requests with a bearer
 * token matching `CRON_SECRET`; this route rejects anything else, so it
 * can't be triggered by an arbitrary public request (it deliberately
 * does NOT use `requireAdmin()`, since a cron invocation has no admin
 * browser session — the shared secret is the auth boundary here instead).
 *
 * Runs every pure-SQL job (each already lock-protected and atomic) plus
 * the two Node-driven jobs, sequentially — safe to invoke more often
 * than the schedule requires, since every job is independently
 * idempotent and lock-protected (§30, §31); a second, overlapping
 * invocation just gets `{ skipped: true }` for whichever jobs are still
 * running.
 */
export async function GET(request) {
  const limited = await rateLimitOr429Async(request, "cron-automation", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;
  const requestId = resolveRequestId(request.headers);
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    // §46: no admin session exists on a cron invocation (see file header)
    // — the shared secret is the auth boundary, not this correlation id.
    // Still resolved/returned so a misconfigured-secret alert has a
    // traceable id to search logs with.
    return withRequestId(NextResponse.json({ error: "Unauthorized." }, { status: 401 }), requestId);
  }

  logInfo("cron automation run started", { requestId, jobs: KNOWN_JOBS });

  const results = {};
  for (const jobName of KNOWN_JOBS) {
    try {
      // §47/§50: each job writes its own `automation_jobs` row (via
      // claim_job_run()/finish_job_run() or the pure-SQL RPC itself) —
      // that row's own `id` IS the job-run's correlation id (§49 "job
      // correlation id where available"). This cron-invocation
      // `requestId` is the outer trace: which HTTP trigger caused which
      // job runs, without needing a schema change to automation_jobs.
      results[jobName] = await runJob(jobName);
    } catch (err) {
      logError("cron job threw", { requestId, jobName, error: err.message });
      results[jobName] = { error: err.message };
    }
  }

  return withRequestId(NextResponse.json({ ok: true, ranAt: new Date().toISOString(), requestId, results }), requestId);
}

# PRODUCTION RECOVERY RUNBOOK
## CLOXTRO - Affiliate Catalog Platform

> **Last updated:** 2026-09-01
> **Scope:** Supabase (Postgres) + Next.js on Vercel
> **WARNING: Never commit actual secret values to this file or any source file.**

---

## 1. BACKUP ASSUMPTIONS

| Concern | Status | Notes |
|---|---|---|
| Supabase automatic daily backups | Provider-managed - verify in Supabase Dashboard > Project Settings > Backups | Free/Pro plan distinction matters |
| Point-in-Time Recovery (PITR) | Provider-managed - Pro plan and above only | Must be verified in dashboard |
| Backup retention period | Not verified - depends on plan tier | Pro: 7 days; Enterprise: longer |
| Vercel deployment history | Provider-managed - Vercel retains previous deployments | Rollback available via dashboard |

> IMPORTANT: No backup has been restored and verified as part of this audit. The operator MUST verify backup status in the Supabase Dashboard before declaring production readiness.

---

## 2. WHAT IS PROVIDER-MANAGED

The following are entirely managed by Supabase/Vercel and cannot be self-verified from code:
- Automatic daily snapshots - Supabase Dashboard > Project Settings > Backups
- Point-in-Time Recovery window - Supabase Pro plan required; check dashboard
- WAL/streaming replication - Supabase-managed; not configurable in code
- Vercel deployment snapshots - previous deployments retained; rollback via Vercel Dashboard

---

## 3. WHAT REQUIRES MANUAL VERIFICATION (BEFORE LAUNCH)

1. Confirm Supabase plan is Pro (minimum) for reliable PITR.
2. Confirm backups are enabled in Supabase Dashboard > Settings > Backups.
3. Confirm PITR window (7 days minimum recommended).
4. Test a restore to a staging/shadow database at least once before go-live.
5. Verify all production environment variables are set in Vercel Dashboard > Project Settings > Environment Variables.
6. Confirm CRON_SECRET is set as a Vercel project env var.

---

## 4. REQUIRED ENVIRONMENT VARIABLES

The following variables MUST be set in production. Values are NEVER stored here.

### Supabase
- NEXT_PUBLIC_SUPABASE_URL         - All Supabase clients
- NEXT_PUBLIC_SUPABASE_ANON_KEY    - Browser + server RLS client
- SUPABASE_SERVICE_ROLE_KEY        - Server-only admin client (bypasses RLS) -- CRITICAL SECRET

### Security & Auth
- STEP_UP_SECRET                   - Signs step-up JWT tokens for sensitive admin ops -- CRITICAL SECRET
- AFFILIATE_WEBHOOK_SECRET         - HMAC-SHA256 verification on inbound webhooks -- CRITICAL SECRET
- CRON_SECRET                      - Bearer token auth for Vercel Cron -- CRITICAL SECRET

### AI Provider (optional)
- AI_PROVIDER                      - Switches between local (default), openai, gemini
- OPENAI_API_KEY                   - Only if AI_PROVIDER=openai
- OPENAI_INTENT_MODEL              - Optional model override (default: gpt-4o-mini)
- GEMINI_API_KEY                   - Only if AI_PROVIDER=gemini
- GEMINI_INTENT_MODEL              - Optional model override

### Rate Limiting (optional - production upgrade)
- UPSTASH_REDIS_REST_URL           - Distributed rate limiting; falls back to in-memory if absent
- UPSTASH_REDIS_REST_TOKEN         - Distributed rate limiting auth

### Site & SEO
- NEXT_PUBLIC_SITE_URL             - Canonical URLs, sitemap, Open Graph - set to production domain

---

## 5. MIGRATION RECOVERY PROCEDURE

### 5.1 Migration Order (must be applied in sequence)
```
0001_init_schema.sql              - Core schema (tables, RLS, triggers)
0002_seed_dev_data.sql            - Dev-only seed data (idempotent via ON CONFLICT DO NOTHING)
0003_catalog_search_function.sql
0004_affiliate_engine.sql         - Affiliate clicks, conversions, commissions
0005_affiliate_dev_seed.sql       - Dev-only affiliate seed data
0006_catalog_search_offer_id.sql
0007_admin_audit_deals_content.sql
0008_automation.sql               - Job ledger, DLQ, advisory locking
0009_ai_search.sql                - pgvector + hybrid search
0010_observability.sql            - Additive: metadata column to webhook_events
0011_security_hardening.sql       - log_admin_action RLS fix
```

### 5.2 Applying Migrations (fresh environment)
```bash
# Via Supabase CLI
supabase db push

# Or apply via Supabase SQL Editor in order (0001 to 0011)
```

### 5.3 Migration Failure Recovery
If a migration fails mid-run:
1. Do NOT re-run the entire migration file without inspection.
2. Identify the exact failed statement.
3. All migrations use IF NOT EXISTS / CREATE OR REPLACE where safe.
4. 0002 and 0005 are idempotent (ON CONFLICT DO NOTHING).
5. There are NO DROP TABLE or DROP COLUMN operations in any migration - all changes are additive.

### 5.4 No Automated Rollback
Migrations are forward-only. There are no rollback scripts. Recovery path for a migration failure:
- Take a database backup/PITR snapshot BEFORE any migration run.
- If migration fails and cannot be recovered forward: restore from pre-migration snapshot.

---

## 6. DATABASE RESTORE PROCEDURE

### 6.1 When to Consider a Restore
- Accidental hard-deletion of reference data with no FK protection
- Corrupted migration state that cannot be recovered forward
- Data corruption from an application bug
- Supabase incident resulting in data loss

### 6.2 Restore Steps

STEP 1: Do NOT restore directly to production.
         Restore to an isolated Supabase project (shadow/staging) first.

STEP 2: Select backup or PITR point.
         Supabase Dashboard > Project Settings > Backups
         Choose the most recent snapshot before the incident.

STEP 3: Restore to staging environment.
         Use Supabase built-in restore (Pro plan required for PITR).

STEP 4: Validate staging restore.
```sql
SELECT count(*) FROM products;
SELECT count(*) FROM offers;
SELECT count(*) FROM affiliate_clicks;
SELECT count(*) FROM audit_logs;
```

STEP 5: Run smoke tests against staging.
         See Section 9 below.

STEP 6: Cutover to production only after staging validation passes.
         Re-run any migrations applied after the backup timestamp.

---

## 7. APPLICATION ROLLBACK PROCEDURE

### 7.1 Vercel Deployment Rollback
1. Open Vercel Dashboard > Deployments
2. Find the last known-good deployment
3. Click "Promote to Production"

### 7.2 IMPORTANT: Database + Application Mismatch Risk
All schema migrations in this project are ADDITIVE (no DROP TABLE, no column removal).
Rolling back the application to a previous deployment is generally safe because:
- Old code will simply not use new columns
- No columns have been dropped that old code would need

Verify before rollback:
- Does the old app version read/write any column that no longer exists? (Answer: No in this codebase)

### 7.3 Recommended Rollback Order
1. DETECT:   Confirm failure (error rate, health check failure, user reports)
2. MITIGATE: Enable maintenance mode or rate-limit the failing endpoint if possible
3. DECIDE:   App bug only -> step 4; Migration + data bug -> consider DB restore first
4. ROLLBACK APP: Promote previous Vercel deployment
5. VERIFY DB COMPATIBILITY: Confirm old app code works with current schema
6. SMOKE TEST: Section 9
7. POST-INCIDENT: Document root cause and resolution

---

## 8. SOFT-DELETE / DATA PROTECTION SUMMARY

| Entity           | Deletion Behavior                                    | Recovery Path                        |
|------------------|------------------------------------------------------|--------------------------------------|
| products         | Soft-delete: status set to archived (no hard-delete) | Set status = active in DB            |
| offers           | No DELETE endpoint - status lifecycle only           | Update status field                  |
| affiliate_clicks | Never deleted - immutable event log                  | N/A                                  |
| conversions      | No DELETE endpoint - status lifecycle only           | N/A                                  |
| commissions      | No DELETE endpoint                                   | N/A                                  |
| audit_logs       | Hard immutability: INSERT/UPDATE/DELETE revoked at   | Cannot be deleted even by service_role|
|                  | DB privilege level for all roles                     |                                      |
| webhook_events   | No DELETE endpoint                                   | N/A                                  |
| categories       | Hard-delete allowed - FK check prevents if products  | Database backup only if deleted      |
|                  | reference it                                         |                                      |
| brands           | No DELETE endpoint - update status to inactive       | Update status field                  |
| stores/partners  | No DELETE endpoint - update status                   | Update status field                  |
| deals            | Hard-delete allowed (low-risk curation label)        | Re-create; audit log records deletion|
| content_articles | Soft-delete: status set to archived                  | Set status to desired value          |

---

## 9. POST-RESTORE SMOKE TESTS

Run in order after any restore or rollback:

```
1.  GET /api/health              -> { "status": "ok" }   (HTTP 200)
2.  GET /api/health/ready        -> { "status": "ready" } (HTTP 200, not 503)
3.  GET /api/products            -> returns JSON array of products
4.  GET /api/facets              -> returns filter facets
5.  GET /go/{any_offer_id}       -> HTTP 302 redirect to merchant URL
6.  POST /api/track/view         -> HTTP 200 or 204
7.  Admin login -> /admin        -> dashboard loads without errors
8.  Admin -> /admin/products     -> product list renders
9.  Admin -> /admin/analytics    -> analytics dashboard loads
10. GET /api/admin/audit-logs    -> (admin-authed) returns recent entries
```

---

## 10. FAILURE SCENARIO QUICK REFERENCE

| Scenario                              | Fail Behavior                              | Recovery                                    |
|---------------------------------------|--------------------------------------------|---------------------------------------------|
| Accidental product deletion           | Soft-delete only; hard-delete FK-blocked   | Set status = active in DB                   |
| Failed migration                      | Partial schema state                       | Identify failed statement; restore if needed|
| Partial deployment                    | Vercel handles atomically                  | Rollback via Vercel dashboard               |
| App rollback after additive migration | Safe - all migrations additive             | Roll back app; no schema conflict           |
| Database unavailable                  | /api/health/ready returns 503              | Monitor status.supabase.com                 |
| Missing env secret                    | admin client throws explicitly on startup  | Add missing var in Vercel; redeploy         |
| Supabase outage                       | All DB calls fail; static pages serve      | Monitor status.supabase.com                 |
| Corrupted migration state             | Schema inconsistency                       | PITR restore; re-run safe migrations        |

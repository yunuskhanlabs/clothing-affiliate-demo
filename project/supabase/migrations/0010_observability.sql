-- ============================================================================
-- CLOXTRO — PART 6 — Observability: request-correlation metadata
-- ============================================================================
-- §46-§50, §86. Purely additive — one nullable-defaulted column, no
-- existing column/constraint/policy touched, no backfill required (old
-- rows simply keep the default '{}'::jsonb).
--
-- `affiliate_clicks` and `automation_jobs` already had a general-purpose
-- `metadata jsonb` column (Part 4 / Part 5) that PART 6's route/job code
-- now also uses to carry a `requestId`/job-run id — no schema change
-- needed for those two. `webhook_events` had no such column yet, so this
-- migration adds the same shape here for consistency: one place
-- (`metadata->>'requestId'`) to look for the correlation id across every
-- traced table, rather than a bespoke column per table.
-- ============================================================================

alter table webhook_events
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column webhook_events.metadata is
  'PART 6: request-correlation and other non-sensitive trace metadata (e.g. {"requestId": "..."}). Never store the raw request body, headers, or the HMAC signature/secret here — this column is for tracing, not payload archival (the verified payload itself is not persisted verbatim by design, §21 idempotency-only).';

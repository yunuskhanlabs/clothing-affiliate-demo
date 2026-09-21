-- ============================================================================
-- CLOXTRO — PART 5 — Automation: job ledger, advisory locking, DLQ
-- ============================================================================
-- §28-§37, §74-§77. Two kinds of job in this system, handled differently
-- on purpose (see PHASE-5-CONTEXT.md §21-22 for the full reasoning):
--
-- (a) Pure-database jobs (price-drop detection, deal recalculation,
--     price-alert matching) — no external network call needed, so the
--     ENTIRE job (lock + work + result) runs inside one plpgsql function,
--     meaning one Supabase RPC call = one Postgres transaction = the
--     `pg_try_advisory_xact_lock` genuinely covers the whole job and
--     releases automatically when it returns. This is the spec's
--     preferred shape (§31 "transaction-scoped... automatically release").
--
-- (b) External-API-dependent jobs (offer/price refresh from a merchant
--     endpoint) — CANNOT be one Postgres transaction, because fetching a
--     URL happens in Node.js between database round-trips, and an
--     advisory-*xact*-lock's scope is exactly one RPC call's transaction
--     (holding a transaction open across an external HTTP call would
--     violate §31's own "do not hold long-running transactions merely to
--     keep an advisory lock"). For these, `claim_job_run()` uses a
--     millisecond-scale xact-lock ONLY to atomically claim a 'running'
--     marker row — genuinely race-free (Postgres serializes the lock
--     acquisition itself) — and the marker row's `started_at` +
--     staleness window stands in as the job's actual duration guard.
--     This is a deliberate, documented hybrid, not an "application-only
--     boolean lock that can go stale after a crash" in the sense the spec
--     warns against: the claim itself is race-free, and staleness is
--     bounded (see `claim_job_run`'s `p_stale_after_minutes`).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. AUTOMATION_JOBS — run ledger (§74, §75).
-- ----------------------------------------------------------------------------

create type job_run_status as enum ('running', 'success', 'partial_success', 'failed', 'skipped', 'retrying', 'dead_lettered');

create table automation_jobs (
  id                 uuid primary key default gen_random_uuid(),
  job_name            text not null,
  status              job_run_status not null default 'running',
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  duration_ms         int,
  records_processed   int not null default 0,
  error_count         int not null default 0,
  error_summary       text,               -- human-readable, never a raw stack trace with secrets
  metadata            jsonb not null default '{}'::jsonb
);

comment on table automation_jobs is
  'One row per job execution attempt (§74). Status starts ''running'' (inserted by claim_job_run() or directly by a pure-SQL job function) and is finalized by finish_job_run(). A ''running'' row older than its staleness window is treated as abandoned, not as an active lock (§28-31 reasoning above).';

create index idx_automation_jobs_name_started on automation_jobs(job_name, started_at desc);
create index idx_automation_jobs_status on automation_jobs(status, started_at desc);

alter table automation_jobs enable row level security;
create policy "admins can read automation jobs" on automation_jobs for select using (is_admin(auth.uid()));
-- No write policy for any session role — every write goes through the
-- SECURITY DEFINER functions below or the service-role client from the
-- offer-refresh Node.js job — never a direct table INSERT/UPDATE from an
-- admin's own session.
revoke insert, update, delete on automation_jobs from authenticated, anon;
grant insert, update on automation_jobs to service_role; -- the Node-driven refresh job writes via the service-role client between its own external calls

-- ----------------------------------------------------------------------------
-- 2. AUTOMATION_DLQ — dead-letter queue (§32-§34, §95).
-- ----------------------------------------------------------------------------

create type dlq_failure_category as enum ('transient', 'permanent');
create type dlq_status as enum ('retrying', 'dead_lettered', 'resolved', 'ignored');

create table automation_dlq (
  id                uuid primary key default gen_random_uuid(),
  job_name           text not null,
  source             text,               -- e.g. network/store slug this failure came from
  entity_type        text,               -- e.g. 'offer'
  entity_id          uuid,
  failure_reason     text not null,      -- human-readable — never a raw secret/credential
  error_category     dlq_failure_category not null,
  attempt_count      int not null default 1,
  first_failed_at    timestamptz not null default now(),
  last_failed_at     timestamptz not null default now(),
  next_retry_at      timestamptz,
  payload            jsonb not null default '{}'::jsonb,  -- minimized — see lib/automation/dlq.js for what's excluded
  status             dlq_status not null default 'retrying',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table automation_dlq is
  'Dead-letter queue (§32). `payload` is deliberately minimized — never raw API credentials or auth headers (§32) — see lib/automation/dlq.js''s enqueueDlqItem() for the redaction step applied before every insert.';

create trigger trg_automation_dlq_updated_at
  before update on automation_dlq
  for each row execute function set_updated_at();

create index idx_automation_dlq_status on automation_dlq(status, next_retry_at);
create index idx_automation_dlq_job on automation_dlq(job_name, created_at desc);

alter table automation_dlq enable row level security;
create policy "admins can read dlq" on automation_dlq for select using (is_admin(auth.uid()));
create policy "admins can update dlq status" on automation_dlq for update
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
-- Admin UPDATE is intentionally allowed here (unlike audit_logs) — an
-- admin resolving/ignoring a DLQ item, or triggering a replay that then
-- updates status, is a normal, expected, non-destructive operation
-- (§34). This table is an operational queue, not a security record.
revoke insert, delete on automation_dlq from authenticated, anon;
grant insert on automation_dlq to service_role;

-- ----------------------------------------------------------------------------
-- 3. ADVISORY-LOCK CLAIM PATTERN — for Node-driven, externally-dependent
--    jobs (§31, see file header). `hashtextextended(key, 0)` gives a
--    deterministic 64-bit lock key from a text job name, matching the
--    spec's `job:offer_refresh` / `job:price_drop_detection` convention.
-- ----------------------------------------------------------------------------

create or replace function claim_job_run(p_job_name text, p_stale_after_minutes int default 15)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked boolean;
  v_active_count int;
  v_run_id uuid;
begin
  -- Non-blocking: returns immediately, true only if uncontended. This is
  -- the entire critical section — a few milliseconds, not the job itself.
  v_locked := pg_try_advisory_xact_lock(hashtextextended('job:' || p_job_name, 0));
  if not v_locked then
    return null; -- another caller is claiming this exact job right now
  end if;

  select count(*) into v_active_count
  from automation_jobs
  where job_name = p_job_name
    and status = 'running'
    and started_at > now() - make_interval(mins => p_stale_after_minutes);

  if v_active_count > 0 then
    return null; -- a genuinely recent run is still in progress — don't start a duplicate
  end if;

  insert into automation_jobs (job_name, status, started_at)
  values (p_job_name, 'running', now())
  returning id into v_run_id;

  return v_run_id;
end;
$$;

comment on function claim_job_run is
  'Atomically claims the right to start job_name, or returns NULL if another run already holds the claim (lock contention) or a recent run is still marked running (staleness window). See file header §(b) for why this is a claim-row pattern rather than holding one transaction for the whole external-API-dependent job.';

revoke execute on function claim_job_run from public, anon, authenticated;
grant execute on function claim_job_run to service_role;

create or replace function finish_job_run(
  p_run_id uuid, p_status job_run_status, p_records_processed int default 0,
  p_error_count int default 0, p_error_summary text default null, p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  update automation_jobs
  set status = p_status,
      finished_at = now(),
      duration_ms = extract(epoch from (now() - started_at)) * 1000,
      records_processed = p_records_processed,
      error_count = p_error_count,
      error_summary = p_error_summary,
      metadata = coalesce(p_metadata, '{}'::jsonb)
  where id = p_run_id;
$$;

revoke execute on function finish_job_run from public, anon, authenticated;
grant execute on function finish_job_run to service_role;

-- ----------------------------------------------------------------------------
-- 4. PURE-SQL JOBS — whole job = one transaction = one RPC call (§(a) above).
-- ----------------------------------------------------------------------------

-- ---- Price-drop detection (§28, §37, §89) ----
-- Tags an offer's current-lowest deal-eligible drop as a 'todays_deal'
-- (idempotent: unique(offer_id, label) + ON CONFLICT DO NOTHING means
-- running this twice never duplicates a deal row, §30).
create or replace function run_price_drop_detection(p_min_drop_pct numeric default 15, p_window_hours int default 24)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked boolean;
  v_run_id uuid;
  v_count int := 0;
begin
  v_locked := pg_try_advisory_xact_lock(hashtextextended('job:price_drop_detection', 0));
  if not v_locked then
    insert into automation_jobs (job_name, status, finished_at, error_summary)
    values ('price_drop_detection', 'skipped', now(), 'lock held by a concurrent run')
    returning id into v_run_id;
    return v_run_id;
  end if;

  insert into automation_jobs (job_name, status, started_at) values ('price_drop_detection', 'running', now())
  returning id into v_run_id;

  with recent_drops as (
    select ph.offer_id, ph.previous_price, ph.new_price
    from price_history ph
    where ph.changed_at > now() - make_interval(hours => p_window_hours)
      and ph.previous_price is not null
      and ph.previous_price > 0
      and ph.new_price < ph.previous_price
      and ((ph.previous_price - ph.new_price) / ph.previous_price) * 100 >= p_min_drop_pct
  ),
  eligible as (
    select rd.offer_id
    from recent_drops rd
    join offers o on o.id = rd.offer_id and o.status = 'available'
    join stores st on st.id = o.store_id and st.status = 'active'
  ),
  inserted as (
    insert into deals (offer_id, label, headline, created_by)
    select offer_id, 'todays_deal', 'Price drop', null from eligible
    on conflict (offer_id, label) do nothing
    returning 1
  )
  select count(*) into v_count from inserted;

  perform finish_job_run(v_run_id, 'success', v_count, 0, null, jsonb_build_object('min_drop_pct', p_min_drop_pct, 'window_hours', p_window_hours));
  return v_run_id;
end;
$$;

revoke execute on function run_price_drop_detection(numeric, int) from public, anon, authenticated;
grant execute on function run_price_drop_detection(numeric, int) to service_role;

-- ---- Deal recalculation (§21, §22, §30) ----
-- Deactivates deals whose underlying offer/product/store is no longer
-- eligible. Same end state every run regardless of how many times it's
-- called (§30) — a deal already inactive just stays inactive.
create or replace function run_deal_recalculation()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked boolean;
  v_run_id uuid;
  v_count int := 0;
begin
  v_locked := pg_try_advisory_xact_lock(hashtextextended('job:deal_recalculation', 0));
  if not v_locked then
    insert into automation_jobs (job_name, status, finished_at, error_summary)
    values ('deal_recalculation', 'skipped', now(), 'lock held by a concurrent run')
    returning id into v_run_id;
    return v_run_id;
  end if;

  insert into automation_jobs (job_name, status, started_at) values ('deal_recalculation', 'running', now())
  returning id into v_run_id;

  with deactivated as (
    update deals d
    set is_active = false
    where d.is_active
      and (
        d.ends_at is not null and d.ends_at <= now()
        or exists (
          select 1 from offers o where o.id = d.offer_id and o.status <> 'available'
        )
        or exists (
          select 1 from offers o join products p on p.id = o.product_id
          where o.id = d.offer_id and p.status <> 'active'
        )
        or exists (
          select 1 from offers o join stores st on st.id = o.store_id
          where o.id = d.offer_id and st.status <> 'active'
        )
      )
    returning 1
  )
  select count(*) into v_count from deactivated;

  perform finish_job_run(v_run_id, 'success', v_count);
  return v_run_id;
end;
$$;

revoke execute on function run_deal_recalculation from public, anon, authenticated;
grant execute on function run_deal_recalculation to service_role;

-- ----------------------------------------------------------------------------
-- 5. PRICE-ALERT PROCESSING FOUNDATION (§28, PHASE-3-CONTEXT.md's
--    price_alerts table, "foundation only, no notification engine").
--    This job identifies which alerts are currently satisfied; it does
--    NOT send an email/notification (out of scope, same as Part 3 left
--    it) — it records a match so a future phase's notification worker
--    has something concrete to consume, without duplicating a match it
--    already recorded (unique constraint below → idempotent, §30).
-- ----------------------------------------------------------------------------

create table price_alert_matches (
  id           uuid primary key default gen_random_uuid(),
  alert_id     uuid not null references price_alerts(id) on delete cascade,
  offer_id     uuid not null references offers(id) on delete cascade,
  matched_price numeric(10,2) not null,
  notified_at  timestamptz,             -- set by a future notification worker — null here means "not yet sent"
  created_at   timestamptz not null default now(),
  unique (alert_id, offer_id, matched_price)
);

comment on table price_alert_matches is
  'Foundation only (§28) — records that an alert''s target price is currently met. Sending an actual notification is explicitly out of scope for this phase, matching PHASE-3-CONTEXT.md''s original price_alerts note.';

create index idx_price_alert_matches_alert on price_alert_matches(alert_id, created_at desc);
create index idx_price_alert_matches_unnotified on price_alert_matches(notified_at) where notified_at is null;

alter table price_alert_matches enable row level security;
create policy "users can view their own alert matches" on price_alert_matches
  for select using (exists (select 1 from price_alerts pa where pa.id = alert_id and pa.user_id = auth.uid()));
create policy "admins can view all alert matches" on price_alert_matches
  for select using (is_admin(auth.uid()));
revoke insert, update, delete on price_alert_matches from authenticated, anon;
grant insert on price_alert_matches to service_role;

create or replace function run_price_alert_check()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked boolean;
  v_run_id uuid;
  v_count int := 0;
begin
  v_locked := pg_try_advisory_xact_lock(hashtextextended('job:price_alert_check', 0));
  if not v_locked then
    insert into automation_jobs (job_name, status, finished_at, error_summary)
    values ('price_alert_check', 'skipped', now(), 'lock held by a concurrent run')
    returning id into v_run_id;
    return v_run_id;
  end if;

  insert into automation_jobs (job_name, status, started_at) values ('price_alert_check', 'running', now())
  returning id into v_run_id;

  with candidate_offers as (
    -- product-level alert (offer_id null): any currently-available offer
    -- for that product at/under target price; offer-level alert: that
    -- specific offer only.
    select pa.id as alert_id, o.id as offer_id, o.price
    from price_alerts pa
    join offers o on o.product_id = pa.product_id and (pa.offer_id is null or pa.offer_id = o.id)
    where pa.is_enabled
      and o.status = 'available'
      and o.price <= pa.target_price
  ),
  inserted as (
    insert into price_alert_matches (alert_id, offer_id, matched_price)
    select alert_id, offer_id, price from candidate_offers
    on conflict (alert_id, offer_id, matched_price) do nothing
    returning 1
  )
  select count(*) into v_count from inserted;

  perform finish_job_run(v_run_id, 'success', v_count);
  return v_run_id;
end;
$$;

revoke execute on function run_price_alert_check from public, anon, authenticated;
grant execute on function run_price_alert_check to service_role;

-- ============================================================================
-- End of 0008_automation.sql
-- ============================================================================

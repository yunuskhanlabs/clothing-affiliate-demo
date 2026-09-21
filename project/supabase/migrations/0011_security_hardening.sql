-- ============================================================================
-- CLOXTRO — PART 5 — Security Hardening: log_admin_action RPC authorization
-- ============================================================================
-- Ensures log_admin_action (SECURITY DEFINER) verifies caller is an admin
-- or service_role before writing audit log entries, preventing non-admin
-- authenticated users from forging audit records via direct RPC invocation.
-- ============================================================================

create or replace function log_admin_action(
  p_actor_id uuid,
  p_actor_email text,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb,
  p_step_up_used boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.role() <> 'service_role' and not is_admin(auth.uid()) then
    raise exception 'Access denied: log_admin_action requires admin privileges';
  end if;

  insert into audit_logs (actor_id, actor_email, action, entity_type, entity_id, metadata, step_up_used)
  values (p_actor_id, p_actor_email, p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb), p_step_up_used)
  returning id into v_id;
  return v_id;
end;
$$;


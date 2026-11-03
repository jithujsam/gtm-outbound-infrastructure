-- Klaroh security fix, part 1 of 4: close the data leaks and fix the Pause button (RUN THIS FIRST)
-- Same SQL as supabase/migrations/20260101000100_security_hardening_v1.sql, split into
-- smaller pieces for the Supabase SQL Editor. Safe to run more than once. Deletes no data.
-- Removes the open "read everything" policies, locks the old unused function, lets clients be paused.

-- ── 8. REMOVE blanket public read policies found on production ──────────────
-- A fingerprint of the live database showed `clients_public` and
-- `campaigns_public` (SELECT ... USING (true)) still present: they let anyone
-- holding the public anon key read EVERY agency's clients (names, slugs,
-- client_email) and campaigns. Nothing in the app needs them — the public
-- portal reads through the SECURITY DEFINER functions above. The older names
-- from the legacy files are dropped too, in case they exist.
drop policy if exists "clients_public"           on public.clients;
drop policy if exists "campaigns_public"         on public.campaigns;
drop policy if exists "public_read_client_slug"  on public.clients;
drop policy if exists "public_read_campaigns"    on public.campaigns;
drop policy if exists "public_read_remarks"      on public.remarks;

-- ── 9. get_campaign_data(): dead, and SECURITY DEFINER on production ─────────
-- Production has it as SECURITY DEFINER and callable by anon, so anyone could
-- fetch a client's campaign metrics by UUID, bypassing RLS and the active check.
-- The application no longer calls it. Revoke instead of drop (reversible).
do $fn$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_campaign_data'
      and pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_client_id uuid'
  ) then
    revoke all on function public.get_campaign_data(uuid, uuid) from public, anon, authenticated;
  end if;
end;
$fn$;

-- ── 10. clients.status must allow what the app writes ────────────────────────
-- Production only allowed ('active','inactive'), so the Pause toggle (which
-- writes 'paused') failed. Widen to a superset: existing rows stay valid, and
-- every non-'active' value is treated as inactive by the portal and the RPCs.
do $fn$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.clients'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.clients drop constraint %I', r.conname);
  end loop;
end;
$fn$;

alter table public.clients
  add constraint clients_status_check
  check (status in ('active', 'paused', 'ended', 'inactive'));

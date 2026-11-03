-- Klaroh V2 — SQL Editor part 01: 20261006000100_v2_workspaces.sql, piece 1 of 2.
-- Run the files in this folder one at a time, in numeric order. Safe to re-run.
-- Generated from supabase/migrations/20261006000100_v2_workspaces.sql; tests prove the result is identical.

-- ═══════════════════════════════════════════════════════════════════════════
-- 20261006000100_v2_workspaces.sql — V2 PHASE 1: workspace foundation
--
-- Creates the V2 tenant model next to V1 without changing how the app behaves:
--
--   auth.users → workspace_members → workspaces
--
--   * one workspace per existing agency_details row (same id, so every
--     agency_id value is also that agency's workspace_id), owned by the
--     agency's user;
--   * workspace_id added to clients, integrations, remarks and the V1
--     campaigns table, and back-filled from agency_id;
--   * compatibility triggers keep V1 writers working during the transition:
--     a new agency_details row gets a workspace, and a row written with only
--     agency_id gets its workspace_id filled in.
--
-- Non-destructive and idempotent: nothing is dropped, every statement can be
-- run again. agency_details stays untouched (it is retired, not deleted).
-- ═══════════════════════════════════════════════════════════════════════════

set check_function_bodies = false;

-- ── tables ──────────────────────────────────────────────────────────────────
create table if not exists public.workspaces (
  id               uuid primary key default gen_random_uuid(),
  name             text,
  website          text,
  logo_url         text,
  timezone         text not null default 'UTC',
  plan             text not null default 'trial',
  legacy_agency_id uuid unique references public.agency_details(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Both plan vocabularies exist in the wild (see supabase/README.md).
  constraint workspaces_plan_check
    check (plan in ('trial', 'solo', 'growth', 'agency', 'basic', 'standard', 'pro'))
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists idx_workspace_members_user_id on public.workspace_members (user_id);

drop trigger if exists update_workspaces_updated_at on public.workspaces;
create trigger update_workspaces_updated_at
  before update on public.workspaces
  for each row execute function public.update_updated_at();

-- ── membership helpers (SECURITY DEFINER: no RLS recursion on members) ──────
create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid()
  );
$fn$;

create or replace function public.has_workspace_role(p_workspace_id uuid, p_roles text[])
returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid() and role = any (p_roles)
  );
$fn$;

revoke all on function public.is_workspace_member(uuid) from public, anon;
revoke all on function public.has_workspace_role(uuid, text[]) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated, service_role;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

-- Members read their workspace; owners/admins edit its profile. Workspaces are
-- created only by ensure_workspace() / the compatibility trigger (definer).
drop policy if exists workspaces_member_select on public.workspaces;
create policy workspaces_member_select on public.workspaces
  for select to authenticated using (public.is_workspace_member(id));

drop policy if exists workspaces_admin_update on public.workspaces;
create policy workspaces_admin_update on public.workspaces
  for update to authenticated
  using (public.has_workspace_role(id, array['owner', 'admin']))
  with check (public.has_workspace_role(id, array['owner', 'admin']));

-- Members see the member list of their own workspaces; no self-service writes.
drop policy if exists workspace_members_member_select on public.workspace_members;
create policy workspace_members_member_select on public.workspace_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_workspace_member(workspace_id));

-- plan / created_at / legacy_agency_id are not user-editable (billing safety,
-- same rule as agency_details). service_role and the SQL editor bypass this.
create or replace function public.protect_workspace_billing_fields()
returns trigger
language plpgsql as $fn$
begin
  if current_user in ('anon', 'authenticated') then
    new.plan := old.plan;
    new.created_at := old.created_at;
    new.legacy_agency_id := old.legacy_agency_id;
  end if;
  return new;
end;
$fn$;

drop trigger if exists protect_workspace_billing_fields on public.workspaces;
create trigger protect_workspace_billing_fields
  before update on public.workspaces
  for each row execute function public.protect_workspace_billing_fields();

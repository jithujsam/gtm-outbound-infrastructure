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

-- ── back-fill: one workspace per agency, the agency's user as owner ─────────
insert into public.workspaces (id, name, website, logo_url, timezone, plan, legacy_agency_id, created_at, updated_at)
select ad.id, ad.agency_name, ad.agency_website, ad.agency_logo_url,
       coalesce(ad.timezone, 'UTC'), ad.plan, ad.id, ad.created_at, ad.updated_at
from public.agency_details ad
where not exists (
  select 1 from public.workspaces w where w.legacy_agency_id = ad.id or w.id = ad.id
);

insert into public.workspace_members (workspace_id, user_id, role, created_at)
select w.id, ad.user_id, 'owner', ad.created_at
from public.agency_details ad
join public.workspaces w on w.legacy_agency_id = ad.id
on conflict (workspace_id, user_id) do nothing;

-- ── workspace_id on V1-owned records ────────────────────────────────────────
alter table public.clients      add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.integrations add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.remarks      add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.campaigns    add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

create index if not exists idx_clients_workspace_id      on public.clients (workspace_id);
create index if not exists idx_integrations_workspace_id on public.integrations (workspace_id);
create index if not exists idx_remarks_workspace_id      on public.remarks (workspace_id);
create index if not exists idx_campaigns_workspace_id    on public.campaigns (workspace_id);

update public.clients t set workspace_id = w.id
  from public.workspaces w where w.legacy_agency_id = t.agency_id and t.workspace_id is null;
update public.integrations t set workspace_id = w.id
  from public.workspaces w where w.legacy_agency_id = t.agency_id and t.workspace_id is null;
update public.remarks t set workspace_id = w.id
  from public.workspaces w where w.legacy_agency_id = t.agency_id and t.workspace_id is null;
update public.campaigns t set workspace_id = w.id
  from public.workspaces w where w.legacy_agency_id = t.agency_id and t.workspace_id is null;

-- ── provider field on integrations (provider-neutral name for `tool`) ───────
alter table public.integrations add column if not exists provider text;
update public.integrations set provider = tool where provider is null;

-- ── compatibility: V1 writers keep producing complete V2 rows ───────────────
-- A row written with only agency_id gets its workspace_id; an integration
-- written with only one of tool/provider gets the other. Named trg_zz_* so it
-- runs after the other BEFORE triggers (PostgreSQL fires them by name).
create or replace function public.fill_workspace_from_agency()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.workspace_id is null and new.agency_id is not null then
    select id into new.workspace_id from workspaces where legacy_agency_id = new.agency_id;
  end if;
  if tg_table_name = 'integrations' then
    new.provider := coalesce(new.provider, new.tool);
    new.tool := coalesce(new.tool, new.provider);
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_zz_fill_workspace_id on public.clients;
create trigger trg_zz_fill_workspace_id before insert or update on public.clients
  for each row execute function public.fill_workspace_from_agency();
drop trigger if exists trg_zz_fill_workspace_id on public.integrations;
create trigger trg_zz_fill_workspace_id before insert or update on public.integrations
  for each row execute function public.fill_workspace_from_agency();
drop trigger if exists trg_zz_fill_workspace_id on public.remarks;
create trigger trg_zz_fill_workspace_id before insert or update on public.remarks
  for each row execute function public.fill_workspace_from_agency();
drop trigger if exists trg_zz_fill_workspace_id on public.campaigns;
create trigger trg_zz_fill_workspace_id before insert or update on public.campaigns
  for each row execute function public.fill_workspace_from_agency();

-- A new agency_details row (V1 signup/settings) gets its workspace + owner, and
-- profile edits made through V1 are mirrored onto the workspace.
create or replace function public.sync_workspace_from_agency()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if tg_op = 'INSERT' then
    insert into workspaces (id, name, website, logo_url, timezone, plan, legacy_agency_id, created_at)
    values (new.id, new.agency_name, new.agency_website, new.agency_logo_url,
            coalesce(new.timezone, 'UTC'), new.plan, new.id, new.created_at)
    on conflict do nothing;
    insert into workspace_members (workspace_id, user_id, role)
    select w.id, new.user_id, 'owner' from workspaces w where w.legacy_agency_id = new.id
    on conflict do nothing;
  else
    update workspaces
       set name = new.agency_name, website = new.agency_website,
           logo_url = new.agency_logo_url, timezone = coalesce(new.timezone, 'UTC'),
           plan = new.plan
     where legacy_agency_id = new.id;
  end if;
  return null;
end;
$fn$;

drop trigger if exists trg_sync_workspace_from_agency on public.agency_details;
create trigger trg_sync_workspace_from_agency
  after insert or update on public.agency_details
  for each row execute function public.sync_workspace_from_agency();

revoke all on function public.fill_workspace_from_agency() from public, anon, authenticated;
revoke all on function public.sync_workspace_from_agency() from public, anon, authenticated;

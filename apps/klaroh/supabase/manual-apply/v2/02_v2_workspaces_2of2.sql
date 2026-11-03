-- Klaroh V2 — SQL Editor part 02: 20261006000100_v2_workspaces.sql, piece 2 of 2.
-- Run the files in this folder one at a time, in numeric order. Safe to re-run.
-- Generated from supabase/migrations/20261006000100_v2_workspaces.sql; tests prove the result is identical.
set check_function_bodies = false;

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

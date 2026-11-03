-- ═══════════════════════════════════════════════════════════════════════════
-- 20261006000300_v2_campaign_foundation.sql — V2 PHASE 3: campaign foundation
--
-- Provider-neutral campaign storage. Nothing here knows about Instantly:
--
--   campaigns_v2         one row per provider campaign, UNIQUE(integration_id, external_id);
--                        does NOT require a client
--   campaign_stats       historical snapshots: one row per campaign per day
--                        (UNIQUE(campaign_id, stat_date)); earlier days are never
--                        overwritten, repeated syncs on the same day refresh that
--                        day's snapshot; provider_raw keeps the provider payload
--   campaign_client_map  optional campaign ↔ client relationship
--   sync_runs            one row per sync: status, counts, error
--   campaign_legacy_map  which V1 `campaigns` row became which V2 campaign
--
-- Tenancy (workspace_id) is always derived server-side from the parent row.
-- Non-destructive and idempotent. The application is not switched here.
-- ═══════════════════════════════════════════════════════════════════════════

set check_function_bodies = false;

-- ── tables ──────────────────────────────────────────────────────────────────
create table if not exists public.campaigns_v2 (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  integration_id      uuid not null references public.integrations(id),
  provider            text not null,
  external_id         text not null,
  name                text not null,
  display_name        text,
  status              text not null default 'unknown'
                      check (status in ('draft', 'active', 'paused', 'completed', 'error', 'suspended', 'unknown')),
  provider_status     text,
  is_evergreen        boolean,
  sender_count        integer,
  daily_limit         integer,
  start_date          date,
  end_date            date,
  external_created_at timestamptz,
  external_updated_at timestamptz,
  provider_raw        jsonb,
  first_synced_at     timestamptz not null default now(),
  last_synced_at      timestamptz,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint campaigns_v2_integration_external_key unique (integration_id, external_id)
);
create index if not exists idx_campaigns_v2_workspace_id on public.campaigns_v2 (workspace_id);

create table if not exists public.sync_runs (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  integration_id     uuid references public.integrations(id) on delete set null,
  provider           text not null,
  triggered_by       text not null check (triggered_by in ('manual', 'cron', 'attach', 'backfill')),
  status             text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  campaigns_seen     integer not null default 0,
  campaigns_upserted integer not null default 0,
  stats_written      integer not null default 0,
  error_message      text
);
create index if not exists idx_sync_runs_integration_started on public.sync_runs (integration_id, started_at desc);
create index if not exists idx_sync_runs_workspace_started on public.sync_runs (workspace_id, started_at desc);

create table if not exists public.campaign_stats (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references public.campaigns_v2(id) on delete cascade,
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  sync_run_id         uuid references public.sync_runs(id) on delete set null,
  stat_date           date not null,
  captured_at         timestamptz not null default now(),
  -- cumulative (lifetime-to-date) counters; null = not reported by the provider
  leads               bigint,
  contacted           bigint,
  new_leads_contacted bigint,
  emails_sent         bigint,
  opens               bigint,
  opens_unique        bigint,
  replies             bigint,
  replies_unique      bigint,
  clicks              bigint,
  clicks_unique       bigint,
  bounces             bigint,
  unsubscribes        bigint,
  completed           bigint,
  opportunities       bigint,
  opportunity_value   numeric(14,2),
  interested          bigint,
  meetings_booked     bigint,
  meetings_completed  bigint,
  closed              bigint,
  provider_raw        jsonb,
  constraint campaign_stats_campaign_day_key unique (campaign_id, stat_date)
);
create index if not exists idx_campaign_stats_workspace_id on public.campaign_stats (workspace_id);

create table if not exists public.campaign_client_map (
  campaign_id  uuid not null references public.campaigns_v2(id) on delete cascade,
  client_id    uuid not null references public.clients(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (campaign_id, client_id)
);
create index if not exists idx_campaign_client_map_client_id on public.campaign_client_map (client_id);
create index if not exists idx_campaign_client_map_workspace_id on public.campaign_client_map (workspace_id);

create table if not exists public.campaign_legacy_map (
  legacy_campaign_id uuid primary key,
  campaign_id        uuid not null references public.campaigns_v2(id) on delete cascade,
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  legacy_client_id   uuid,
  migrated_at        timestamptz not null default now()
);
create index if not exists idx_campaign_legacy_map_campaign_id on public.campaign_legacy_map (campaign_id);

-- ── integrity triggers: tenancy is derived, never trusted ───────────────────
create or replace function public.campaigns_v2_guard()
returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_workspace uuid;
  v_provider  text;
begin
  select workspace_id, provider into v_workspace, v_provider
  from integrations where id = new.integration_id;
  if v_workspace is null then
    raise exception 'Unknown integration' using errcode = '23503';
  end if;
  if new.workspace_id is distinct from v_workspace then
    raise exception 'Integration belongs to another workspace' using errcode = '42501';
  end if;
  new.provider := v_provider;
  if tg_op = 'UPDATE' then
    new.first_synced_at := old.first_synced_at;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_campaigns_v2_guard on public.campaigns_v2;
create trigger trg_campaigns_v2_guard before insert or update on public.campaigns_v2
  for each row execute function public.campaigns_v2_guard();

drop trigger if exists update_campaigns_v2_updated_at on public.campaigns_v2;
create trigger update_campaigns_v2_updated_at before update on public.campaigns_v2
  for each row execute function public.update_updated_at();

-- Stats: workspace from the campaign; an older capture never replaces a newer
-- one for the same day (out-of-order or concurrent syncs).
create or replace function public.campaign_stats_guard()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  select workspace_id into new.workspace_id from campaigns_v2 where id = new.campaign_id;
  if new.workspace_id is null then
    raise exception 'Unknown campaign' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' and new.captured_at < old.captured_at then
    return old;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_campaign_stats_guard on public.campaign_stats;
create trigger trg_campaign_stats_guard before insert or update on public.campaign_stats
  for each row execute function public.campaign_stats_guard();

-- Map: workspace from the client; the campaign must be in the same workspace.
create or replace function public.campaign_client_map_guard()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  select workspace_id into new.workspace_id from clients where id = new.client_id;
  if new.workspace_id is null then
    raise exception 'Unknown client' using errcode = '23503';
  end if;
  if not exists (select 1 from campaigns_v2 where id = new.campaign_id and workspace_id = new.workspace_id) then
    raise exception 'Campaign belongs to another workspace' using errcode = '42501';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_campaign_client_map_guard on public.campaign_client_map;
create trigger trg_campaign_client_map_guard before insert or update on public.campaign_client_map
  for each row execute function public.campaign_client_map_guard();

-- Sync runs: the integration (when given) must be in the run's workspace.
create or replace function public.sync_runs_guard()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.integration_id is not null and not exists (
    select 1 from integrations where id = new.integration_id and workspace_id = new.workspace_id
  ) then
    raise exception 'Integration belongs to another workspace' using errcode = '42501';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_sync_runs_guard on public.sync_runs;
create trigger trg_sync_runs_guard before insert or update on public.sync_runs
  for each row execute function public.sync_runs_guard();

revoke all on function public.campaigns_v2_guard() from public, anon, authenticated;
revoke all on function public.campaign_stats_guard() from public, anon, authenticated;
revoke all on function public.campaign_client_map_guard() from public, anon, authenticated;
revoke all on function public.sync_runs_guard() from public, anon, authenticated;

-- ── RLS: workspace members only; history is not deletable by users ──────────
alter table public.campaigns_v2        enable row level security;
alter table public.campaign_stats      enable row level security;
alter table public.campaign_client_map enable row level security;
alter table public.sync_runs           enable row level security;
alter table public.campaign_legacy_map enable row level security;

drop policy if exists campaigns_v2_member_select on public.campaigns_v2;
drop policy if exists campaigns_v2_member_insert on public.campaigns_v2;
drop policy if exists campaigns_v2_member_update on public.campaigns_v2;
create policy campaigns_v2_member_select on public.campaigns_v2 for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy campaigns_v2_member_insert on public.campaigns_v2 for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
create policy campaigns_v2_member_update on public.campaigns_v2 for update to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

drop policy if exists campaign_stats_member_select on public.campaign_stats;
drop policy if exists campaign_stats_member_insert on public.campaign_stats;
drop policy if exists campaign_stats_member_update on public.campaign_stats;
create policy campaign_stats_member_select on public.campaign_stats for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy campaign_stats_member_insert on public.campaign_stats for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
create policy campaign_stats_member_update on public.campaign_stats for update to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

drop policy if exists campaign_client_map_member_select on public.campaign_client_map;
drop policy if exists campaign_client_map_member_insert on public.campaign_client_map;
drop policy if exists campaign_client_map_member_delete on public.campaign_client_map;
create policy campaign_client_map_member_select on public.campaign_client_map for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy campaign_client_map_member_insert on public.campaign_client_map for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
create policy campaign_client_map_member_delete on public.campaign_client_map for delete to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists sync_runs_member_select on public.sync_runs;
drop policy if exists sync_runs_member_insert on public.sync_runs;
drop policy if exists sync_runs_member_update on public.sync_runs;
create policy sync_runs_member_select on public.sync_runs for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy sync_runs_member_insert on public.sync_runs for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
create policy sync_runs_member_update on public.sync_runs for update to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

drop policy if exists campaign_legacy_map_member_select on public.campaign_legacy_map;
create policy campaign_legacy_map_member_select on public.campaign_legacy_map for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- ── read model: client campaigns with their latest snapshot ─────────────────
-- SECURITY INVOKER: runs under the caller's RLS, so it only ever returns the
-- caller's own workspace data. p_client_id null = every client of the caller.
create or replace function public.get_client_campaigns(p_client_id uuid default null)
returns table (
  campaign_id uuid, client_id uuid, workspace_id uuid, integration_id uuid, provider text,
  external_id text, name text, provider_name text, status text, provider_status text,
  is_evergreen boolean, sender_count integer, daily_limit integer, start_date date, end_date date,
  external_created_at timestamptz, external_updated_at timestamptz, last_synced_at timestamptz,
  attached_at timestamptz, stat_date date, captured_at timestamptz,
  leads bigint, contacted bigint, new_leads_contacted bigint, emails_sent bigint,
  opens bigint, opens_unique bigint, replies bigint, replies_unique bigint,
  clicks bigint, clicks_unique bigint, bounces bigint, unsubscribes bigint, completed bigint,
  opportunities bigint, opportunity_value numeric, interested bigint,
  meetings_booked bigint, meetings_completed bigint, closed bigint
)
language sql stable security invoker set search_path = public as $fn$
  select c.id, m.client_id, c.workspace_id, c.integration_id, c.provider,
         c.external_id, coalesce(c.display_name, c.name), c.name, c.status, c.provider_status,
         c.is_evergreen, c.sender_count, c.daily_limit, c.start_date, c.end_date,
         c.external_created_at, c.external_updated_at, c.last_synced_at,
         m.created_at, s.stat_date, s.captured_at,
         s.leads, s.contacted, s.new_leads_contacted, s.emails_sent,
         s.opens, s.opens_unique, s.replies, s.replies_unique,
         s.clicks, s.clicks_unique, s.bounces, s.unsubscribes, s.completed,
         s.opportunities, s.opportunity_value, s.interested,
         s.meetings_booked, s.meetings_completed, s.closed
  from campaign_client_map m
  join campaigns_v2 c on c.id = m.campaign_id and c.archived_at is null
  left join lateral (
    select * from campaign_stats st
    where st.campaign_id = c.id
    order by st.stat_date desc, st.captured_at desc
    limit 1
  ) s on true
  where p_client_id is null or m.client_id = p_client_id
  order by m.created_at desc, c.id;
$fn$;

revoke all on function public.get_client_campaigns(uuid) from public, anon;
grant execute on function public.get_client_campaigns(uuid) to authenticated, service_role;

-- Klaroh V2 — SQL Editor part 07: 20261006000300_v2_campaign_foundation.sql, piece 3 of 3.
-- Run the files in this folder one at a time, in numeric order. Safe to re-run.
-- Generated from supabase/migrations/20261006000300_v2_campaign_foundation.sql; tests prove the result is identical.
set check_function_bodies = false;

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

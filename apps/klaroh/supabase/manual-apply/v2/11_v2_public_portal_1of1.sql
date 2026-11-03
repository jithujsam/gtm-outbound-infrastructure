-- Klaroh V2 — SQL Editor part 11: 20261006000500_v2_public_portal.sql, piece 1 of 1.
-- Run the files in this folder one at a time, in numeric order. Safe to re-run.
-- Generated from supabase/migrations/20261006000500_v2_public_portal.sql; tests prove the result is identical.

-- ═══════════════════════════════════════════════════════════════════════════
-- 20261006000500_v2_public_portal.sql — V2 PHASE 5: portal + reads on V2
--
-- The public client portal (/c/[slug]) reads V2:
--   * get_public_campaigns(client)         → the client's V2 campaigns (id, name)
--   * get_public_client_campaigns(client)  → each campaign with its latest snapshot
--   * get_public_workspace_branding(client)→ agency name + logo from the workspace
-- All SECURITY DEFINER, active clients only, and they expose no internal ids
-- (workspace, integration, provider campaign id) and no provider payloads.
-- Non-destructive and idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

set check_function_bodies = false;

create or replace function public.get_public_campaigns(p_client_id uuid)
returns table (id uuid, name text)
security definer set search_path = public
language sql stable as $fn$
  select c.id, coalesce(c.display_name, c.name)
  from campaign_client_map m
  join clients cl on cl.id = m.client_id and cl.status = 'active'
  join campaigns_v2 c on c.id = m.campaign_id and c.archived_at is null
  where m.client_id = p_client_id
  order by m.created_at desc, c.id;
$fn$;

create or replace function public.get_public_client_campaigns(p_client_id uuid)
returns table (
  campaign_id uuid, name text, provider text, status text,
  is_evergreen boolean, sender_count integer, daily_limit integer, start_date date, end_date date,
  external_created_at timestamptz, external_updated_at timestamptz, last_synced_at timestamptz,
  stat_date date, captured_at timestamptz,
  leads bigint, contacted bigint, new_leads_contacted bigint, emails_sent bigint,
  opens bigint, opens_unique bigint, replies bigint, replies_unique bigint,
  clicks bigint, clicks_unique bigint, bounces bigint, unsubscribes bigint, completed bigint,
  opportunities bigint, opportunity_value numeric, interested bigint,
  meetings_booked bigint, meetings_completed bigint, closed bigint
)
security definer set search_path = public
language sql stable as $fn$
  select c.id, coalesce(c.display_name, c.name), c.provider, c.status,
         c.is_evergreen, c.sender_count, c.daily_limit, c.start_date, c.end_date,
         c.external_created_at, c.external_updated_at, c.last_synced_at,
         s.stat_date, s.captured_at,
         s.leads, s.contacted, s.new_leads_contacted, s.emails_sent,
         s.opens, s.opens_unique, s.replies, s.replies_unique,
         s.clicks, s.clicks_unique, s.bounces, s.unsubscribes, s.completed,
         s.opportunities, s.opportunity_value, s.interested,
         s.meetings_booked, s.meetings_completed, s.closed
  from campaign_client_map m
  join clients cl on cl.id = m.client_id and cl.status = 'active'
  join campaigns_v2 c on c.id = m.campaign_id and c.archived_at is null
  left join lateral (
    select * from campaign_stats st
    where st.campaign_id = c.id
    order by st.stat_date desc, st.captured_at desc
    limit 1
  ) s on true
  where m.client_id = p_client_id
  order by m.created_at desc, c.id;
$fn$;

create or replace function public.get_public_workspace_branding(p_client_id uuid)
returns table (agency_name text, agency_logo_url text)
security definer set search_path = public
language sql stable as $fn$
  select w.name, w.logo_url
  from clients cl
  join workspaces w on w.id = cl.workspace_id
  where cl.id = p_client_id and cl.status = 'active';
$fn$;

revoke all on function public.get_public_client_campaigns(uuid) from public;
revoke all on function public.get_public_workspace_branding(uuid) from public;
grant execute on function public.get_public_campaigns(uuid) to anon, authenticated;
grant execute on function public.get_public_client_campaigns(uuid) to anon, authenticated;
grant execute on function public.get_public_workspace_branding(uuid) to anon, authenticated;

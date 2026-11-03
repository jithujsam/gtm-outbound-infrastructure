-- Klaroh — SQL Editor part 14: 20261007000200_provider_campaign_name.sql, piece 1 of 1.
-- Run the files in this folder one at a time, in numeric order. Safe to re-run.
-- Generated from supabase/migrations/20261007000200_provider_campaign_name.sql; tests prove the result is identical.

-- ═══════════════════════════════════════════════════════════════════════════
-- 20261007000200_provider_campaign_name.sql — the provider owns campaign names
--
-- A provider-backed campaign (every campaigns_v2 row: integration_id and
-- external_id are NOT NULL) is named by its provider. Klaroh shows exactly
-- that name and never a Klaroh-side override:
--
--   provider API → adapter → NormalizedCampaign.name → campaigns_v2.name → UI
--
-- Before this file, campaigns_v2.display_name (seeded by the V1 back-fill from
-- the agency's old per-client campaign name, and writable through the retired
-- rename endpoint) overrode the provider name in every read model, so an
-- Instantly campaign renamed to "Pharma" kept showing its old Klaroh name.
--
--   1. Stale overrides are cleared. Nothing else is touched: the campaign row,
--      its id, its statistics history and its client links stay as they are.
--      The V1 names remain recorded in campaign_legacy_map.legacy_name.
--   2. display_name can no longer be set (a trigger keeps it null), so a
--      provider-backed campaign cannot be renamed inside Klaroh.
--   3. get_client_campaigns / get_public_campaigns / get_public_client_campaigns
--      return the provider name (same signatures, so callers are unchanged).
--
-- The column itself is kept (no destructive schema change). Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

set check_function_bodies = false;

-- ── 1. clear stale Klaroh-side names (metadata only) ────────────────────────
update public.campaigns_v2 set display_name = null where display_name is not null;

comment on column public.campaigns_v2.display_name is
  'Retired: always null. The provider name (campaigns_v2.name) is the only campaign name.';
comment on column public.campaigns_v2.name is
  'The provider''s campaign name, refreshed by every sync. Source of truth; not editable in Klaroh.';

-- ── 2. display_name can never be set again ──────────────────────────────────
create or replace function public.campaigns_v2_provider_name()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  new.display_name := null;
  return new;
end;
$fn$;

revoke all on function public.campaigns_v2_provider_name() from public, anon, authenticated;

drop trigger if exists trg_campaigns_v2_provider_name on public.campaigns_v2;
create trigger trg_campaigns_v2_provider_name before insert or update on public.campaigns_v2
  for each row execute function public.campaigns_v2_provider_name();

-- ── 3. read models: the provider name ───────────────────────────────────────
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
         c.external_id, c.name, c.name, c.status, c.provider_status,
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

create or replace function public.get_public_campaigns(p_client_id uuid)
returns table (id uuid, name text)
security definer set search_path = public
language sql stable as $fn$
  select c.id, c.name
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
  select c.id, c.name, c.provider, c.status,
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
-- (create or replace keeps each function's existing grants)

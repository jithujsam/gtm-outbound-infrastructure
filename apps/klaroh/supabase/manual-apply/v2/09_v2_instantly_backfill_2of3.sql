-- Klaroh V2 — SQL Editor part 09: 20261006000400_v2_instantly_backfill.sql, piece 2 of 3.
-- Run the files in this folder one at a time, in numeric order. Safe to re-run.
-- Generated from supabase/migrations/20261006000400_v2_instantly_backfill.sql; tests prove the result is identical.
set check_function_bodies = false;

-- ── import one V1 row ───────────────────────────────────────────────────────
-- The only provider-specific SQL in V2: V1 stored Instantly's numeric status
-- code, translated once here into the provider-neutral status.
create or replace function public.v2_import_legacy_campaign(p_legacy_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $fn$
declare
  c            campaigns%rowtype;
  v_id         uuid;
  v_captured   timestamptz;
  v_has_stats  boolean;
begin
  select * into c from campaigns where id = p_legacy_id;
  if not found or c.integration_id is null or c.external_id is null
     or coalesce(c.tool, c.source) <> 'instantly' or c.workspace_id is null then
    return null;
  end if;

  insert into campaigns_v2 (
    id, workspace_id, integration_id, provider, external_id, name, display_name, status, provider_status,
    is_evergreen, sender_count, daily_limit, start_date, end_date, external_created_at, external_updated_at,
    provider_raw, first_synced_at, last_synced_at, created_at)
  values (
    c.id, c.workspace_id, c.integration_id, 'instantly', c.external_id,
    coalesce(c.external_name, c.name),
    case when c.external_name is not null and c.name is distinct from c.external_name then c.name end,
    case c.external_status
      when 0 then 'draft' when 1 then 'active' when 2 then 'paused' when 3 then 'completed'
      when 4 then 'active' when -1 then 'error' when -2 then 'error' when -99 then 'suspended'
      else 'unknown' end,
    c.external_status::text,
    c.external_is_evergreen, c.external_sender_count, c.external_daily_limit,
    c.external_start_date, c.external_end_date, c.external_created_at, c.external_updated_at,
    jsonb_strip_nulls(jsonb_build_object('pl_value', c.external_pl_value, 'migrated_from', 'v1_campaigns')),
    coalesce(c.created_at, now()), c.last_synced, coalesce(c.created_at, now()))
  on conflict (integration_id, external_id) do update
    set last_synced_at = greatest(campaigns_v2.last_synced_at, excluded.last_synced_at)
  returning id into v_id;

  insert into campaign_client_map (campaign_id, client_id, workspace_id, created_at)
  values (v_id, c.client_id, c.workspace_id, coalesce(c.created_at, now()))
  on conflict (campaign_id, client_id) do nothing;

  insert into campaign_legacy_map (legacy_campaign_id, campaign_id, workspace_id, legacy_client_id, legacy_name)
  values (c.id, v_id, c.workspace_id, c.client_id, c.name)
  on conflict (legacy_campaign_id) do update
    set campaign_id = excluded.campaign_id, legacy_name = excluded.legacy_name;

  v_has_stats := coalesce(c.leads_count, c.contacted_count, c.emails_sent_count, c.open_count_unique,
                          c.reply_count_unique, c.total_opportunities, c.bounced_count) is not null;
  if v_has_stats then
    v_captured := coalesce(c.last_synced, c.created_at, now());
    insert into campaign_stats (
      campaign_id, workspace_id, stat_date, captured_at,
      leads, contacted, new_leads_contacted, emails_sent, opens, opens_unique, replies, replies_unique,
      clicks, clicks_unique, bounces, unsubscribes, completed, opportunities, opportunity_value,
      interested, meetings_booked, meetings_completed, closed, provider_raw)
    values (
      v_id, c.workspace_id, (v_captured at time zone 'UTC')::date, v_captured,
      c.leads_count, c.contacted_count, c.new_leads_contacted_count, coalesce(c.emails_sent_count, c.emails_sent),
      c.open_count, c.open_count_unique, c.reply_count, c.reply_count_unique,
      c.link_click_count, c.link_click_count_unique, c.bounced_count, c.unsubscribed_count, c.completed_count,
      c.total_opportunities, c.total_opportunity_value, c.total_interested, c.total_meeting_booked,
      c.total_meeting_completed, c.total_closed,
      jsonb_build_object('migrated_from', 'v1_campaigns', 'legacy_campaign_id', c.id))
    on conflict (campaign_id, stat_date) do update set
      captured_at = excluded.captured_at, leads = excluded.leads, contacted = excluded.contacted,
      new_leads_contacted = excluded.new_leads_contacted, emails_sent = excluded.emails_sent,
      opens = excluded.opens, opens_unique = excluded.opens_unique, replies = excluded.replies,
      replies_unique = excluded.replies_unique, clicks = excluded.clicks, clicks_unique = excluded.clicks_unique,
      bounces = excluded.bounces, unsubscribes = excluded.unsubscribes, completed = excluded.completed,
      opportunities = excluded.opportunities, opportunity_value = excluded.opportunity_value,
      interested = excluded.interested, meetings_booked = excluded.meetings_booked,
      meetings_completed = excluded.meetings_completed, closed = excluded.closed;
  end if;

  return v_id;
end;
$fn$;

revoke all on function public.v2_import_legacy_campaign(uuid) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20261006000400_v2_instantly_backfill.sql — V2 PHASE 4: V1 Instantly → V2
--
-- Moves every existing V1 Instantly campaign into the V2 tables:
--   * one campaigns_v2 row per (integration, Instantly campaign). V1 kept one
--     row per CLIENT, so the same Instantly campaign attached to two clients
--     becomes ONE V2 campaign mapped to both clients. The oldest V1 row's id
--     is reused as the V2 id;
--   * campaign_client_map keeps every client relationship;
--   * campaign_legacy_map records which V1 row became which V2 campaign (and
--     the name the agency gave it on that client);
--   * one campaign_stats snapshot from the V1 metrics, dated at the V1 sync;
--   * one 'backfill' sync_runs row per integration.
-- Remarks that pointed at a V1 campaign now point at its V2 campaign; the
-- original id is kept in remarks.legacy_campaign_id. Remarks on campaigns that
-- are not migrated (demo/legacy rows — fake data) keep their text and client
-- and move to the client's General timeline, with the original id kept.
--
-- The V1 `campaigns` table is NOT modified: it stays as the archive.
-- During the deploy window, V1 writes are mirrored into V2 by a trigger
-- (removed again by the phase 6 migration).
-- Idempotent: re-running converges to the same result.
-- ═══════════════════════════════════════════════════════════════════════════

set check_function_bodies = false;

alter table public.campaign_legacy_map add column if not exists legacy_name text;
alter table public.remarks add column if not exists legacy_campaign_id uuid;

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

-- ── back-fill every V1 Instantly campaign (oldest first: its id is reused) ──
do $fn$
declare
  r record;
begin
  for r in
    select id from public.campaigns
    where coalesce(tool, source) = 'instantly' and integration_id is not null and external_id is not null
    order by created_at nulls last, id
  loop
    perform public.v2_import_legacy_campaign(r.id);
  end loop;

  -- one 'backfill' sync run per integration that received campaigns
  insert into public.sync_runs (workspace_id, integration_id, provider, triggered_by, status,
                                started_at, finished_at, campaigns_seen, campaigns_upserted, stats_written)
  select c.workspace_id, c.integration_id, c.provider, 'backfill', 'success', now(), now(),
         count(*), count(*), count(s.id)
  from public.campaigns_v2 c
  left join public.campaign_stats s on s.campaign_id = c.id
  where exists (select 1 from public.campaign_legacy_map m where m.campaign_id = c.id)
    and not exists (select 1 from public.sync_runs r2
                    where r2.integration_id = c.integration_id and r2.triggered_by = 'backfill')
  group by c.workspace_id, c.integration_id, c.provider;
end;
$fn$;

-- ── remarks: re-point campaign references at V2 ─────────────────────────────
-- (1) remarks on a migrated V1 row → its V2 campaign
update public.remarks r
   set legacy_campaign_id = r.campaign_id, campaign_id = m.campaign_id
  from public.campaign_legacy_map m
 where m.legacy_campaign_id = r.campaign_id
   and m.campaign_id <> r.campaign_id;
update public.remarks r
   set legacy_campaign_id = r.campaign_id
  from public.campaign_legacy_map m
 where m.legacy_campaign_id = r.campaign_id and r.legacy_campaign_id is null;

-- (2) remarks on a campaign that was not migrated → General timeline, original kept
update public.remarks r
   set legacy_campaign_id = r.campaign_id, campaign_id = null
 where r.campaign_id is not null
   and not exists (select 1 from public.campaigns_v2 c where c.id = r.campaign_id);

-- (3) the foreign key now targets V2; deleting a campaign never deletes remarks
do $fn$
declare
  r record;
begin
  -- drop whatever FK points remarks at the V1 table (name may differ on production)
  for r in
    select conname from pg_constraint
    where conrelid = 'public.remarks'::regclass and contype = 'f'
      and confrelid = 'public.campaigns'::regclass
  loop
    execute format('alter table public.remarks drop constraint %I', r.conname);
  end loop;

  if not exists (select 1 from pg_constraint where conname = 'remarks_campaign_id_v2_fkey') then
    alter table public.remarks
      add constraint remarks_campaign_id_v2_fkey
      foreign key (campaign_id) references public.campaigns_v2(id) on delete set null;
  end if;
end;
$fn$;

-- ── remark trigger: campaign must be attached to the remark's client ────────
-- A V1 campaign id (old clients, old portal links) is translated to its V2 id.
create or replace function public.set_remark_agency_id()
returns trigger
security definer set search_path = public
language plpgsql as $fn$
declare
  v_agency_id    uuid;
  v_workspace_id uuid;
  v_mapped       uuid;
begin
  select agency_id, workspace_id into v_agency_id, v_workspace_id
  from clients where id = new.client_id;
  if v_workspace_id is null then
    raise exception 'Unknown client' using errcode = '23503';
  end if;

  -- Never trust caller-supplied tenancy.
  new.workspace_id := v_workspace_id;
  new.agency_id := v_agency_id;

  if new.campaign_id is not null then
    if not exists (select 1 from campaigns_v2 where id = new.campaign_id) then
      select campaign_id into v_mapped from campaign_legacy_map where legacy_campaign_id = new.campaign_id;
      if v_mapped is not null then
        new.legacy_campaign_id := new.campaign_id;
        new.campaign_id := v_mapped;
      end if;
    end if;
    if not exists (
      select 1 from campaign_client_map where campaign_id = new.campaign_id and client_id = new.client_id
    ) then
      raise exception 'Campaign does not belong to client' using errcode = '23514';
    end if;
  end if;

  if new.attachment_url is not null and new.attachment_url !~
     '^https://[^/]+/storage/v1/object/public/remark-attachments/[0-9a-f-]{36}\.(pdf|png|jpg|docx)$' then
    raise exception 'Invalid attachment url' using errcode = '23514';
  end if;

  if new.attachment_name is not null and char_length(new.attachment_name) > 255 then
    raise exception 'Attachment name too long' using errcode = '23514';
  end if;

  return new;
end;
$fn$;

-- ── transition: mirror V1 campaign writes into V2 (dropped in phase 6) ──────
create or replace function public.v2_mirror_legacy_campaign()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  begin
    perform v2_import_legacy_campaign(new.id);
  exception when others then
    raise warning 'V2 mirror of V1 campaign % failed: %', new.id, sqlerrm;
  end;
  return null;
end;
$fn$;

revoke all on function public.v2_mirror_legacy_campaign() from public, anon, authenticated;

drop trigger if exists trg_v2_mirror_legacy_campaign on public.campaigns;
create trigger trg_v2_mirror_legacy_campaign
  after insert or update on public.campaigns
  for each row execute function public.v2_mirror_legacy_campaign();

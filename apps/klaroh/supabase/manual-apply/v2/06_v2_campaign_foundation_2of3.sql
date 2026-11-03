-- Klaroh V2 — SQL Editor part 06: 20261006000300_v2_campaign_foundation.sql, piece 2 of 3.
-- Run the files in this folder one at a time, in numeric order. Safe to re-run.
-- Generated from supabase/migrations/20261006000300_v2_campaign_foundation.sql; tests prove the result is identical.
set check_function_bodies = false;

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

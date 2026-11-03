-- Klaroh V2 — SQL Editor part 10: 20261006000400_v2_instantly_backfill.sql, piece 3 of 3.
-- Run the files in this folder one at a time, in numeric order. Safe to re-run.
-- Generated from supabase/migrations/20261006000400_v2_instantly_backfill.sql; tests prove the result is identical.
set check_function_bodies = false;

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

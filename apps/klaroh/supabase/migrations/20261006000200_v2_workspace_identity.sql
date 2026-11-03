-- ═══════════════════════════════════════════════════════════════════════════
-- 20261006000200_v2_workspace_identity.sql — V2 PHASE 2: workspace identity
--
-- Makes the workspace the real ownership model:
--   * ensure_workspace(): the signed-in user's workspace, created (with the
--     user as owner) on first use — replaces "auto-create agency_details";
--   * RLS on clients / integrations / remarks / V1 campaigns is now
--     "member of the row's workspace" instead of "owner of the agency";
--   * a remark's workspace is derived from its client (never caller supplied);
--   * agency_id is no longer required on new rows (V1 keeps its values);
--   * public portal branding comes from the workspace.
--
-- Non-destructive and idempotent. For migrated users nothing changes: their
-- workspace has the same id as their agency and they are its owner.
-- ═══════════════════════════════════════════════════════════════════════════

set check_function_bodies = false;

-- ── ensure_workspace ────────────────────────────────────────────────────────
create or replace function public.ensure_workspace(p_name text default null, p_website text default null)
returns uuid
language plpgsql security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Serialise per user so two concurrent first requests create one workspace.
  perform pg_advisory_xact_lock(hashtextextended('ensure_workspace:' || v_uid::text, 0));

  select m.workspace_id into v_id
  from workspace_members m
  where m.user_id = v_uid
  order by (m.role = 'owner') desc, m.created_at, m.workspace_id
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into workspaces (name, website, plan)
  values (nullif(btrim(left(p_name, 200)), ''), nullif(btrim(left(p_website, 500)), ''), 'trial')
  returning id into v_id;

  insert into workspace_members (workspace_id, user_id, role) values (v_id, v_uid, 'owner');
  return v_id;
end;
$fn$;

revoke all on function public.ensure_workspace(text, text) from public, anon;
grant execute on function public.ensure_workspace(text, text) to authenticated;

-- ── workspace_id is the owner column from now on ────────────────────────────
alter table public.clients      alter column agency_id drop not null;
alter table public.integrations alter column agency_id drop not null;
alter table public.remarks      alter column agency_id drop not null;

-- Fails loudly (changing nothing) if a row was somehow left without a workspace.
alter table public.clients      alter column workspace_id set not null;
alter table public.integrations alter column workspace_id set not null;
alter table public.remarks      alter column workspace_id set not null;

-- ── RLS: workspace membership ───────────────────────────────────────────────
drop policy if exists owner_all_clients on public.clients;
drop policy if exists workspace_member_all_clients on public.clients;
create policy workspace_member_all_clients on public.clients
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists owner_all_integrations on public.integrations;
drop policy if exists workspace_member_all_integrations on public.integrations;
create policy workspace_member_all_integrations on public.integrations
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists agency_read_remarks on public.remarks;
drop policy if exists agency_insert_remarks on public.remarks;
drop policy if exists workspace_member_read_remarks on public.remarks;
drop policy if exists workspace_member_insert_remarks on public.remarks;
create policy workspace_member_read_remarks on public.remarks
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy workspace_member_insert_remarks on public.remarks
  for insert to authenticated
  with check (author_type = 'agency' and public.is_workspace_member(workspace_id));

drop policy if exists owner_all_campaigns on public.campaigns;
drop policy if exists workspace_member_all_campaigns on public.campaigns;
create policy workspace_member_all_campaigns on public.campaigns
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ── remarks: tenancy derived from the client ────────────────────────────────
create or replace function public.set_remark_agency_id()
returns trigger
security definer set search_path = public
language plpgsql as $fn$
declare
  v_agency_id    uuid;
  v_workspace_id uuid;
begin
  select agency_id, workspace_id into v_agency_id, v_workspace_id
  from clients where id = new.client_id;
  if v_workspace_id is null then
    raise exception 'Unknown client' using errcode = '23503';
  end if;

  -- Never trust caller-supplied tenancy.
  new.workspace_id := v_workspace_id;
  new.agency_id := v_agency_id;

  if new.campaign_id is not null and not exists (
    select 1 from campaigns where id = new.campaign_id and client_id = new.client_id
  ) then
    raise exception 'Campaign does not belong to client' using errcode = '23514';
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

-- ── at most one Instantly integration per workspace ─────────────────────────
do $fn$
begin
  if exists (
    select 1 from public.integrations where provider = 'instantly'
    group by workspace_id having count(*) > 1
  ) then
    raise exception 'Duplicate Instantly integrations exist for a workspace. Resolve manually before applying this migration.';
  end if;
end;
$fn$;

create unique index if not exists uq_integrations_workspace_instantly
  on public.integrations (workspace_id)
  where provider = 'instantly';

alter table public.integrations alter column provider set not null;

-- ── public portal branding from the workspace (V1 campaign source unchanged) ─
create or replace function public.get_public_campaign_data(p_client_id uuid)
returns table (
  campaign_name text, tool text, emails_sent integer, open_rate numeric, reply_rate numeric,
  positive_reply_rate numeric, leads_generated integer, week_1_leads integer, week_2_leads integer,
  week_3_leads integer, week_4_leads integer, last_synced timestamptz, agency_name text,
  agency_logo_url text, external_name text, external_status integer, external_is_evergreen boolean,
  external_sender_count integer, external_daily_limit integer, external_pl_value numeric,
  external_start_date date, external_end_date date, external_created_at timestamptz,
  external_updated_at timestamptz, leads_count integer, contacted_count integer,
  emails_sent_count integer, new_leads_contacted_count integer, open_count integer,
  open_count_unique integer, reply_count integer, reply_count_unique integer,
  link_click_count integer, link_click_count_unique integer, bounced_count integer,
  unsubscribed_count integer, completed_count integer, total_opportunities integer,
  total_opportunity_value numeric, total_interested integer, total_meeting_booked integer,
  total_meeting_completed integer, total_closed integer
)
security definer set search_path = public
language sql stable as $fn$
  select
    camp.name, camp.tool, camp.emails_sent, camp.open_rate, camp.reply_rate,
    camp.positive_reply_rate, camp.leads_generated,
    camp.week_1_leads, camp.week_2_leads, camp.week_3_leads, camp.week_4_leads,
    camp.last_synced,
    w.name, w.logo_url,
    camp.external_name, camp.external_status, camp.external_is_evergreen,
    camp.external_sender_count, camp.external_daily_limit, camp.external_pl_value,
    camp.external_start_date, camp.external_end_date,
    camp.external_created_at, camp.external_updated_at,
    camp.leads_count, camp.contacted_count, camp.emails_sent_count,
    camp.new_leads_contacted_count, camp.open_count, camp.open_count_unique,
    camp.reply_count, camp.reply_count_unique, camp.link_click_count,
    camp.link_click_count_unique, camp.bounced_count, camp.unsubscribed_count,
    camp.completed_count, camp.total_opportunities, camp.total_opportunity_value,
    camp.total_interested, camp.total_meeting_booked, camp.total_meeting_completed,
    camp.total_closed
  from clients cl
  join workspaces w on w.id = cl.workspace_id
  left join lateral (
    select * from campaigns c
    where c.client_id = cl.id
    order by c.created_at desc
    limit 1
  ) camp on true
  where cl.id = p_client_id
    and cl.status = 'active';
$fn$;

grant execute on function public.get_public_campaign_data(uuid) to anon, authenticated;

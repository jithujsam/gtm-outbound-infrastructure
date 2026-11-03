-- Klaroh V2 — SQL Editor part 04: 20261006000200_v2_workspace_identity.sql, piece 2 of 2.
-- Run the files in this folder one at a time, in numeric order. Safe to re-run.
-- Generated from supabase/migrations/20261006000200_v2_workspace_identity.sql; tests prove the result is identical.
set check_function_bodies = false;

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

-- Klaroh security fix, part 3 of 4: public client page only shows active clients
-- Same SQL as supabase/migrations/20260101000100_security_hardening_v1.sql, split into
-- smaller pieces for the Supabase SQL Editor. Safe to run more than once. Deletes no data.
-- Public page functions stop exposing paused/ended clients and no longer error for a client with no campaigns.

-- ── 4. public reads: active clients only ────────────────────────────────────
-- Refuses to run once Klaroh V2 is installed: this V1 file would undo V2 changes.
do $guard$ begin
  if to_regclass('public.campaigns_v2') is not null then
    raise exception 'Klaroh V2 is installed: do not run this V1 file again (it would undo V2 changes). Nothing was changed.';
  end if;
end $guard$;

create or replace function public.get_public_remarks(
  p_client_id   uuid,
  p_campaign_id uuid default null
)
returns table (
  id              uuid,
  agency_id       uuid,
  client_id       uuid,
  campaign_id     uuid,
  author_type     text,
  category        text,
  title           text,
  body            text,
  attachment_url  text,
  attachment_name text,
  created_at      timestamptz
)
security definer set search_path = public
language sql stable as $fn$
  select r.id, r.agency_id, r.client_id, r.campaign_id, r.author_type, r.category, r.title,
         r.body, r.attachment_url, r.attachment_name, r.created_at
  from remarks r
  join clients cl on cl.id = r.client_id and cl.status = 'active'
  where r.client_id = p_client_id
    and (
      (p_campaign_id is null and r.campaign_id is null)
      or (p_campaign_id is not null and r.campaign_id = p_campaign_id)
    )
  order by r.created_at desc;
$fn$;

create or replace function public.get_public_campaigns(p_client_id uuid)
returns table (id uuid, name text)
security definer set search_path = public
language sql stable as $fn$
  select c.id, c.name
  from campaigns c
  join clients cl on cl.id = c.client_id and cl.status = 'active'
  where c.client_id = p_client_id
  order by c.created_at desc;
$fn$;

-- The portal shows an "inactive" notice for non-active clients, so the row is
-- still returned (status is needed) but the client name is withheld.
create or replace function public.get_public_client_by_slug(p_slug text)
returns table (
  id uuid, name text, slug text, status text,
  created_at timestamptz,
  sending_capacity integer,
  active_inboxes integer,
  domain_health_score integer,
  domain_health_status text
)
security definer set search_path = public
language sql stable as $fn$
  select cl.id,
         case when cl.status = 'active' then cl.name else ''::text end,
         cl.slug, cl.status, cl.created_at,
         case when cl.status = 'active' then cl.sending_capacity end,
         case when cl.status = 'active' then cl.active_inboxes end,
         case when cl.status = 'active' then cl.domain_health_score end,
         case when cl.status = 'active' then cl.domain_health_status end
  from clients cl
  where cl.slug = p_slug
  limit 1;
$fn$;

-- ── 4 + 5. get_public_campaign_data: active only, one row even with no campaign ─
create or replace function public.get_public_campaign_data(p_client_id uuid)
returns table (
  campaign_name        text,
  tool                 text,
  emails_sent          integer,
  open_rate            numeric,
  reply_rate           numeric,
  positive_reply_rate  numeric,
  leads_generated      integer,
  week_1_leads         integer,
  week_2_leads         integer,
  week_3_leads         integer,
  week_4_leads         integer,
  last_synced          timestamptz,
  agency_name          text,
  agency_logo_url      text,
  external_name        text,
  external_status      integer,
  external_is_evergreen boolean,
  external_sender_count integer,
  external_daily_limit  integer,
  external_pl_value      numeric,
  external_start_date    date,
  external_end_date      date,
  external_created_at    timestamptz,
  external_updated_at    timestamptz,
  leads_count            integer,
  contacted_count        integer,
  emails_sent_count      integer,
  new_leads_contacted_count integer,
  open_count             integer,
  open_count_unique      integer,
  reply_count            integer,
  reply_count_unique     integer,
  link_click_count       integer,
  link_click_count_unique integer,
  bounced_count          integer,
  unsubscribed_count     integer,
  completed_count        integer,
  total_opportunities    integer,
  total_opportunity_value numeric,
  total_interested       integer,
  total_meeting_booked   integer,
  total_meeting_completed integer,
  total_closed           integer
)
security definer set search_path = public
language sql stable as $fn$
  select
    camp.name, camp.tool, camp.emails_sent, camp.open_rate, camp.reply_rate,
    camp.positive_reply_rate, camp.leads_generated,
    camp.week_1_leads, camp.week_2_leads, camp.week_3_leads, camp.week_4_leads,
    camp.last_synced,
    ad.agency_name, ad.agency_logo_url,
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
  join agency_details ad on ad.id = cl.agency_id
  left join lateral (
    select * from campaigns c
    where c.client_id = cl.id
    order by c.created_at desc
    limit 1
  ) camp on true
  where cl.id = p_client_id
    and cl.status = 'active';
$fn$;

grant execute on function public.get_public_remarks(uuid, uuid) to anon, authenticated;
grant execute on function public.get_public_campaigns(uuid) to anon, authenticated;
grant execute on function public.get_public_client_by_slug(text) to anon, authenticated;
grant execute on function public.get_public_campaign_data(uuid) to anon, authenticated;

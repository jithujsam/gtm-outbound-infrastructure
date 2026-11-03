-- ═══════════════════════════════════════════════════════════════════════════
-- 20260101000100_security_hardening_v1.sql
--
-- Forward, non-destructive security fixes on top of the V1 baseline. Safe to
-- run on the production database (no table/column/data is dropped; every
-- statement is idempotent). Each item below was reproduced against the real
-- schema before being fixed — see supabase/tests/security.test.sql.
--
--  1. remarks tenancy: agency_id is derived from client_id (never caller
--     supplied) and campaign_id must belong to that client. Previously an
--     anonymous caller OR any signed-in agency could write a remark into
--     another tenant's client.
--  2. remarks attachment_url must be a Klaroh storage URL.
--  3. anonymous remark inserts go through post_public_remark() only; direct
--     anon INSERT is removed. (The old anon INSERT policy + `.insert().select()`
--     in the API route could not even succeed: anon has no SELECT policy.)
--  4. public read RPCs return nothing for non-active clients, so a UUID alone
--     no longer exposes a paused/ended client's remarks, campaigns or metrics.
--  5. get_public_campaign_data no longer raises a type error for a client that
--     has no campaigns (which silently dropped agency branding on /c/[slug]).
--  6. plan / created_at on agency_details can no longer be changed by the
--     signed-in user (self-service upgrade / trial reset).
--  7. at most one Instantly integration per agency.
-- ═══════════════════════════════════════════════════════════════════════════

set check_function_bodies = false;

-- ── 1 + 2. remarks: derive tenancy, validate campaign + attachment ───────────
create or replace function public.set_remark_agency_id()
returns trigger
security definer set search_path = public
language plpgsql as $fn$
declare
  v_agency_id uuid;
begin
  select agency_id into v_agency_id from clients where id = new.client_id;
  if v_agency_id is null then
    raise exception 'Unknown client' using errcode = '23503';
  end if;

  -- Never trust a caller-supplied agency_id.
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

-- ── 3. anonymous (client portal) remarks: RPC only ──────────────────────────
drop policy if exists "public_insert_client_remarks" on public.remarks;
revoke insert on public.remarks from anon;

create or replace function public.post_public_remark(
  p_client_id       uuid,
  p_campaign_id     uuid,
  p_category        text,
  p_title           text,
  p_body            text,
  p_attachment_url  text default null,
  p_attachment_name text default null
)
returns public.remarks
security definer set search_path = public
language plpgsql as $fn$
declare
  v_row public.remarks;
begin
  -- Same error for "unknown" and "not active" so ids cannot be probed.
  if not exists (select 1 from clients c where c.id = p_client_id and c.status = 'active') then
    raise exception 'Client not available' using errcode = '42501';
  end if;

  if p_category is null or p_category not in (
    'Weekly Review', 'Campaign Update', 'Lead Report', 'Strategy Change',
    'Issue Flagged', 'Client Request', 'General'
  ) then
    raise exception 'Invalid category' using errcode = '22023';
  end if;

  if p_title is null or char_length(btrim(p_title)) = 0 or char_length(p_title) > 200 then
    raise exception 'Invalid title' using errcode = '22023';
  end if;

  if p_body is null or char_length(btrim(p_body)) = 0 or char_length(p_body) > 10000 then
    raise exception 'Invalid body' using errcode = '22023';
  end if;

  -- agency_id is derived and campaign/attachment validated by the trigger.
  insert into remarks (client_id, campaign_id, author_type, category, title, body,
                       attachment_url, attachment_name)
  values (p_client_id, p_campaign_id, 'client', p_category, btrim(p_title), btrim(p_body),
          p_attachment_url, p_attachment_name)
  returning * into v_row;

  return v_row;
end;
$fn$;

revoke all on function public.post_public_remark(uuid, uuid, text, text, text, text, text) from public;
grant execute on function public.post_public_remark(uuid, uuid, text, text, text, text, text)
  to anon, authenticated;

-- ── 4. public reads: active clients only ────────────────────────────────────
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

-- ── 6. agency_details: plan and created_at are not user-editable ─────────────
-- `current_user` is the invoking role: 'authenticated'/'anon' for requests made
-- with a user/anon JWT; service_role and the dashboard/postgres bypass this.
create or replace function public.protect_agency_billing_fields()
returns trigger
language plpgsql as $fn$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.plan := 'trial';
      new.created_at := now();
    else
      new.plan := old.plan;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists protect_agency_billing_fields on public.agency_details;
create trigger protect_agency_billing_fields
  before insert or update on public.agency_details
  for each row execute function public.protect_agency_billing_fields();

-- ── 7. at most one Instantly integration per agency ─────────────────────────
do $fn$
begin
  if exists (
    select 1 from public.integrations
    where tool = 'instantly'
    group by agency_id
    having count(*) > 1
  ) then
    raise exception
      'Duplicate Instantly integrations exist for an agency. Resolve manually (see supabase/README.md) before applying this migration.';
  end if;
end;
$fn$;

create unique index if not exists uq_integrations_agency_instantly
  on public.integrations (agency_id)
  where tool = 'instantly';

-- ── 8. REMOVE blanket public read policies found on production ──────────────
-- A fingerprint of the live database showed `clients_public` and
-- `campaigns_public` (SELECT ... USING (true)) still present: they let anyone
-- holding the public anon key read EVERY agency's clients (names, slugs,
-- client_email) and campaigns. Nothing in the app needs them — the public
-- portal reads through the SECURITY DEFINER functions above. The older names
-- from the legacy files are dropped too, in case they exist.
drop policy if exists "clients_public"           on public.clients;
drop policy if exists "campaigns_public"         on public.campaigns;
drop policy if exists "public_read_client_slug"  on public.clients;
drop policy if exists "public_read_campaigns"    on public.campaigns;
drop policy if exists "public_read_remarks"      on public.remarks;

-- ── 9. get_campaign_data(): dead, and SECURITY DEFINER on production ─────────
-- Production has it as SECURITY DEFINER and callable by anon, so anyone could
-- fetch a client's campaign metrics by UUID, bypassing RLS and the active check.
-- The application no longer calls it. Revoke instead of drop (reversible).
do $fn$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_campaign_data'
      and pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_client_id uuid'
  ) then
    revoke all on function public.get_campaign_data(uuid, uuid) from public, anon, authenticated;
  end if;
end;
$fn$;

-- ── 10. clients.status must allow what the app writes ────────────────────────
-- Production only allowed ('active','inactive'), so the Pause toggle (which
-- writes 'paused') failed. Widen to a superset: existing rows stay valid, and
-- every non-'active' value is treated as inactive by the portal and the RPCs.
do $fn$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.clients'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.clients drop constraint %I', r.conname);
  end loop;
end;
$fn$;

alter table public.clients
  add constraint clients_status_check
  check (status in ('active', 'paused', 'ended', 'inactive'));

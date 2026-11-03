-- Klaroh — SQL Editor part 17: 20261008000300_client_portal.sql, piece 1 of 1.
-- Run the files in this folder one at a time, in numeric order. Safe to re-run.
-- Generated from supabase/migrations/20261008000300_client_portal.sql; tests prove the result is identical.

-- ═══════════════════════════════════════════════════════════════════════════
-- 20261008000300_client_portal.sql — secure client portal + campaign economics
--
--   client_portals       one per client: the portal's random, revocable access
--                        token and what the client sees (view, KPI cards and
--                        their order, campaigns in the report, sections)
--   campaign_economics   per client × campaign: commercial figures the agency
--                        enters (currency, cost, value per positive response).
--                        Never read from the sending platform.
--   get_client_portal()  the ONLY public read: resolves a token to one client's
--                        report (campaign figures, history, infrastructure
--                        status, economics, branding)
--
-- Security: the client slug is no longer an authorization. The slug/id based
-- public functions and the public remark functions are revoked from the API
-- roles (they stay defined; nothing is dropped and no data is deleted).
-- Every existing client gets a portal (token) here; new clients get one on
-- insert. Additive and idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

set check_function_bodies = false;

create or replace function public.new_portal_token()
returns text
language sql volatile set search_path = public as $fn$
  -- 64 hex characters from two random (v4) UUIDs: 244 random bits.
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$fn$;

-- ── tables ──────────────────────────────────────────────────────────────────
create table if not exists public.client_portals (
  client_id           uuid primary key references public.clients(id) on delete cascade,
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  access_token        text not null default public.new_portal_token()
                      constraint client_portals_access_token_key unique
                      check (access_token ~ '^[0-9a-f]{64}$'),
  token_created_at    timestamptz not null default now(),
  -- the view the client opens on: 'simple' (at a glance) or 'advanced' (detailed report)
  mode                text not null default 'advanced' check (mode in ('simple', 'advanced')),
  -- KPI cards in display order (keys of src/lib/analytics/portal.ts)
  metrics             text[] not null
                      default array['emailsSent', 'prospectsContacted', 'humanReplies', 'positive', 'replyRate']
                      check (metrics <@ array['emailsSent', 'prospectsContacted', 'humanReplies', 'positive',
                                              'replyRate', 'positiveRate', 'bounces']
                             and cardinality(metrics) <= 7),
  -- campaigns in the report; null = every campaign of the client (also future ones)
  campaign_ids        uuid[],
  show_infrastructure boolean not null default true,
  show_economics      boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_client_portals_workspace_id on public.client_portals (workspace_id);

create table if not exists public.campaign_economics (
  campaign_id        uuid not null,
  client_id          uuid not null,
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  -- ISO 4217 code, always explicit; amounts are never converted
  currency           text not null check (currency ~ '^[A-Z]{3}$'),
  -- total the client pays for this campaign
  cost               numeric(14,2) check (cost is null or cost >= 0),
  -- the agency's estimate of what one positive response is worth to the client
  value_per_positive numeric(14,2) check (value_per_positive is null or value_per_positive >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (campaign_id, client_id),
  constraint campaign_economics_link_fkey foreign key (campaign_id, client_id)
    references public.campaign_client_map (campaign_id, client_id) on delete cascade
);
create index if not exists idx_campaign_economics_client_id on public.campaign_economics (client_id);
create index if not exists idx_campaign_economics_workspace_id on public.campaign_economics (workspace_id);

-- ── integrity: tenancy derived, settings normalised ─────────────────────────
create or replace function public.client_portals_guard()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  select workspace_id into new.workspace_id from clients where id = new.client_id;
  if new.workspace_id is null then
    raise exception 'Unknown client' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' then
    new.client_id := old.client_id;
    new.created_at := old.created_at;
  end if;
  -- no duplicate cards; campaign list without duplicates or nulls
  if cardinality(new.metrics) <> (select count(distinct m) from unnest(new.metrics) m where m is not null) then
    raise exception 'Duplicate or empty metric' using errcode = '22023';
  end if;
  if new.campaign_ids is not null then
    new.campaign_ids := array(select distinct c from unnest(new.campaign_ids) c where c is not null);
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_client_portals_guard on public.client_portals;
create trigger trg_client_portals_guard before insert or update on public.client_portals
  for each row execute function public.client_portals_guard();
drop trigger if exists update_client_portals_updated_at on public.client_portals;
create trigger update_client_portals_updated_at before update on public.client_portals
  for each row execute function public.update_updated_at();

create or replace function public.campaign_economics_guard()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  select workspace_id into new.workspace_id
  from campaign_client_map where campaign_id = new.campaign_id and client_id = new.client_id;
  if new.workspace_id is null then
    raise exception 'Campaign is not used by this client' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' then
    new.campaign_id := old.campaign_id;
    new.client_id := old.client_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_campaign_economics_guard on public.campaign_economics;
create trigger trg_campaign_economics_guard before insert or update on public.campaign_economics
  for each row execute function public.campaign_economics_guard();
drop trigger if exists update_campaign_economics_updated_at on public.campaign_economics;
create trigger update_campaign_economics_updated_at before update on public.campaign_economics
  for each row execute function public.update_updated_at();

-- every client has a portal: new clients on insert, existing ones now
create or replace function public.create_client_portal()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  insert into client_portals (client_id, workspace_id) values (new.id, new.workspace_id)
  on conflict (client_id) do nothing;
  return new;
end;
$fn$;

drop trigger if exists trg_create_client_portal on public.clients;
create trigger trg_create_client_portal after insert on public.clients
  for each row execute function public.create_client_portal();

insert into public.client_portals (client_id, workspace_id)
select id, workspace_id from public.clients where workspace_id is not null
on conflict (client_id) do nothing;

revoke all on function public.client_portals_guard() from public, anon, authenticated;
revoke all on function public.campaign_economics_guard() from public, anon, authenticated;
revoke all on function public.create_client_portal() from public, anon, authenticated;
revoke all on function public.new_portal_token() from public, anon, authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.client_portals     enable row level security;
alter table public.campaign_economics enable row level security;

drop policy if exists client_portals_member_select on public.client_portals;
create policy client_portals_member_select on public.client_portals
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists client_portals_member_update on public.client_portals;
create policy client_portals_member_update on public.client_portals
  for update to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

-- Portals are created by the database and the token changes only through
-- rotate_client_portal_token(): members may update the settings columns only.
revoke all on public.client_portals from anon, authenticated;
grant select on public.client_portals to authenticated;
grant update (mode, metrics, campaign_ids, show_infrastructure, show_economics) on public.client_portals to authenticated;

do $fn$
declare
  op text;
begin
  foreach op in array array['select', 'insert', 'update', 'delete'] loop
    execute format('drop policy if exists %I on public.campaign_economics', 'campaign_economics_member_' || op);
    if op = 'insert' then
      execute 'create policy campaign_economics_member_insert on public.campaign_economics for insert to authenticated with check (public.is_workspace_member(workspace_id))';
    elsif op = 'update' then
      execute 'create policy campaign_economics_member_update on public.campaign_economics for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id))';
    else
      execute format('create policy %I on public.campaign_economics for %s to authenticated using (public.is_workspace_member(workspace_id))',
                     'campaign_economics_member_' || op, op);
    end if;
  end loop;
end;
$fn$;
revoke all on public.campaign_economics from anon;
revoke truncate on public.campaign_economics from authenticated;

-- ── revoking a link: a new token, the old one stops working at once ─────────
create or replace function public.rotate_client_portal_token(p_client_id uuid)
returns text
language plpgsql security definer set search_path = public as $fn$
declare
  v_token text;
begin
  update client_portals p
     set access_token = new_portal_token(), token_created_at = now()
   where p.client_id = p_client_id and is_workspace_member(p.workspace_id)
  returning p.access_token into v_token;
  if v_token is null then
    raise exception 'Client not found' using errcode = '42501';
  end if;
  return v_token;
end;
$fn$;
revoke all on function public.rotate_client_portal_token(uuid) from public, anon;
grant execute on function public.rotate_client_portal_token(uuid) to authenticated;

-- ── the public read: one token → one client's report ───────────────────────
-- Exposes no workspace, integration or provider ids, no mailbox addresses or
-- domain names, no provider payloads, and only the statistics columns the
-- shared metric layer uses.
create or replace function public.get_client_portal(p_token text)
returns jsonb
security definer set search_path = public
language plpgsql stable as $fn$
declare
  v_portal client_portals;
  v_client clients;
  v_campaigns uuid[];
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into v_portal from client_portals where access_token = p_token;
  if not found then
    return null;
  end if;
  select * into v_client from clients where id = v_portal.client_id;
  if v_client.status is distinct from 'active' then
    -- the page says the report is inactive; nothing else is returned
    return jsonb_build_object('status', coalesce(v_client.status, 'ended'), 'slug', v_client.slug);
  end if;

  select coalesce(array_agg(c.id), '{}') into v_campaigns
  from campaign_client_map m
  join campaigns_v2 c on c.id = m.campaign_id and c.archived_at is null
  where m.client_id = v_client.id
    and (v_portal.campaign_ids is null or c.id = any (v_portal.campaign_ids));

  return jsonb_build_object(
    'status', v_client.status,
    'slug', v_client.slug,
    'client_name', v_client.name,
    'branding', (
      select jsonb_build_object('agency_name', w.name, 'agency_logo_url', w.logo_url)
      from workspaces w where w.id = v_client.workspace_id),
    'settings', jsonb_build_object(
      'mode', v_portal.mode,
      'metrics', to_jsonb(v_portal.metrics),
      'all_campaigns', v_portal.campaign_ids is null,
      'show_infrastructure', v_portal.show_infrastructure,
      'show_economics', v_portal.show_economics),
    'total_campaigns', (
      select count(*) from campaign_client_map m
      join campaigns_v2 c on c.id = m.campaign_id and c.archived_at is null
      where m.client_id = v_client.id),
    'campaigns', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'name', c.name, 'status', c.status,
               'start_date', c.start_date, 'end_date', c.end_date,
               'external_created_at', c.external_created_at, 'last_synced_at', c.last_synced_at,
               'unavailable_since', c.unavailable_since,
               'captured_at', s.captured_at,
               'emails_sent', s.emails_sent, 'new_leads_contacted', s.new_leads_contacted,
               'replies_unique', s.replies_unique, 'opportunities', s.opportunities, 'bounces', s.bounces,
               'economics', case when v_portal.show_economics and e.campaign_id is not null then
                 jsonb_build_object('currency', e.currency, 'cost', e.cost, 'value_per_positive', e.value_per_positive) end)
             order by c.name, c.id)
      from campaigns_v2 c
      left join lateral (
        select st.captured_at, st.emails_sent, st.new_leads_contacted, st.replies_unique, st.opportunities, st.bounces
        from campaign_stats st where st.campaign_id = c.id
        order by st.stat_date desc, st.captured_at desc limit 1
      ) s on true
      left join campaign_economics e on e.campaign_id = c.id and e.client_id = v_client.id
      where c.id = any (v_campaigns)), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'campaign_id', st.campaign_id, 'stat_date', st.stat_date,
               'emails_sent', st.emails_sent, 'new_leads_contacted', st.new_leads_contacted,
               'replies_unique', st.replies_unique, 'opportunities', st.opportunities, 'bounces', st.bounces)
             order by st.stat_date, st.campaign_id)
      from campaign_stats st
      where st.campaign_id = any (v_campaigns) and st.stat_date >= current_date - 365), '[]'::jsonb),
    'infrastructure', case when v_portal.show_infrastructure then coalesce((
      select jsonb_agg(jsonb_build_object(
               'account', a.n, 'domain', a.domain_n,
               'status', a.status, 'warmup_status', a.warmup_status, 'warmup_score', a.warmup_score,
               'daily_limit', a.daily_limit, 'last_synced_at', a.last_synced_at,
               'spf', d.spf, 'dkim', d.dkim, 'dmarc', d.dmarc, 'mx', d.mx, 'checked_at', d.checked_at))
      from (
        select ea.*, row_number() over (order by ea.id) as n,
               dense_rank() over (order by split_part(ea.email, '@', 2)) as domain_n
        from email_accounts ea
        where ea.unavailable_since is null
          and exists (
            select 1 from campaigns_v2 c
            where c.id = any (v_campaigns) and c.integration_id = ea.integration_id
              and ea.email = any (select lower(x) from unnest(c.sender_emails) x))
      ) a
      left join email_domains d on d.integration_id = a.integration_id and d.domain = split_part(a.email, '@', 2)
    ), '[]'::jsonb) end
  );
end;
$fn$;
revoke all on function public.get_client_portal(text) from public;
grant execute on function public.get_client_portal(text) to anon, authenticated;

-- ── the slug is no longer an authorization ──────────────────────────────────
-- The previous portal resolved a guessable slug to the client id and read
-- everything by id. Those functions (and the public remark functions — the
-- portal no longer has remarks) are no longer callable through the API.
do $fn$
declare
  f text;
begin
  foreach f in array array[
    'public.get_public_client_by_slug(text)',
    'public.get_public_campaigns(uuid)',
    'public.get_public_client_campaigns(uuid)',
    'public.get_public_workspace_branding(uuid)',
    'public.get_public_remarks(uuid, uuid)',
    'public.post_public_remark(uuid, uuid, text, text, text, text, text)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', f);
    end if;
  end loop;
end;
$fn$;

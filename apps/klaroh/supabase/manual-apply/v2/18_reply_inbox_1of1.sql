-- Klaroh — SQL Editor part 18: 20261008000400_reply_inbox.sql, piece 1 of 1.
-- Run the files in this folder one at a time, in numeric order. Safe to re-run.
-- Generated from supabase/migrations/20261008000400_reply_inbox.sql; tests prove the result is identical.

-- ═══════════════════════════════════════════════════════════════════════════
-- 20261008000400_reply_inbox.sql — prospect replies (Inbox) + client view
--
-- The conversations that matter: prospects' replies to client-linked
-- campaigns, grouped by thread. Received messages only (prospect → campaign);
-- the agency's own outbound emails are not stored.
--
--   reply_threads      one per provider thread (dedup: integration + thread id):
--                      prospect, campaign, the lead's interest status as marked
--                      at the provider, and aggregates kept by trigger
--   reply_messages     one per received message (dedup: integration + message id),
--                      auto-replies flagged, never counted as human replies
--   reply_sync_runs    the reply sync's own run log (separate from sync_runs, so
--                      campaign sync status is untouched); at most one running
--                      run per integration (unique index)
--   reply_sync_state   per integration: the time window being fetched and the
--                      provider cursor, so a sync stopped by the provider's rate
--                      limit continues where it stopped
--   client_portals.show_conversations
--   get_client_portal_conversations(token)
--                      the client's positive conversations, token-authorized
--
-- Tenancy is derived server-side, workspace-member RLS, no user deletes, no
-- anon access. Additive and idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

set check_function_bodies = false;

-- ── tables ──────────────────────────────────────────────────────────────────
create table if not exists public.reply_threads (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  integration_id      uuid not null references public.integrations(id),
  campaign_id         uuid not null references public.campaigns_v2(id) on delete cascade,
  provider_thread_id  text not null check (length(provider_thread_id) between 1 and 200),
  lead_external_id    text,
  lead_email          text,
  lead_name           text,
  lead_company        text,
  -- the lead's interest status at the provider (null = none set)
  interest            text check (interest in ('interested', 'meeting_booked', 'meeting_completed', 'won',
                                               'out_of_office', 'not_interested', 'wrong_person', 'lost')),
  interest_checked_at timestamptz,
  subject             text,
  -- kept by trigger from reply_messages
  human_replies       integer not null default 0,
  auto_replies        integer not null default 0,
  first_reply_at      timestamptz,
  last_reply_at       timestamptz,
  last_human_reply_at timestamptz,
  last_snippet        text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint reply_threads_integration_thread_key unique (integration_id, provider_thread_id)
);
create index if not exists idx_reply_threads_workspace_last on public.reply_threads (workspace_id, last_human_reply_at desc);
create index if not exists idx_reply_threads_campaign on public.reply_threads (campaign_id);

create table if not exists public.reply_messages (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  integration_id      uuid not null references public.integrations(id),
  thread_id           uuid not null references public.reply_threads(id) on delete cascade,
  provider_message_id text not null check (length(provider_message_id) between 1 and 200),
  direction           text not null default 'received' check (direction in ('received', 'sent')),
  is_auto_reply       boolean not null default false,
  sent_at             timestamptz not null,
  from_email          text,
  from_name           text,
  to_email            text,
  subject             text,
  -- readable text: quoted history removed, bounded
  body                text check (body is null or length(body) <= 20000),
  step                integer,
  synced_at           timestamptz not null default now(),
  constraint reply_messages_integration_message_key unique (integration_id, provider_message_id)
);
create index if not exists idx_reply_messages_thread on public.reply_messages (thread_id, sent_at);
create index if not exists idx_reply_messages_workspace on public.reply_messages (workspace_id);

create table if not exists public.reply_sync_runs (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  integration_id  uuid not null references public.integrations(id) on delete cascade,
  triggered_by    text not null check (triggered_by in ('manual', 'cron')),
  status          text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  messages_seen   integer not null default 0,
  messages_stored integer not null default 0,
  threads_updated integer not null default 0,
  error_message   text,
  details         jsonb
);
create index if not exists idx_reply_sync_runs_integration on public.reply_sync_runs (integration_id, started_at desc);
create index if not exists idx_reply_sync_runs_workspace on public.reply_sync_runs (workspace_id);
-- one reply sync per integration at a time, across every server instance
create unique index if not exists reply_sync_runs_one_running on public.reply_sync_runs (integration_id) where status = 'running';

create table if not exists public.reply_sync_state (
  integration_id   uuid primary key references public.integrations(id) on delete cascade,
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  -- messages created at or after this time are being fetched
  window_start     timestamptz,
  -- provider page cursor inside that window (null = from the first page)
  cursor           text,
  -- when fetching of the current window began; becomes synced_through once it completes
  window_opened_at timestamptz,
  -- every message created before this time has been fetched
  synced_through   timestamptz,
  updated_at       timestamptz not null default now()
);

-- ── integrity: tenancy derived, never trusted ──────────────────────────────
create or replace function public.reply_threads_guard()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  select workspace_id, integration_id into new.workspace_id, new.integration_id
  from campaigns_v2 where id = new.campaign_id;
  if new.workspace_id is null then
    raise exception 'Unknown campaign' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' then
    new.provider_thread_id := old.provider_thread_id;
    new.created_at := old.created_at;
    -- aggregates belong to the messages trigger
    if current_setting('klaroh.reply_aggregate', true) is distinct from 'on' then
      new.human_replies := old.human_replies;
      new.auto_replies := old.auto_replies;
      new.first_reply_at := old.first_reply_at;
      new.last_reply_at := old.last_reply_at;
      new.last_human_reply_at := old.last_human_reply_at;
      new.last_snippet := old.last_snippet;
    end if;
  else
    new.human_replies := 0;
    new.auto_replies := 0;
    new.first_reply_at := null;
    new.last_reply_at := null;
    new.last_human_reply_at := null;
    new.last_snippet := null;
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists trg_reply_threads_guard on public.reply_threads;
create trigger trg_reply_threads_guard before insert or update on public.reply_threads
  for each row execute function public.reply_threads_guard();

create or replace function public.reply_messages_guard()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  select workspace_id, integration_id into new.workspace_id, new.integration_id
  from reply_threads where id = new.thread_id;
  if new.workspace_id is null then
    raise exception 'Unknown thread' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' then
    new.provider_message_id := old.provider_message_id;
    new.thread_id := old.thread_id;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_reply_messages_guard on public.reply_messages;
create trigger trg_reply_messages_guard before insert or update on public.reply_messages
  for each row execute function public.reply_messages_guard();

-- thread aggregates: always recomputed from the stored messages (idempotent)
create or replace function public.reply_thread_aggregate()
returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_thread uuid := coalesce(new.thread_id, old.thread_id);
begin
  perform set_config('klaroh.reply_aggregate', 'on', true);
  update reply_threads t set
    human_replies = a.human, auto_replies = a.auto,
    first_reply_at = a.first_at, last_reply_at = a.last_at, last_human_reply_at = a.last_human_at,
    last_snippet = coalesce(
      (select left(regexp_replace(m.body, '\s+', ' ', 'g'), 280) from reply_messages m
        where m.thread_id = v_thread and m.direction = 'received' and not m.is_auto_reply
        order by m.sent_at desc limit 1),
      (select left(regexp_replace(m.body, '\s+', ' ', 'g'), 280) from reply_messages m
        where m.thread_id = v_thread order by m.sent_at desc limit 1))
  from (
    select count(*) filter (where direction = 'received' and not is_auto_reply) as human,
           count(*) filter (where direction = 'received' and is_auto_reply) as auto,
           min(sent_at) filter (where direction = 'received') as first_at,
           max(sent_at) filter (where direction = 'received') as last_at,
           max(sent_at) filter (where direction = 'received' and not is_auto_reply) as last_human_at
    from reply_messages where thread_id = v_thread
  ) a
  where t.id = v_thread;
  perform set_config('klaroh.reply_aggregate', 'off', true);
  return null;
end;
$fn$;

drop trigger if exists trg_reply_thread_aggregate on public.reply_messages;
create trigger trg_reply_thread_aggregate after insert or update on public.reply_messages
  for each row execute function public.reply_thread_aggregate();

create or replace function public.integration_scoped_guard()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  select workspace_id into new.workspace_id from integrations where id = new.integration_id;
  if new.workspace_id is null then
    raise exception 'Unknown integration' using errcode = '23503';
  end if;
  if tg_table_name = 'reply_sync_state' then
    new.updated_at := now();
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_reply_sync_runs_guard on public.reply_sync_runs;
create trigger trg_reply_sync_runs_guard before insert or update on public.reply_sync_runs
  for each row execute function public.integration_scoped_guard();
drop trigger if exists trg_reply_sync_state_guard on public.reply_sync_state;
create trigger trg_reply_sync_state_guard before insert or update on public.reply_sync_state
  for each row execute function public.integration_scoped_guard();

revoke all on function public.reply_threads_guard() from public, anon, authenticated;
revoke all on function public.reply_messages_guard() from public, anon, authenticated;
revoke all on function public.reply_thread_aggregate() from public, anon, authenticated;
revoke all on function public.integration_scoped_guard() from public, anon, authenticated;

-- ── RLS: workspace members; history is not deletable by users ──────────────
alter table public.reply_threads    enable row level security;
alter table public.reply_messages   enable row level security;
alter table public.reply_sync_runs  enable row level security;
alter table public.reply_sync_state enable row level security;

do $fn$
declare
  t text;
begin
  foreach t in array array['reply_threads', 'reply_messages', 'reply_sync_runs', 'reply_sync_state'] loop
    execute format('drop policy if exists %I on public.%I', t || '_member_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_member_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_member_update', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_workspace_member(workspace_id))',
                   t || '_member_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_workspace_member(workspace_id))',
                   t || '_member_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id))',
                   t || '_member_update', t);
    -- prospects' messages never reach the public API roles directly
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate on public.%I from authenticated', t);
  end loop;
end;
$fn$;

-- ── client portal: the conversations section ───────────────────────────────
alter table public.client_portals add column if not exists show_conversations boolean not null default true;
grant update (show_conversations) on public.client_portals to authenticated;

-- get_client_portal(): unchanged except that its settings carry show_conversations.
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
      'show_economics', v_portal.show_economics,
      'show_conversations', v_portal.show_conversations),
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


-- The client's conversations with interested prospects: positive threads
-- (the same lead statuses the "positive" metric counts) of the campaigns in
-- the client's report, with the prospect's own (non-automatic) replies.
-- No internal ids, no provider ids, no mailbox addresses of the agency.
create or replace function public.get_client_portal_conversations(p_token text)
returns jsonb
security definer set search_path = public
language plpgsql stable as $fn$
declare
  v_portal client_portals;
  v_client clients;
  v_campaigns uuid[];
  v_integrations uuid[];
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into v_portal from client_portals where access_token = p_token;
  if not found then
    return null;
  end if;
  select * into v_client from clients where id = v_portal.client_id;
  if v_client.status is distinct from 'active' or not v_portal.show_conversations then
    return jsonb_build_object('enabled', false);
  end if;

  select coalesce(array_agg(c.id), '{}'), coalesce(array_agg(distinct c.integration_id), '{}')
    into v_campaigns, v_integrations
  from campaign_client_map m
  join campaigns_v2 c on c.id = m.campaign_id and c.archived_at is null
  where m.client_id = v_client.id
    and (v_portal.campaign_ids is null or c.id = any (v_portal.campaign_ids));

  return jsonb_build_object(
    'enabled', true,
    'last_synced_at', (
      select max(coalesce(r.finished_at, r.started_at)) from reply_sync_runs r
      where r.integration_id = any (v_integrations) and r.status = 'success'),
    'last_sync_failed', coalesce((
      select r.status in ('failed', 'partial') from reply_sync_runs r
      where r.integration_id = any (v_integrations) and r.status <> 'running'
      order by r.started_at desc limit 1), false),
    'ever_synced', exists (select 1 from reply_sync_runs r where r.integration_id = any (v_integrations)),
    'conversations', coalesce((
      select jsonb_agg(x.item order by x.last_at desc)
      from (
        select t.last_human_reply_at as last_at,
               jsonb_build_object(
                 'lead_name', t.lead_name, 'lead_company', t.lead_company, 'lead_email', t.lead_email,
                 'campaign', c.name, 'interest', t.interest, 'subject', t.subject,
                 'replies', t.human_replies, 'first_reply_at', t.first_reply_at, 'last_reply_at', t.last_human_reply_at,
                 'messages', coalesce((
                   select jsonb_agg(jsonb_build_object('sent_at', mm.sent_at, 'from_name', mm.from_name, 'body', mm.body)
                                    order by mm.sent_at)
                   from (
                     select m.sent_at, m.from_name, left(m.body, 4000) as body
                     from reply_messages m
                     where m.thread_id = t.id and m.direction = 'received' and not m.is_auto_reply
                     order by m.sent_at desc limit 10
                   ) mm), '[]'::jsonb)) as item
        from reply_threads t
        join campaigns_v2 c on c.id = t.campaign_id
        where t.campaign_id = any (v_campaigns)
          and t.interest in ('interested', 'meeting_booked', 'meeting_completed', 'won')
          and t.human_replies > 0
        order by t.last_human_reply_at desc
        limit 50
      ) x), '[]'::jsonb)
  );
end;
$fn$;
revoke all on function public.get_client_portal_conversations(text) from public;
grant execute on function public.get_client_portal_conversations(text) to anon, authenticated;

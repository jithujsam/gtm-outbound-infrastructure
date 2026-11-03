-- Inbox tests (20261008000400_reply_inbox.sql): dedup, thread aggregates,
-- auto-replies, workspace + client isolation, token-authorized client view,
-- one reply sync at a time.
-- Run on a database with every migration applied; see tests/run.sh.
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

create function pg_temp.as_role(p_role text, p_sub text, p_sql text) returns text language plpgsql as $$
begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  begin execute p_sql; exception when others then reset role; return sqlstate || ': ' || sqlerrm; end;
  reset role; return null;
end $$;
create function pg_temp.scalar_as(p_role text, p_sub text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  execute p_sql into v; reset role; return v;
end $$;
create function pg_temp.check_equal(p_name text, p_actual text, p_expected text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then raise exception 'FAIL: % (expected %, got %)', p_name, p_expected, p_actual; end if;
  raise notice 'ok: %', p_name;
end $$;
create function pg_temp.check_error(p_name text, p_err text) returns void language plpgsql as $$
begin
  if p_err is null then raise exception 'FAIL: % (expected an error, got success)', p_name; end if;
  raise notice 'ok: % [%]', p_name, left(p_err, 70);
end $$;
create function pg_temp.conv(p_token text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role anon;
  v := get_client_portal_conversations(p_token);
  reset role;
  return v;
end $$;

-- ── fixture: two agencies; agency 1 has two clients sharing nothing ─────────
insert into auth.users (id, email) values
  ('f1000000-0000-0000-0000-000000000001', 'inbox-owner@example.com'),
  ('f2000000-0000-0000-0000-000000000002', 'inbox-other@example.com');
insert into workspaces (id, name) values
  ('f0000000-0000-0000-0000-0000000000a1', 'Inbox Agency'),
  ('f0000000-0000-0000-0000-0000000000a2', 'Other Agency');
insert into workspace_members (workspace_id, user_id, role) values
  ('f0000000-0000-0000-0000-0000000000a1', 'f1000000-0000-0000-0000-000000000001', 'owner'),
  ('f0000000-0000-0000-0000-0000000000a2', 'f2000000-0000-0000-0000-000000000002', 'owner');
insert into clients (id, workspace_id, name, slug, status) values
  ('f0c00000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-0000000000a1', 'Alpha', 'inbox-alpha', 'active'),
  ('f0c00000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-0000000000a1', 'Beta', 'inbox-beta', 'active'),
  ('f0c00000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-0000000000a2', 'Rival', 'inbox-rival', 'active');
insert into integrations (id, workspace_id, provider, label, enabled) values
  ('f0100000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-0000000000a1', 'instantly', 'Instantly', true),
  ('f0100000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-0000000000a2', 'instantly', 'Instantly', true);
insert into campaigns_v2 (id, workspace_id, integration_id, provider, external_id, name, status) values
  ('f0ca0000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-0000000000a1', 'f0100000-0000-0000-0000-000000000001', 'instantly', 'a1', 'Alpha Pharma', 'active'),
  ('f0ca0000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-0000000000a1', 'f0100000-0000-0000-0000-000000000001', 'instantly', 'b1', 'Beta Fintech', 'active'),
  ('f0ca0000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-0000000000a2', 'f0100000-0000-0000-0000-000000000002', 'instantly', 'r1', 'Rival Campaign', 'active');
insert into campaign_client_map (campaign_id, client_id) values
  ('f0ca0000-0000-0000-0000-000000000001', 'f0c00000-0000-0000-0000-000000000001'),
  ('f0ca0000-0000-0000-0000-000000000002', 'f0c00000-0000-0000-0000-000000000002'),
  ('f0ca0000-0000-0000-0000-000000000003', 'f0c00000-0000-0000-0000-000000000003');
select access_token as alpha_token from client_portals where client_id = 'f0c00000-0000-0000-0000-000000000001' \gset
select access_token as beta_token from client_portals where client_id = 'f0c00000-0000-0000-0000-000000000002' \gset

-- ── the sync writes as the signed-in member (RLS) ──────────────────────────
select pg_temp.check_equal('a member stores a thread',
  coalesce(pg_temp.as_role('authenticated', 'f1000000-0000-0000-0000-000000000001',
    $q$insert into reply_threads (id, workspace_id, integration_id, campaign_id, provider_thread_id, lead_email, lead_name, lead_company, interest, subject)
       values ('f0f00000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-0000000000a2', 'f0100000-0000-0000-0000-000000000002',
               'f0ca0000-0000-0000-0000-000000000001', 'thr-1', 'john@acme.example', 'John Smith', 'Acme Corp', 'interested', 'Quick question')$q$), 'no error'), 'no error');
select pg_temp.check_equal('...its workspace and integration come from the campaign, never the caller',
  (select workspace_id::text || '/' || integration_id::text from reply_threads where id = 'f0f00000-0000-0000-0000-000000000001'),
  'f0000000-0000-0000-0000-0000000000a1/f0100000-0000-0000-0000-000000000001');
insert into reply_threads (id, campaign_id, provider_thread_id, lead_email, lead_name, interest, subject) values
  ('f0f00000-0000-0000-0000-000000000002', 'f0ca0000-0000-0000-0000-000000000001', 'thr-2', 'ooo@away.example', 'Out Person', null, 'Quick question'),
  ('f0f00000-0000-0000-0000-000000000003', 'f0ca0000-0000-0000-0000-000000000001', 'thr-3', 'no@thanks.example', 'Not Now', 'not_interested', 'Quick question'),
  ('f0f00000-0000-0000-0000-000000000004', 'f0ca0000-0000-0000-0000-000000000002', 'thr-4', 'sara@beta.example', 'Sara Beta', 'meeting_booked', 'Intro'),
  ('f0f00000-0000-0000-0000-000000000005', 'f0ca0000-0000-0000-0000-000000000001', 'thr-5', 'auto@pos.example', 'Auto Positive', 'interested', 'Quick question'),
  ('f0f00000-0000-0000-0000-000000000009', 'f0ca0000-0000-0000-0000-000000000003', 'thr-9', 'secret@rival.example', 'SECRET RIVAL LEAD', 'interested', 'Rival');

select pg_temp.as_role('authenticated', 'f1000000-0000-0000-0000-000000000001',
  $q$insert into reply_messages (thread_id, provider_message_id, sent_at, is_auto_reply, from_email, from_name, body)
     values ('f0f00000-0000-0000-0000-000000000001', 'msg-1', now() - interval '2 days', false, 'john@acme.example', 'John Smith', 'Yes, this looks interesting.'),
            ('f0f00000-0000-0000-0000-000000000001', 'msg-2', now() - interval '1 day', false, 'john@acme.example', 'John Smith', 'Can we schedule a call on Thursday?'),
            ('f0f00000-0000-0000-0000-000000000002', 'msg-3', now() - interval '3 days', true, 'ooo@away.example', 'Out Person', 'I am out of office until Monday.'),
            ('f0f00000-0000-0000-0000-000000000003', 'msg-4', now() - interval '3 days', false, 'no@thanks.example', 'Not Now', 'Not interested, thanks.'),
            ('f0f00000-0000-0000-0000-000000000004', 'msg-5', now() - interval '5 hours', false, 'sara@beta.example', 'Sara Beta', 'Send me more details.'),
            ('f0f00000-0000-0000-0000-000000000005', 'msg-6', now() - interval '6 hours', true, 'auto@pos.example', 'Auto Positive', 'Automatic reply: vacation')$q$);
insert into reply_messages (thread_id, provider_message_id, sent_at, from_email, from_name, body)
values ('f0f00000-0000-0000-0000-000000000009', 'msg-9', now(), 'secret@rival.example', 'SECRET RIVAL LEAD', 'SECRET RIVAL BODY');

select pg_temp.check_equal('thread aggregates: human replies, auto-replies, latest human reply and snippet',
  (select human_replies || '/' || auto_replies || '/' || (last_human_reply_at = last_reply_at)::text || '/' || last_snippet
   from reply_threads where id = 'f0f00000-0000-0000-0000-000000000001'),
  '2/0/true/Can we schedule a call on Thursday?');
select pg_temp.check_equal('an auto-reply is never a human reply',
  (select human_replies || '/' || auto_replies || '/' || coalesce(last_human_reply_at::text, 'none')
   from reply_threads where id = 'f0f00000-0000-0000-0000-000000000002'), '0/1/none');

-- dedup: the same provider message stored again changes nothing
select pg_temp.as_role('authenticated', 'f1000000-0000-0000-0000-000000000001',
  $q$insert into reply_messages (thread_id, provider_message_id, sent_at, from_email, body)
     values ('f0f00000-0000-0000-0000-000000000001', 'msg-2', now() - interval '1 day', 'john@acme.example', 'Can we schedule a call on Thursday?')
     on conflict (integration_id, provider_message_id) do update set body = excluded.body$q$);
select pg_temp.check_equal('the same provider message is stored once (re-sync is idempotent)',
  (select count(*)::text || '/' || max(t.human_replies)::text from reply_messages m join reply_threads t on t.id = m.thread_id
   where m.thread_id = 'f0f00000-0000-0000-0000-000000000001'), '2/2');
select pg_temp.check_error('the same provider thread cannot be stored twice',
  pg_temp.as_role('authenticated', 'f1000000-0000-0000-0000-000000000001',
    $q$insert into reply_threads (campaign_id, provider_thread_id) values ('f0ca0000-0000-0000-0000-000000000001', 'thr-1')$q$));
select pg_temp.as_role('authenticated', 'f1000000-0000-0000-0000-000000000001',
  $q$update reply_threads set human_replies = 999, interest = 'won' where id = 'f0f00000-0000-0000-0000-000000000001'$q$);
select pg_temp.check_equal('aggregates cannot be written by a user; the interest status can',
  (select human_replies || '/' || interest from reply_threads where id = 'f0f00000-0000-0000-0000-000000000001'), '2/won');
update reply_threads set interest = 'interested' where id = 'f0f00000-0000-0000-0000-000000000001';

-- ── isolation ───────────────────────────────────────────────────────────────
select pg_temp.check_equal('a member sees only their workspace''s conversations',
  pg_temp.scalar_as('authenticated', 'f1000000-0000-0000-0000-000000000001',
    $q$select (select count(*) from reply_threads) || '/' || (select count(*) from reply_messages) || '/' ||
              (select count(*) from reply_messages where body like '%SECRET%')$q$), '5/6/0');
select pg_temp.check_equal('another agency sees none of them',
  pg_temp.scalar_as('authenticated', 'f2000000-0000-0000-0000-000000000002',
    $q$select (select count(*) from reply_threads where lead_name <> 'SECRET RIVAL LEAD') || '/' ||
              (select count(*) from reply_messages where body not like '%SECRET%')$q$), '0/0');
select pg_temp.check_error('a thread cannot be attached to another workspace''s campaign',
  pg_temp.as_role('authenticated', 'f1000000-0000-0000-0000-000000000001',
    $q$insert into reply_threads (campaign_id, provider_thread_id) values ('f0ca0000-0000-0000-0000-000000000003', 'steal')$q$));
select pg_temp.check_error('a message cannot be added to another workspace''s thread',
  pg_temp.as_role('authenticated', 'f1000000-0000-0000-0000-000000000001',
    $q$insert into reply_messages (thread_id, provider_message_id, sent_at, body) values ('f0f00000-0000-0000-0000-000000000009', 'x', now(), 'x')$q$));
select pg_temp.check_error('users cannot delete conversations',
  pg_temp.as_role('authenticated', 'f1000000-0000-0000-0000-000000000001',
    $q$delete from reply_messages where thread_id = 'f0f00000-0000-0000-0000-000000000001'$q$));
select pg_temp.check_error('anon cannot read threads',
  pg_temp.as_role('anon', null, $q$select 1 from reply_threads$q$));
select pg_temp.check_error('anon cannot read messages',
  pg_temp.as_role('anon', null, $q$select body from reply_messages$q$));
select pg_temp.check_error('anon cannot read the reply sync state (cursor)',
  pg_temp.as_role('anon', null, $q$select cursor from reply_sync_state$q$));

-- ── one reply sync per integration at a time ───────────────────────────────
select pg_temp.as_role('authenticated', 'f1000000-0000-0000-0000-000000000001',
  $q$insert into reply_sync_runs (workspace_id, integration_id, triggered_by, status, started_at, finished_at)
     values ('f0000000-0000-0000-0000-0000000000a1', 'f0100000-0000-0000-0000-000000000001', 'manual', 'success', now() - interval '1 hour', now() - interval '59 minutes')$q$);
select pg_temp.check_equal('a reply sync run is recorded (workspace derived from the integration)',
  coalesce(pg_temp.as_role('authenticated', 'f1000000-0000-0000-0000-000000000001',
    $q$insert into reply_sync_runs (workspace_id, integration_id, triggered_by) values ('f0000000-0000-0000-0000-0000000000a2', 'f0100000-0000-0000-0000-000000000001', 'manual')$q$), 'no error'), 'no error');
select pg_temp.check_error('a second reply sync of the same integration cannot start while one runs',
  pg_temp.as_role('authenticated', 'f1000000-0000-0000-0000-000000000001',
    $q$insert into reply_sync_runs (workspace_id, integration_id, triggered_by) values ('f0000000-0000-0000-0000-0000000000a1', 'f0100000-0000-0000-0000-000000000001', 'manual')$q$));
select pg_temp.check_error('another agency cannot start a reply sync of this integration',
  pg_temp.as_role('authenticated', 'f2000000-0000-0000-0000-000000000002',
    $q$insert into reply_sync_runs (workspace_id, integration_id, triggered_by) values ('f0000000-0000-0000-0000-0000000000a2', 'f0100000-0000-0000-0000-000000000001', 'cron')$q$));
update reply_sync_runs set status = 'failed', finished_at = now(), error_message = 'Instantly rate limit reached.'
 where integration_id = 'f0100000-0000-0000-0000-000000000001' and status = 'running';

-- ── the client's view (token) ──────────────────────────────────────────────
select pg_temp.check_equal('the client sees only positive conversations with a human reply, of its own campaigns',
  (select string_agg(c ->> 'lead_name', ',') from jsonb_array_elements(pg_temp.conv(:'alpha_token') -> 'conversations') c), 'John Smith');
select pg_temp.check_equal('the client sees the prospect''s own words, oldest first, never an auto-reply',
  (select string_agg(m ->> 'body', ' | ') from jsonb_array_elements(pg_temp.conv(:'alpha_token') -> 'conversations' -> 0 -> 'messages') m),
  'Yes, this looks interesting. | Can we schedule a call on Thursday?');
select pg_temp.check_equal('another client of the same agency sees only its own',
  (select string_agg(c ->> 'lead_name', ',') from jsonb_array_elements(pg_temp.conv(:'beta_token') -> 'conversations') c), 'Sara Beta');
select pg_temp.check_equal('the client view carries no internal ids, provider ids or agency mailboxes',
  (select (r::text ~ 'f0[a-f0-9]{6}-0000|thr-|msg-|provider|integration|workspace')::text from pg_temp.conv(:'alpha_token') r), 'false');
select pg_temp.check_equal('the last successful sync is shown, and that the newest one failed',
  (select (r ->> 'last_synced_at' is not null)::text || '/' || (r ->> 'last_sync_failed') || '/' || (r ->> 'ever_synced') from pg_temp.conv(:'alpha_token') r),
  'true/true/true');
select pg_temp.check_equal('a wrong or malformed token returns nothing',
  coalesce((select pg_temp.conv(repeat('a', 64)))::text, 'null') || '/' || coalesce((select pg_temp.conv('inbox-alpha'))::text, 'null'), 'null/null');
update client_portals set campaign_ids = array['f0ca0000-0000-0000-0000-000000000002'::uuid] where client_id = 'f0c00000-0000-0000-0000-000000000001';
select pg_temp.check_equal('a campaign id the client does not use never adds conversations',
  (select jsonb_array_length(pg_temp.conv(:'alpha_token') -> 'conversations'))::text, '0');
update client_portals set campaign_ids = null, show_conversations = false where client_id = 'f0c00000-0000-0000-0000-000000000001';
select pg_temp.check_equal('the agency can hide conversations from the client',
  (select pg_temp.conv(:'alpha_token'))::text, '{"enabled": false}');
select pg_temp.check_equal('the report settings say so too',
  (select get_client_portal(:'alpha_token') -> 'settings' ->> 'show_conversations'), 'false');
update client_portals set show_conversations = true where client_id = 'f0c00000-0000-0000-0000-000000000001';
update clients set status = 'paused' where id = 'f0c00000-0000-0000-0000-000000000001';
select pg_temp.check_equal('an inactive client shows no conversations',
  (select pg_temp.conv(:'alpha_token'))::text, '{"enabled": false}');
update clients set status = 'active' where id = 'f0c00000-0000-0000-0000-000000000001';

-- ── deleting ────────────────────────────────────────────────────────────────
delete from campaign_client_map where campaign_id = 'f0ca0000-0000-0000-0000-000000000002';
select pg_temp.check_equal('a campaign removed from its last client takes its conversations with it',
  (select count(*)::text from reply_threads where campaign_id = 'f0ca0000-0000-0000-0000-000000000002'), '0');

\echo 'ALL INBOX TESTS PASSED'

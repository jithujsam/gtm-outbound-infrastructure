-- Client portal tests (20261008000300_client_portal.sql): token access,
-- workspace isolation, settings, campaign economics, the revoked slug path.
-- Run on a database with every migration applied; see tests/run.sh.
-- Every block raises on failure.
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
create function pg_temp.portal(p_token text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role anon;
  v := get_client_portal(p_token);
  reset role;
  return v;
end $$;

-- ── fixture: two agencies ───────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('e1000000-0000-0000-0000-000000000001', 'portal-owner@example.com'),
  ('e2000000-0000-0000-0000-000000000002', 'portal-other@example.com');
insert into workspaces (id, name, logo_url) values
  ('e0000000-0000-0000-0000-0000000000a1', 'Portal Agency', 'https://cdn.example/logo.png'),
  ('e0000000-0000-0000-0000-0000000000a2', 'Other Agency', null);
insert into workspace_members (workspace_id, user_id, role) values
  ('e0000000-0000-0000-0000-0000000000a1', 'e1000000-0000-0000-0000-000000000001', 'owner'),
  ('e0000000-0000-0000-0000-0000000000a2', 'e2000000-0000-0000-0000-000000000002', 'owner');
insert into clients (id, workspace_id, name, slug, status) values
  ('e0c00000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-0000000000a1', 'Acme Pharma', 'acme-pharma', 'active'),
  ('e0c00000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-0000000000a1', 'Paused Co', 'paused-co', 'paused'),
  ('e0c00000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-0000000000a2', 'Rival Client', 'rival-client', 'active');
insert into integrations (id, workspace_id, provider, label, enabled) values
  ('e0100000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-0000000000a1', 'instantly', 'Instantly', true),
  ('e0100000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-0000000000a2', 'instantly', 'Instantly', true);
insert into campaigns_v2 (id, workspace_id, integration_id, provider, external_id, name, status, sender_emails, provider_raw) values
  ('e0ca0000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-0000000000a1', 'e0100000-0000-0000-0000-000000000001', 'instantly', 'x1', 'Pharma EU', 'active',
   array['ana@send-a.example', 'ben@send-b.example'], '{"secret":"provider payload"}'),
  ('e0ca0000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-0000000000a1', 'e0100000-0000-0000-0000-000000000001', 'instantly', 'x2', 'Pharma US', 'paused',
   array['cat@send-a.example'], null),
  ('e0ca0000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-0000000000a2', 'e0100000-0000-0000-0000-000000000002', 'instantly', 'x3', 'Rival Campaign', 'active',
   array['spy@rival.example'], null);
insert into campaign_client_map (campaign_id, client_id) values
  ('e0ca0000-0000-0000-0000-000000000001', 'e0c00000-0000-0000-0000-000000000001'),
  ('e0ca0000-0000-0000-0000-000000000002', 'e0c00000-0000-0000-0000-000000000001'),
  ('e0ca0000-0000-0000-0000-000000000003', 'e0c00000-0000-0000-0000-000000000003');
insert into campaign_stats (campaign_id, stat_date, captured_at, emails_sent, new_leads_contacted, replies_unique, opportunities, bounces, meetings_booked) values
  ('e0ca0000-0000-0000-0000-000000000001', current_date - 2, now() - interval '2 days', 1000, 400, 4, 2, 3, 99),
  ('e0ca0000-0000-0000-0000-000000000001', current_date - 1, now() - interval '1 day', 2000, 700, 9, 6, 5, 99),
  ('e0ca0000-0000-0000-0000-000000000002', current_date - 1, now() - interval '1 day', 500, 300, 2, 1, 1, 99),
  ('e0ca0000-0000-0000-0000-000000000003', current_date - 1, now() - interval '1 day', 9999, 9999, 999, 99, 9, 99);
insert into email_accounts (workspace_id, integration_id, provider, email, status, warmup_status, warmup_score, daily_limit) values
  ('e0000000-0000-0000-0000-0000000000a1', 'e0100000-0000-0000-0000-000000000001', 'instantly', 'ana@send-a.example', 'active', 'active', 97, 30),
  ('e0000000-0000-0000-0000-0000000000a1', 'e0100000-0000-0000-0000-000000000001', 'instantly', 'ben@send-b.example', 'active', 'active', 95, 30),
  ('e0000000-0000-0000-0000-0000000000a1', 'e0100000-0000-0000-0000-000000000001', 'instantly', 'cat@send-a.example', 'error', 'active', 60, 30),
  ('e0000000-0000-0000-0000-0000000000a2', 'e0100000-0000-0000-0000-000000000002', 'instantly', 'spy@rival.example', 'active', 'active', 99, 30);
insert into email_domains (workspace_id, integration_id, domain, spf, dkim, dmarc, mx) values
  ('e0000000-0000-0000-0000-0000000000a1', 'e0100000-0000-0000-0000-000000000001', 'send-a.example', true, true, true, true);

select access_token as acme_token from client_portals where client_id = 'e0c00000-0000-0000-0000-000000000001' \gset
select access_token as paused_token from client_portals where client_id = 'e0c00000-0000-0000-0000-000000000002' \gset
select access_token as rival_token from client_portals where client_id = 'e0c00000-0000-0000-0000-000000000003' \gset

-- ── every client has a portal with a random token ───────────────────────────
select pg_temp.check_equal('every client gets a portal on insert',
  (select count(*)::text from clients c where not exists (select 1 from client_portals p where p.client_id = c.id)), '0');
select pg_temp.check_equal('tokens are 64 random hex characters, distinct, and unrelated to the slug',
  (select (count(distinct access_token) = count(*) and bool_and(access_token ~ '^[0-9a-f]{64}$')
           and bool_and(position(replace(c.slug, '-', '') in access_token) = 0))::text
   from client_portals p join clients c on c.id = p.client_id), 'true');
select pg_temp.check_equal('the portal workspace is derived from the client',
  (select workspace_id::text from client_portals where client_id = 'e0c00000-0000-0000-0000-000000000003'), 'e0000000-0000-0000-0000-0000000000a2');
select pg_temp.check_equal('defaults: detailed view, five KPI cards, every campaign, both sections',
  (select mode || '/' || array_to_string(metrics, ',') || '/' || (campaign_ids is null)::text || '/' || show_infrastructure::text || '/' || show_economics::text
   from client_portals where client_id = 'e0c00000-0000-0000-0000-000000000001'),
  'advanced/emailsSent,prospectsContacted,humanReplies,positive,replyRate/true/true/true');

-- ── public read by token ────────────────────────────────────────────────────
select pg_temp.check_equal('anon reads the report with the token',
  (select pg_temp.portal(:'acme_token') ->> 'client_name'), 'Acme Pharma');
select pg_temp.check_equal('the report has the client''s two campaigns, never another agency''s',
  (select string_agg(c ->> 'name', ',' order by c ->> 'name') from jsonb_array_elements(pg_temp.portal(:'acme_token') -> 'campaigns') c),
  'Pharma EU,Pharma US');
select pg_temp.check_equal('each campaign carries its latest snapshot',
  (select string_agg((c ->> 'emails_sent') || '/' || (c ->> 'new_leads_contacted'), ',' order by c ->> 'name')
   from jsonb_array_elements(pg_temp.portal(:'acme_token') -> 'campaigns') c), '2000/700,500/300');
select pg_temp.check_equal('history holds every stored day of the included campaigns',
  (select jsonb_array_length(pg_temp.portal(:'acme_token') -> 'history'))::text, '3');
select pg_temp.check_equal('the report exposes no provider payload, unused metrics, workspace or integration ids',
  (select (r::text like '%provider payload%' or r::text like '%meetings%' or r::text like '%e0000000-0000-0000-0000-0000000000a1%'
           or r::text like '%e0100000%')::text from pg_temp.portal(:'acme_token') r), 'false');
select pg_temp.check_equal('infrastructure: the campaigns'' mailboxes, without addresses or domain names',
  (select jsonb_array_length(r -> 'infrastructure')::text || '/' || (r::text like '%@%' or r::text like '%send-a%')::text
   from pg_temp.portal(:'acme_token') r), '3/false');
select pg_temp.check_equal('infrastructure carries account status and the domain DNS checks',
  (select string_agg((a ->> 'status') || ':' || coalesce(a ->> 'spf', 'null'), ',' order by (a ->> 'status') || coalesce(a ->> 'spf', 'null'))
   from jsonb_array_elements(pg_temp.portal(:'acme_token') -> 'infrastructure') a), 'active:null,active:true,error:true');
select pg_temp.check_equal('the agency branding comes from the workspace',
  (select pg_temp.portal(:'acme_token') -> 'branding' ->> 'agency_name'), 'Portal Agency');
select pg_temp.check_equal('a wrong token returns nothing',
  (select pg_temp.portal(repeat('a', 64)))::text, null);
select pg_temp.check_equal('a malformed token (or the slug) returns nothing',
  (select coalesce(pg_temp.portal('acme-pharma'), pg_temp.portal(null), pg_temp.portal(upper(:'acme_token'))))::text, null);
select pg_temp.check_equal('an inactive client returns only its status, never its name or numbers',
  (select pg_temp.portal(:'paused_token'))::text, '{"slug": "paused-co", "status": "paused"}');
select pg_temp.check_equal('another agency''s token shows only that agency''s client',
  (select string_agg(c ->> 'name', ',') from jsonb_array_elements(pg_temp.portal(:'rival_token') -> 'campaigns') c), 'Rival Campaign');

-- ── the slug path is closed ─────────────────────────────────────────────────
select pg_temp.check_error('anon can no longer resolve a client by slug',
  pg_temp.as_role('anon', null, $q$select * from get_public_client_by_slug('acme-pharma')$q$));
select pg_temp.check_error('anon can no longer read campaigns by client id',
  pg_temp.as_role('anon', null, $q$select * from get_public_client_campaigns('e0c00000-0000-0000-0000-000000000001')$q$));
select pg_temp.check_error('signed-in users of another agency cannot use the id path either',
  pg_temp.as_role('authenticated', 'e2000000-0000-0000-0000-000000000002', $q$select * from get_public_workspace_branding('e0c00000-0000-0000-0000-000000000001')$q$));
select pg_temp.check_error('public remark posting is closed (remarks were removed from the portal)',
  pg_temp.as_role('anon', null, $q$select post_public_remark('e0c00000-0000-0000-0000-000000000001', null, 'General', 't', 'b')$q$));
select pg_temp.check_error('public remark reading is closed',
  pg_temp.as_role('anon', null, $q$select * from get_public_remarks('e0c00000-0000-0000-0000-000000000001')$q$));
select pg_temp.check_error('anon cannot read portal tokens',
  pg_temp.as_role('anon', null, $q$select access_token from client_portals$q$));
select pg_temp.check_error('anon cannot read campaign economics',
  pg_temp.as_role('anon', null, $q$select * from campaign_economics$q$));

-- ── settings: members of the workspace only ────────────────────────────────
select pg_temp.check_equal('a member sees only their own clients'' portals',
  pg_temp.scalar_as('authenticated', 'e1000000-0000-0000-0000-000000000001', $q$select count(*)::text from client_portals$q$), '2');
select pg_temp.check_equal('another agency sees none of them',
  pg_temp.scalar_as('authenticated', 'e2000000-0000-0000-0000-000000000002',
    $q$select count(*)::text from client_portals where client_id = 'e0c00000-0000-0000-0000-000000000001'$q$), '0');
select pg_temp.as_role('authenticated', 'e1000000-0000-0000-0000-000000000001',
  $q$update client_portals set mode = 'simple', metrics = array['positive', 'prospectsContacted'],
                               campaign_ids = array['e0ca0000-0000-0000-0000-000000000001'::uuid, 'e0ca0000-0000-0000-0000-000000000001'::uuid],
                               show_infrastructure = false
     where client_id = 'e0c00000-0000-0000-0000-000000000001'$q$);
select pg_temp.check_equal('a member changes the view, cards (in order), campaigns and sections',
  (select mode || '/' || array_to_string(metrics, ',') || '/' || cardinality(campaign_ids)::text || '/' || show_infrastructure::text
   from client_portals where client_id = 'e0c00000-0000-0000-0000-000000000001'), 'simple/positive,prospectsContacted/1/false');
select pg_temp.check_equal('the report follows the settings: one campaign, no infrastructure, the chosen cards',
  (select jsonb_array_length(r -> 'campaigns')::text || '/' || coalesce(r ->> 'infrastructure', 'hidden') || '/' || (r -> 'settings' ->> 'metrics')
          || '/' || (r ->> 'total_campaigns') from pg_temp.portal(:'acme_token') r),
  '1/hidden/["positive", "prospectsContacted"]/2');
select pg_temp.check_error('unknown metrics are rejected (no fabricated metrics such as meetings)',
  pg_temp.as_role('authenticated', 'e1000000-0000-0000-0000-000000000001',
    $q$update client_portals set metrics = array['meetings'] where client_id = 'e0c00000-0000-0000-0000-000000000001'$q$));
select pg_temp.check_error('duplicate cards are rejected',
  pg_temp.as_role('authenticated', 'e1000000-0000-0000-0000-000000000001',
    $q$update client_portals set metrics = array['positive', 'positive'] where client_id = 'e0c00000-0000-0000-0000-000000000001'$q$));
select pg_temp.check_error('a member cannot choose a token',
  pg_temp.as_role('authenticated', 'e1000000-0000-0000-0000-000000000001',
    $q$update client_portals set access_token = repeat('0', 64) where client_id = 'e0c00000-0000-0000-0000-000000000001'$q$));
select pg_temp.check_error('a member cannot create or delete portals directly',
  pg_temp.as_role('authenticated', 'e1000000-0000-0000-0000-000000000001',
    $q$delete from client_portals where client_id = 'e0c00000-0000-0000-0000-000000000001'$q$));
select pg_temp.as_role('authenticated', 'e2000000-0000-0000-0000-000000000002',
  $q$update client_portals set mode = 'advanced' where client_id = 'e0c00000-0000-0000-0000-000000000001'$q$);
select pg_temp.check_equal('another agency cannot change the settings',
  (select mode from client_portals where client_id = 'e0c00000-0000-0000-0000-000000000001'), 'simple');
update client_portals set mode = 'advanced', metrics = default, campaign_ids = null, show_infrastructure = true
 where client_id = 'e0c00000-0000-0000-0000-000000000001';

-- ── revoking a link ─────────────────────────────────────────────────────────
select pg_temp.check_error('another agency cannot rotate the token',
  pg_temp.as_role('authenticated', 'e2000000-0000-0000-0000-000000000002',
    $q$select rotate_client_portal_token('e0c00000-0000-0000-0000-000000000001')$q$));
select pg_temp.check_error('anon cannot rotate a token',
  pg_temp.as_role('anon', null, $q$select rotate_client_portal_token('e0c00000-0000-0000-0000-000000000001')$q$));
select pg_temp.scalar_as('authenticated', 'e1000000-0000-0000-0000-000000000001',
  $q$select rotate_client_portal_token('e0c00000-0000-0000-0000-000000000001')$q$) as new_token \gset
select pg_temp.check_equal('rotating gives a new token',
  (:'new_token' <> :'acme_token' and :'new_token' ~ '^[0-9a-f]{64}$')::text, 'true');
select pg_temp.check_equal('the old link stops working at once',
  (select pg_temp.portal(:'acme_token'))::text, null);
select pg_temp.check_equal('the new link works',
  (select pg_temp.portal(:'new_token') ->> 'client_name'), 'Acme Pharma');

-- ── campaign economics ─────────────────────────────────────────────────────
select pg_temp.check_equal('a member records a campaign''s cost in an explicit currency',
  coalesce(pg_temp.as_role('authenticated', 'e1000000-0000-0000-0000-000000000001',
    $q$insert into campaign_economics (campaign_id, client_id, currency, cost, value_per_positive)
       values ('e0ca0000-0000-0000-0000-000000000001', 'e0c00000-0000-0000-0000-000000000001', 'EUR', 1500, 400)$q$), 'no error'), 'no error');
select pg_temp.check_equal('economics reach the report with their currency',
  (select c -> 'economics' ->> 'currency' || ' ' || (c -> 'economics' ->> 'cost')
   from jsonb_array_elements(pg_temp.portal(:'new_token') -> 'campaigns') c where c ->> 'name' = 'Pharma EU'), 'EUR 1500.00');
select pg_temp.check_equal('a campaign without economics has none (never a fabricated 0)',
  (select coalesce(c ->> 'economics', 'none') from jsonb_array_elements(pg_temp.portal(:'new_token') -> 'campaigns') c where c ->> 'name' = 'Pharma US'), 'none');
select pg_temp.check_error('a currency must be a 3-letter code',
  pg_temp.as_role('authenticated', 'e1000000-0000-0000-0000-000000000001',
    $q$insert into campaign_economics (campaign_id, client_id, currency, cost) values ('e0ca0000-0000-0000-0000-000000000002', 'e0c00000-0000-0000-0000-000000000001', 'usd', 1)$q$));
select pg_temp.check_error('a cost cannot be negative',
  pg_temp.as_role('authenticated', 'e1000000-0000-0000-0000-000000000001',
    $q$insert into campaign_economics (campaign_id, client_id, currency, cost) values ('e0ca0000-0000-0000-0000-000000000002', 'e0c00000-0000-0000-0000-000000000001', 'USD', -5)$q$));
select pg_temp.check_error('economics need the campaign to be used by that client',
  pg_temp.as_role('authenticated', 'e1000000-0000-0000-0000-000000000001',
    $q$insert into campaign_economics (campaign_id, client_id, currency, cost) values ('e0ca0000-0000-0000-0000-000000000003', 'e0c00000-0000-0000-0000-000000000001', 'USD', 5)$q$));
select pg_temp.check_error('another agency cannot write economics for this client',
  pg_temp.as_role('authenticated', 'e2000000-0000-0000-0000-000000000002',
    $q$insert into campaign_economics (campaign_id, client_id, currency, cost) values ('e0ca0000-0000-0000-0000-000000000002', 'e0c00000-0000-0000-0000-000000000001', 'USD', 5)$q$));
select pg_temp.check_equal('another agency cannot read this client''s economics',
  pg_temp.scalar_as('authenticated', 'e2000000-0000-0000-0000-000000000002', $q$select count(*)::text from campaign_economics$q$), '0');
update client_portals set show_economics = false where client_id = 'e0c00000-0000-0000-0000-000000000001';
select pg_temp.check_equal('with economics hidden the report carries none',
  (select count(*)::text from jsonb_array_elements(pg_temp.portal(:'new_token') -> 'campaigns') c where c ? 'economics' and c ->> 'economics' is not null), '0');
delete from campaign_client_map where campaign_id = 'e0ca0000-0000-0000-0000-000000000001' and client_id = 'e0c00000-0000-0000-0000-000000000001';
select pg_temp.check_equal('removing a campaign from the client removes its economics',
  (select count(*)::text from campaign_economics where client_id = 'e0c00000-0000-0000-0000-000000000001'), '0');
delete from clients where id = 'e0c00000-0000-0000-0000-000000000001';
select pg_temp.check_equal('deleting the client deletes its portal (the link stops working)',
  (select count(*)::text from client_portals where client_id = 'e0c00000-0000-0000-0000-000000000001')
  || '/' || coalesce((select pg_temp.portal(:'new_token'))::text, 'gone'), '0/gone');

\echo 'ALL PORTAL TESTS PASSED'

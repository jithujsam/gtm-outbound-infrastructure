-- V2 behaviour tests (workspaces, campaigns, stats, sync runs, public portal).
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

insert into auth.users (id, email) values
  ('a1111111-0000-0000-0000-000000000001', 'v2-owner@example.com'),
  ('a2222222-0000-0000-0000-000000000002', 'v2-other@example.com');

-- ── Phase 1: workspaces ─────────────────────────────────────────────────────
-- A migrated agency: its workspace has the same id and its user is the owner
-- (the back-fill itself is tested on real V1 data in v2_backfill.test.sql).
insert into agency_details (id, user_id, agency_name) values
  ('a0000000-0000-0000-0000-0000000000a1', 'a1111111-0000-0000-0000-000000000001', 'V2 Agency');
insert into workspaces (id, name, legacy_agency_id) values
  ('a0000000-0000-0000-0000-0000000000a1', 'V2 Agency', 'a0000000-0000-0000-0000-0000000000a1');
insert into workspace_members (workspace_id, user_id, role) values
  ('a0000000-0000-0000-0000-0000000000a1', 'a1111111-0000-0000-0000-000000000001', 'owner');
insert into clients (id, agency_id, name, slug) values
  ('a0c00000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a1', 'V1-written client', 'v2-client-1');
select pg_temp.check_equal('[p1] a client written with only agency_id gets its workspace_id',
  (select workspace_id::text from clients where id = 'a0c00000-0000-0000-0000-000000000001'), 'a0000000-0000-0000-0000-0000000000a1');

select pg_temp.check_equal('[p1] a member sees their workspace',
  pg_temp.scalar_as('authenticated', 'a1111111-0000-0000-0000-000000000001', $q$select count(*)::text from workspaces$q$), '1');
select pg_temp.check_equal('[p1] a non-member sees no workspace',
  pg_temp.scalar_as('authenticated', 'a2222222-0000-0000-0000-000000000002', $q$select count(*)::text from workspaces$q$), '0');
select pg_temp.check_equal('[p1] anon sees no workspace and no membership',
  pg_temp.scalar_as('anon', null, $q$select (select count(*) from workspaces) + (select count(*) from workspace_members)$q$), '0');

select pg_temp.as_role('authenticated', 'a1111111-0000-0000-0000-000000000001',
  $q$update workspaces set plan = 'agency', name = 'Renamed' where id = 'a0000000-0000-0000-0000-0000000000a1'$q$);
select pg_temp.check_equal('[p1] the owner can rename the workspace but cannot change its plan',
  (select name || '/' || plan from workspaces where id = 'a0000000-0000-0000-0000-0000000000a1'), 'Renamed/trial');
select pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
  $q$update workspaces set name = 'Hijacked' where id = 'a0000000-0000-0000-0000-0000000000a1'$q$);
select pg_temp.check_equal('[p1] a non-member cannot edit the workspace',
  (select name from workspaces where id = 'a0000000-0000-0000-0000-0000000000a1'), 'Renamed');
select pg_temp.check_error('[p1] a user cannot add themselves to someone else''s workspace',
  pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$insert into workspace_members (workspace_id, user_id, role) values ('a0000000-0000-0000-0000-0000000000a1', 'a2222222-0000-0000-0000-000000000002', 'owner')$q$));
select pg_temp.check_error('[p1] a user cannot create a workspace row directly',
  pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$insert into workspaces (name) values ('Sneaky')$q$));

-- ── Phase 2: workspace identity ─────────────────────────────────────────────
select pg_temp.check_equal('[p2] ensure_workspace returns the migrated agency''s workspace for its owner',
  pg_temp.scalar_as('authenticated', 'a1111111-0000-0000-0000-000000000001', $q$select ensure_workspace()::text$q$),
  'a0000000-0000-0000-0000-0000000000a1');
select pg_temp.scalar_as('authenticated', 'a2222222-0000-0000-0000-000000000002', $q$select ensure_workspace('New Co', 'https://new.example')::text$q$);
select pg_temp.scalar_as('authenticated', 'a2222222-0000-0000-0000-000000000002', $q$select ensure_workspace('Other name')::text$q$);
select pg_temp.check_equal('[p2] ensure_workspace creates a workspace for a brand-new user (no agency_details)',
  pg_temp.scalar_as('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$select w.name || '/' || w.website || '/' || w.plan from workspaces w$q$),
  'New Co/https://new.example/trial');
select pg_temp.check_equal('[p2] ...exactly once (second call returns the same workspace)',
  (select count(*)::text from workspace_members where user_id = 'a2222222-0000-0000-0000-000000000002'), '1');
select pg_temp.check_equal('[p2] ...with the user as owner and no agency_details row',
  (select m.role || '/' || (select count(*) from agency_details where user_id = m.user_id)::text
     from workspace_members m where m.user_id = 'a2222222-0000-0000-0000-000000000002'), 'owner/0');
select pg_temp.check_error('[p2] anon cannot call ensure_workspace',
  pg_temp.as_role('anon', null, $q$select ensure_workspace()$q$));

select id as ws2 from workspaces where id = (select workspace_id from workspace_members where user_id = 'a2222222-0000-0000-0000-000000000002') \gset
select pg_temp.check_equal('[p2] a new-workspace user can create a client with no agency',
  coalesce(pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    format($q$insert into clients (id, workspace_id, name, slug) values ('a0c00000-0000-0000-0000-000000000002', %L, 'New client', 'v2-client-2')$q$, :'ws2')), 'no error'),
  'no error');
select pg_temp.check_error('[p2] ...but cannot create a client in another workspace',
  pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$insert into clients (workspace_id, name, slug) values ('a0000000-0000-0000-0000-0000000000a1', 'Intruder', 'v2-intruder')$q$));
select pg_temp.check_equal('[p2] workspaces see only their own clients',
  pg_temp.scalar_as('authenticated', 'a2222222-0000-0000-0000-000000000002', $q$select string_agg(name, ',') from clients$q$),
  'New client');
select pg_temp.check_equal('[p2] the agency-migrated owner still sees their client',
  pg_temp.scalar_as('authenticated', 'a1111111-0000-0000-0000-000000000001', $q$select string_agg(name, ',') from clients$q$),
  'V1-written client');

select pg_temp.check_equal('[p2] an agency remark gets its workspace from the client (forged value ignored)',
  pg_temp.scalar_as('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$with ins as (insert into remarks (workspace_id, client_id, author_type, category, title, body)
       values ('a0000000-0000-0000-0000-0000000000a1', 'a0c00000-0000-0000-0000-000000000002', 'agency', 'General', 't', 'b')
       returning workspace_id, agency_id)
       select (workspace_id = (select workspace_id from clients where id = 'a0c00000-0000-0000-0000-000000000002'))::text || '/' || coalesce(agency_id::text, 'no agency') from ins$q$),
  'true/no agency');
select pg_temp.check_error('[p2] a user cannot write a remark into another workspace''s client',
  pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$insert into remarks (client_id, author_type, category, title, body) values ('a0c00000-0000-0000-0000-000000000001', 'agency', 'General', 'x', 'y')$q$));
select pg_temp.check_equal('[p2] remarks are isolated per workspace',
  pg_temp.scalar_as('authenticated', 'a1111111-0000-0000-0000-000000000001', $q$select count(*)::text from remarks$q$), '0');

select pg_temp.check_equal('[p2] a workspace can store an Instantly integration with only provider set',
  coalesce(pg_temp.as_role('service_role', 'a2222222-0000-0000-0000-000000000002',
    format($q$insert into integrations (id, workspace_id, provider, label, enabled) values ('a0100000-0000-0000-0000-000000000002', %L, 'instantly', 'Instantly', true)$q$, :'ws2')), 'no error'),
  'no error');
select pg_temp.check_equal('[p2] ...and tool is filled in for V1 compatibility',
  (select tool from integrations where id = 'a0100000-0000-0000-0000-000000000002'), 'instantly');
select pg_temp.check_error('[p2] a second Instantly integration per workspace is rejected',
  pg_temp.as_role('service_role', 'a2222222-0000-0000-0000-000000000002',
    format($q$insert into integrations (workspace_id, provider, label, enabled) values (%L, 'instantly', 'Instantly', true)$q$, :'ws2')));
select pg_temp.check_equal('[p2] integrations are isolated per workspace',
  pg_temp.scalar_as('authenticated', 'a1111111-0000-0000-0000-000000000001', $q$select count(*)::text from integrations$q$), '0');

update workspaces set name = 'New Co Branding', logo_url = 'https://cdn.example/new.png' where id = :'ws2';
select pg_temp.check_equal('[p2] public portal branding comes from the workspace (no agency_details needed)',
  pg_temp.scalar_as('service_role', null,
    $q$select agency_name || '|' || agency_logo_url from get_public_workspace_branding('a0c00000-0000-0000-0000-000000000002')$q$),
  'New Co Branding|https://cdn.example/new.png');

-- ── Phase 3: campaign foundation ────────────────────────────────────────────
-- user 2 (workspace :ws2) owns integration a0100000-…02 and client a0c00000-…02
insert into integrations (id, agency_id, tool, label, enabled) values
  ('a0100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a1', 'instantly', 'Instantly', true);

select pg_temp.check_equal('[p3] a campaign can exist without any client',
  coalesce(pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    format($q$insert into campaigns_v2 (id, workspace_id, integration_id, provider, external_id, name, status)
              values ('a0ca0000-0000-0000-0000-000000000001', %L, 'a0100000-0000-0000-0000-000000000002', 'x', 'ext-1', 'Camp 1', 'active')$q$, :'ws2')), 'no error'),
  'no error');
select pg_temp.check_equal('[p3] provider is taken from the integration, not the caller',
  (select provider from campaigns_v2 where id = 'a0ca0000-0000-0000-0000-000000000001'), 'instantly');
select pg_temp.check_error('[p3] UNIQUE(integration_id, external_id): the same provider campaign cannot be stored twice',
  pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    format($q$insert into campaigns_v2 (workspace_id, integration_id, provider, external_id, name) values (%L, 'a0100000-0000-0000-0000-000000000002', 'instantly', 'ext-1', 'dup')$q$, :'ws2')));
select pg_temp.check_error('[p3] a campaign cannot use another workspace''s integration',
  pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    format($q$insert into campaigns_v2 (workspace_id, integration_id, provider, external_id, name) values (%L, 'a0100000-0000-0000-0000-000000000001', 'instantly', 'ext-9', 'steal')$q$, :'ws2')));
select pg_temp.check_error('[p3] a user cannot write a campaign into another workspace',
  pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$insert into campaigns_v2 (workspace_id, integration_id, provider, external_id, name) values ('a0000000-0000-0000-0000-0000000000a1', 'a0100000-0000-0000-0000-000000000001', 'instantly', 'ext-9', 'steal')$q$));

-- daily snapshots
select pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
  $q$insert into campaign_stats (campaign_id, stat_date, captured_at, emails_sent, replies_unique, provider_raw)
     values ('a0ca0000-0000-0000-0000-000000000001', '2026-10-01', '2026-10-01 08:00+00', 100, 5, '{"x":1}')$q$);
select pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
  $q$insert into campaign_stats (campaign_id, stat_date, captured_at, emails_sent, replies_unique)
     values ('a0ca0000-0000-0000-0000-000000000001', '2026-10-02', '2026-10-02 08:00+00', 150, 7)
     on conflict (campaign_id, stat_date) do update set emails_sent = excluded.emails_sent, replies_unique = excluded.replies_unique, captured_at = excluded.captured_at$q$);
select pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
  $q$insert into campaign_stats (campaign_id, stat_date, captured_at, emails_sent, replies_unique)
     values ('a0ca0000-0000-0000-0000-000000000001', '2026-10-02', '2026-10-02 18:00+00', 180, 9)
     on conflict (campaign_id, stat_date) do update set emails_sent = excluded.emails_sent, replies_unique = excluded.replies_unique, captured_at = excluded.captured_at$q$);
select pg_temp.check_equal('[p3] stats: one snapshot per day, earlier days kept, same-day re-sync refreshes that day',
  (select string_agg(stat_date::text || '=' || emails_sent::text, ',' order by stat_date) from campaign_stats where campaign_id = 'a0ca0000-0000-0000-0000-000000000001'),
  '2026-10-01=100,2026-10-02=180');
select pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
  $q$insert into campaign_stats (campaign_id, stat_date, captured_at, emails_sent)
     values ('a0ca0000-0000-0000-0000-000000000001', '2026-10-02', '2026-10-02 09:00+00', 1)
     on conflict (campaign_id, stat_date) do update set emails_sent = excluded.emails_sent, captured_at = excluded.captured_at$q$);
select pg_temp.check_equal('[p3] stats: an older capture never replaces a newer one',
  (select emails_sent::text from campaign_stats where campaign_id = 'a0ca0000-0000-0000-0000-000000000001' and stat_date = '2026-10-02'), '180');
select pg_temp.check_equal('[p3] stats: workspace derived from the campaign',
  (select count(*)::text from campaign_stats where campaign_id = 'a0ca0000-0000-0000-0000-000000000001' and workspace_id = :'ws2'), '2');
select pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
  $q$delete from campaign_stats where campaign_id = 'a0ca0000-0000-0000-0000-000000000001'$q$);
select pg_temp.check_equal('[p3] stats history cannot be deleted by users',
  (select count(*)::text from campaign_stats where campaign_id = 'a0ca0000-0000-0000-0000-000000000001'), '2');
select pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
  $q$delete from campaigns_v2 where id = 'a0ca0000-0000-0000-0000-000000000001'$q$);
select pg_temp.check_equal('[p3] campaigns cannot be deleted by users',
  (select count(*)::text from campaigns_v2 where id = 'a0ca0000-0000-0000-0000-000000000001'), '1');

-- client mapping
select pg_temp.check_equal('[p3] a campaign can be attached to a client of the same workspace',
  coalesce(pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$insert into campaign_client_map (campaign_id, client_id) values ('a0ca0000-0000-0000-0000-000000000001', 'a0c00000-0000-0000-0000-000000000002')$q$), 'no error'),
  'no error');
select pg_temp.check_error('[p3] a campaign cannot be attached to another workspace''s client',
  pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$insert into campaign_client_map (campaign_id, client_id) values ('a0ca0000-0000-0000-0000-000000000001', 'a0c00000-0000-0000-0000-000000000001')$q$));
select pg_temp.check_equal('[p3] get_client_campaigns returns the latest snapshot',
  pg_temp.scalar_as('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$select name || '/' || status || '/' || stat_date::text || '/' || emails_sent::text || '/' || replies_unique::text
       from get_client_campaigns('a0c00000-0000-0000-0000-000000000002')$q$),
  'Camp 1/active/2026-10-02/180/9');
-- provider campaign names: the provider is the only source (part 14)
select pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
  $q$update campaigns_v2 set display_name = 'KKK1' where id = 'a0ca0000-0000-0000-0000-000000000001'$q$);
update campaigns_v2 set display_name = 'KKK1' where id = 'a0ca0000-0000-0000-0000-000000000001';
select pg_temp.check_equal('[names] a Klaroh-side name cannot be set on a provider campaign (member or owner)',
  (select coalesce(display_name, 'null') from campaigns_v2 where id = 'a0ca0000-0000-0000-0000-000000000001'), 'null');
select pg_temp.check_equal('[names] the read model shows the provider name',
  pg_temp.scalar_as('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$select name || '|' || provider_name from get_client_campaigns()$q$),
  'Camp 1|Camp 1');
-- the provider renames the campaign; sync upserts by (integration_id, external_id)
select pg_temp.check_equal('[names] a provider rename synced by a member updates the same campaign',
  pg_temp.scalar_as('authenticated', 'a2222222-0000-0000-0000-000000000002',
    format($q$with u as (insert into campaigns_v2 (workspace_id, integration_id, provider, external_id, name, status)
                         values (%L, 'a0100000-0000-0000-0000-000000000002', 'instantly', 'ext-1', 'Pharma', 'active')
                         on conflict (integration_id, external_id) do update set name = excluded.name
                         returning id)
              select id::text from u$q$, :'ws2')),
  'a0ca0000-0000-0000-0000-000000000001');
select pg_temp.check_equal('[names] a rename creates no campaign and keeps history and client links',
  (select count(*)::text from campaigns_v2 where integration_id = 'a0100000-0000-0000-0000-000000000002')
  || '/' || (select count(*)::text from campaign_stats where campaign_id = 'a0ca0000-0000-0000-0000-000000000001')
  || '/' || (select count(*)::text from campaign_client_map where campaign_id = 'a0ca0000-0000-0000-0000-000000000001'),
  '1/2/1');
select pg_temp.check_equal('[names] every read shows the new provider name',
  pg_temp.scalar_as('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$select name || '|' || provider_name || '|' || emails_sent from get_client_campaigns()$q$),
  'Pharma|Pharma|180');
select pg_temp.check_equal('[names] another workspace cannot rename it',
  coalesce(pg_temp.as_role('authenticated', 'a1111111-0000-0000-0000-000000000001',
    $q$update campaigns_v2 set name = 'Hijack' where id = 'a0ca0000-0000-0000-0000-000000000001'$q$), 'no error')
  || '/' || (select name from campaigns_v2 where id = 'a0ca0000-0000-0000-0000-000000000001'),
  'no error/Pharma');

-- sync runs
select pg_temp.check_error('[p3] a sync run cannot reference another workspace''s integration',
  pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    format($q$insert into sync_runs (workspace_id, integration_id, provider, triggered_by) values (%L, 'a0100000-0000-0000-0000-000000000001', 'instantly', 'manual')$q$, :'ws2')));

-- isolation
select pg_temp.check_equal('[p3] other workspaces see none of these campaigns, stats, maps or runs',
  pg_temp.scalar_as('authenticated', 'a1111111-0000-0000-0000-000000000001',
    $q$select ((select count(*) from campaigns_v2) + (select count(*) from campaign_stats) + (select count(*) from campaign_client_map)
             + (select count(*) from sync_runs) + (select count(*) from get_client_campaigns()))::text$q$), '0');
select pg_temp.check_equal('[p3] anon sees nothing',
  pg_temp.scalar_as('anon', null,
    $q$select ((select count(*) from campaigns_v2) + (select count(*) from campaign_stats) + (select count(*) from campaign_client_map) + (select count(*) from sync_runs))::text$q$), '0');
select pg_temp.check_error('[p3] anon cannot call get_client_campaigns',
  pg_temp.as_role('anon', null, $q$select * from get_client_campaigns()$q$));

-- ── Phase 5: public portal reads V2 ─────────────────────────────────────────
select pg_temp.check_equal('[p5] portal: campaign list comes from V2 (provider name)',
  pg_temp.scalar_as('service_role', null, $q$select string_agg(name, ',') from get_public_campaigns('a0c00000-0000-0000-0000-000000000002')$q$),
  'Pharma');
select pg_temp.check_equal('[p5] portal: campaigns with their latest snapshot',
  pg_temp.scalar_as('service_role', null,
    $q$select name || '/' || status || '/' || emails_sent || '/' || replies_unique from get_public_client_campaigns('a0c00000-0000-0000-0000-000000000002')$q$),
  'Pharma/active/180/9');
select pg_temp.check_equal('[p5] portal: no internal ids or provider payloads are exposed',
  (select (pg_get_function_result('public.get_public_client_campaigns(uuid)'::regprocedure) ~ '(workspace_id|integration_id|external_id|provider_raw|provider_status)')::text),
  'false');
select pg_temp.check_equal('[p5] portal: branding from the workspace',
  pg_temp.scalar_as('service_role', null, $q$select agency_name || '|' || agency_logo_url from get_public_workspace_branding('a0c00000-0000-0000-0000-000000000002')$q$),
  'New Co Branding|https://cdn.example/new.png');
select pg_temp.check_equal('[p5] portal: a client can post a remark on its V2 campaign',
  pg_temp.scalar_as('service_role', null,
    $q$select campaign_id::text from post_public_remark('a0c00000-0000-0000-0000-000000000002', 'a0ca0000-0000-0000-0000-000000000001', 'General', 'Q', 'Question')$q$),
  'a0ca0000-0000-0000-0000-000000000001');
select pg_temp.check_equal('[p5] portal: ...and read it back on that campaign''s timeline',
  pg_temp.scalar_as('service_role', null,
    $q$select string_agg(title, ',') from get_public_remarks('a0c00000-0000-0000-0000-000000000002', 'a0ca0000-0000-0000-0000-000000000001')$q$),
  'Q');
update clients set status = 'paused' where id = 'a0c00000-0000-0000-0000-000000000002';
select pg_temp.check_equal('[p5] portal: a paused client exposes no campaigns, stats or branding',
  pg_temp.scalar_as('service_role', null,
    $q$select ((select count(*) from get_public_campaigns('a0c00000-0000-0000-0000-000000000002'))
             + (select count(*) from get_public_client_campaigns('a0c00000-0000-0000-0000-000000000002'))
             + (select count(*) from get_public_workspace_branding('a0c00000-0000-0000-0000-000000000002')))::text$q$),
  '0');
update clients set status = 'active' where id = 'a0c00000-0000-0000-0000-000000000002';
-- ── deleting really deletes (part 16) ──────────────────────────────────────
-- a throwaway campaign on client 2 with history, steps, a remark and a mailbox
insert into campaigns_v2 (id, workspace_id, integration_id, provider, external_id, name, sender_emails)
  values ('a0ca0000-0000-0000-0000-000000000002', :'ws2', 'a0100000-0000-0000-0000-000000000002', 'instantly', 'ext-2', 'Camp 2', array['solo@gone.example']);
insert into campaign_client_map (campaign_id, client_id) values ('a0ca0000-0000-0000-0000-000000000002', 'a0c00000-0000-0000-0000-000000000002');
insert into campaign_stats (campaign_id, stat_date, emails_sent) values ('a0ca0000-0000-0000-0000-000000000002', '2026-10-01', 10), ('a0ca0000-0000-0000-0000-000000000002', '2026-10-02', 20);
insert into campaign_step_stats (campaign_id, stat_date, step, sent) values ('a0ca0000-0000-0000-0000-000000000002', '2026-10-02', 1, 20);
insert into remarks (client_id, campaign_id, author_type, category, title, body) values ('a0c00000-0000-0000-0000-000000000002', 'a0ca0000-0000-0000-0000-000000000002', 'agency', 'General', 'on camp 2', 'b');
insert into email_accounts (id, workspace_id, integration_id, provider, email) values ('a0e00000-0000-0000-0000-000000000002', :'ws2', 'a0100000-0000-0000-0000-000000000002', 'instantly', 'solo@gone.example');
insert into email_account_stats (account_id, stat_date, sent) values ('a0e00000-0000-0000-0000-000000000002', '2026-10-02', 5);
insert into email_domains (workspace_id, integration_id, domain) values (:'ws2', 'a0100000-0000-0000-0000-000000000002', 'gone.example');
-- campaign 1 (still used by client 2) sends from kept@stay.example
update campaigns_v2 set sender_emails = array['kept@stay.example'] where id = 'a0ca0000-0000-0000-0000-000000000001';
insert into email_accounts (workspace_id, integration_id, provider, email) values (:'ws2', 'a0100000-0000-0000-0000-000000000002', 'instantly', 'kept@stay.example');
insert into email_domains (workspace_id, integration_id, domain) values (:'ws2', 'a0100000-0000-0000-0000-000000000002', 'stay.example');
select pg_temp.check_equal('[del] a member can remove a campaign from a client',
  pg_temp.scalar_as('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$with d as (delete from campaign_client_map where campaign_id = 'a0ca0000-0000-0000-0000-000000000002' returning 1)
       select count(*)::text from d$q$), '1');
select pg_temp.check_equal('[del] ...a campaign no client uses is deleted with its statistics and steps',
  (select count(*)::text from campaigns_v2 where id = 'a0ca0000-0000-0000-0000-000000000002')
  || '/' || (select count(*)::text from campaign_stats where campaign_id = 'a0ca0000-0000-0000-0000-000000000002')
  || '/' || (select count(*)::text from campaign_step_stats where campaign_id = 'a0ca0000-0000-0000-0000-000000000002'),
  '0/0/0');
select pg_temp.check_equal('[del] ...its remark is kept, on the client''s General timeline',
  (select coalesce(campaign_id::text, 'general') from remarks where title = 'on camp 2'), 'general');
select pg_temp.check_equal('[del] ...mailboxes and domains no campaign uses any more are removed; used ones stay',
  (select count(*)::text from email_accounts where email = 'solo@gone.example')
  || '/' || (select count(*)::text from email_account_stats where account_id = 'a0e00000-0000-0000-0000-000000000002')
  || '/' || (select count(*)::text from email_domains where domain = 'gone.example')
  || '/' || (select count(*)::text from email_accounts where email = 'kept@stay.example')
  || '/' || (select count(*)::text from email_domains where domain = 'stay.example'),
  '0/0/0/1/1');

-- a campaign shared by two clients survives losing one of them
insert into clients (id, workspace_id, name, slug) values ('a0c00000-0000-0000-0000-000000000003', :'ws2', 'Second client', 'v2-client-3');
insert into campaign_client_map (campaign_id, client_id) values ('a0ca0000-0000-0000-0000-000000000001', 'a0c00000-0000-0000-0000-000000000003');
select pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
  $q$delete from clients where id = 'a0c00000-0000-0000-0000-000000000003'$q$);
select pg_temp.check_equal('[del] deleting a client keeps a campaign another client still uses, with its history',
  (select count(*)::text from clients where id = 'a0c00000-0000-0000-0000-000000000003')
  || '/' || (select count(*)::text from campaigns_v2 where id = 'a0ca0000-0000-0000-0000-000000000001')
  || '/' || (select count(*)::text from campaign_stats where campaign_id = 'a0ca0000-0000-0000-0000-000000000001'),
  '0/1/2');

-- deleting a client deletes the campaigns only it used
insert into clients (id, workspace_id, name, slug) values ('a0c00000-0000-0000-0000-000000000004', :'ws2', 'Leaving client', 'v2-client-4');
insert into campaigns_v2 (id, workspace_id, integration_id, provider, external_id, name)
  values ('a0ca0000-0000-0000-0000-000000000004', :'ws2', 'a0100000-0000-0000-0000-000000000002', 'instantly', 'ext-4', 'Camp 4');
insert into campaign_client_map (campaign_id, client_id) values ('a0ca0000-0000-0000-0000-000000000004', 'a0c00000-0000-0000-0000-000000000004');
insert into campaign_stats (campaign_id, stat_date, emails_sent) values ('a0ca0000-0000-0000-0000-000000000004', '2026-10-02', 7);
select pg_temp.check_equal('[del] a member deletes a client',
  pg_temp.scalar_as('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$with d as (delete from clients where id = 'a0c00000-0000-0000-0000-000000000004' returning 1) select count(*)::text from d$q$), '1');
select pg_temp.check_equal('[del] ...and its campaigns and statistics are gone from the database',
  (select count(*)::text from campaigns_v2 where id = 'a0ca0000-0000-0000-0000-000000000004')
  || '/' || (select count(*)::text from campaign_stats where campaign_id = 'a0ca0000-0000-0000-0000-000000000004'),
  '0/0');
select pg_temp.check_equal('[del] another workspace cannot delete this workspace''s client',
  coalesce(pg_temp.as_role('authenticated', 'a1111111-0000-0000-0000-000000000001',
    $q$delete from clients where id = 'a0c00000-0000-0000-0000-000000000002'$q$), 'no error')
  || '/' || (select count(*)::text from clients where id = 'a0c00000-0000-0000-0000-000000000002'),
  'no error/1');

-- ── Phase 6: V1 retired ─────────────────────────────────────────────────────
select pg_temp.check_error('[p6] users cannot write the V1 campaigns archive',
  pg_temp.as_role('authenticated', 'a1111111-0000-0000-0000-000000000001',
    $q$insert into campaigns (agency_id, workspace_id, client_id, name) values ('a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a1', 'a0c00000-0000-0000-0000-000000000001', 'x')$q$));
select pg_temp.check_error('[p6] users cannot write agency_details',
  pg_temp.as_role('authenticated', 'a1111111-0000-0000-0000-000000000001',
    $q$update agency_details set agency_name = 'x' where user_id = 'a1111111-0000-0000-0000-000000000001'$q$));
select pg_temp.check_equal('[p6] the demo functions are gone',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('generate_demo_data', 'delete_demo_campaigns', 'get_campaign_data')), '0');
select pg_temp.check_error('[p6] V1 read functions are not callable from the API',
  pg_temp.as_role('authenticated', 'a1111111-0000-0000-0000-000000000001',
    $q$select * from get_clients_with_campaign_count('a1111111-0000-0000-0000-000000000001')$q$));
select pg_temp.check_equal('[p6] no transition triggers remain on the V1 tables',
  (select count(*)::text from pg_trigger where tgname in ('trg_v2_mirror_legacy_campaign', 'trg_sync_workspace_from_agency')), '0');

-- ── Client onboarding + integrations (20261007000100) ───────────────────────
update integrations set api_key_encrypted = 'gcm:ciphertext' where id = 'a0100000-0000-0000-0000-000000000002';
select pg_temp.check_error('[ob] a member cannot read the stored credential (even encrypted)',
  pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$select api_key_encrypted from integrations$q$));
select pg_temp.check_error('[ob] select * on integrations is refused for users (would include the credential)',
  pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002', $q$select * from integrations$q$));
select pg_temp.check_equal('[ob] a member sees that their integration has a credential, nothing more',
  pg_temp.scalar_as('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$select provider || '|' || enabled || '|' || has_credential from integrations where id = 'a0100000-0000-0000-0000-000000000002'$q$),
  'instantly|true|true');
select pg_temp.check_equal('[ob] another workspace does not see it',
  pg_temp.scalar_as('authenticated', 'a1111111-0000-0000-0000-000000000001',
    $q$select count(*)::text from integrations where id = 'a0100000-0000-0000-0000-000000000002'$q$), '0');
select pg_temp.check_error('[ob] users cannot write integrations directly (credentials are server-side only)',
  pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$update integrations set api_key_encrypted = 'x', enabled = false where id = 'a0100000-0000-0000-0000-000000000002'$q$));
select pg_temp.check_error('[ob] users cannot delete integrations',
  pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$delete from integrations where id = 'a0100000-0000-0000-0000-000000000002'$q$));
select pg_temp.check_error('[ob] anon cannot read integrations at all',
  pg_temp.as_role('anon', null, $q$select id from integrations$q$));
-- disconnect = disable + purge the key; campaigns, links and history stay
update integrations set enabled = false, api_key_encrypted = null where id = 'a0100000-0000-0000-0000-000000000002';
select pg_temp.check_equal('[ob] after disconnect the flag reflects the purged key; history is kept',
  (select has_credential::text from integrations where id = 'a0100000-0000-0000-0000-000000000002')
  || '/' || (select count(*)::text from campaign_stats where campaign_id = 'a0ca0000-0000-0000-0000-000000000001'),
  'false/2');
select pg_temp.check_equal('[ob] a member can flag a campaign as no longer available at the provider',
  pg_temp.scalar_as('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$with u as (update campaigns_v2 set unavailable_since = now() where id = 'a0ca0000-0000-0000-0000-000000000001' returning 1)
       select count(*)::text from u$q$), '1');
select pg_temp.check_error('[ob] a client cannot be linked to another workspace''s campaign',
  pg_temp.as_role('authenticated', 'a1111111-0000-0000-0000-000000000001',
    $q$insert into campaign_client_map (campaign_id, client_id, workspace_id) values ('a0ca0000-0000-0000-0000-000000000001', 'a0c00000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a1')$q$));

-- ── Outbound analytics: steps + sending infrastructure ─────────────────────
select pg_temp.check_equal('[an] a member stores a sending account; provider comes from the integration',
  coalesce(pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    format($q$insert into email_accounts (id, workspace_id, integration_id, provider, email, status, warmup_status, warmup_score, daily_limit, provider_raw)
              values ('a0e00000-0000-0000-0000-000000000001', %L, 'a0100000-0000-0000-0000-000000000002', 'x', 'ishaan@send.example', 'active', 'active', 98, 30, '{"status": 1}')$q$, :'ws2')), 'no error'),
  'no error');
select pg_temp.check_equal('[an] the mailbox provider is derived from the integration',
  (select provider from email_accounts where id = 'a0e00000-0000-0000-0000-000000000001'), 'instantly');
select pg_temp.check_error('[an] a mailbox cannot be stored with a credential in its provider payload',
  pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    format($q$insert into email_accounts (workspace_id, integration_id, provider, email, provider_raw)
              values (%L, 'a0100000-0000-0000-0000-000000000002', 'instantly', 'leak@send.example', '{"smtp_password": "x"}')$q$, :'ws2')));
select pg_temp.check_error('[an] mailbox emails are stored lower-case',
  pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    format($q$insert into email_accounts (workspace_id, integration_id, provider, email)
              values (%L, 'a0100000-0000-0000-0000-000000000002', 'instantly', 'Mixed@Send.example')$q$, :'ws2')));
select pg_temp.check_error('[an] a mailbox cannot be stored on another workspace''s integration',
  pg_temp.as_role('authenticated', 'a1111111-0000-0000-0000-000000000001',
    $q$insert into email_accounts (workspace_id, integration_id, provider, email)
       values ('a0000000-0000-0000-0000-0000000000a1', 'a0100000-0000-0000-0000-000000000002', 'instantly', 'x@send.example')$q$));
select pg_temp.check_equal('[an] campaign sends and warmup activity are stored side by side per day',
  coalesce(pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$insert into email_account_stats (account_id, stat_date, captured_at, sent, warmup_sent, warmup_landed_inbox, warmup_landed_spam, warmup_received)
       values ('a0e00000-0000-0000-0000-000000000001', '2026-10-06', '2026-10-07 10:00+00', 25, 40, 39, 1, 38)$q$), 'no error'),
  'no error');
select pg_temp.check_equal('[an] mailbox day: sends and warmup kept apart; workspace derived',
  (select sent || '+' || warmup_sent || '/' || workspace_id from email_account_stats where account_id = 'a0e00000-0000-0000-0000-000000000001'),
  '25+40/' || :'ws2');
update email_account_stats set sent = 1, captured_at = '2026-10-06 09:00+00' where account_id = 'a0e00000-0000-0000-0000-000000000001';
select pg_temp.check_equal('[an] an older capture never replaces a newer one for the same mailbox day',
  (select sent::text from email_account_stats where account_id = 'a0e00000-0000-0000-0000-000000000001'), '25');
select pg_temp.check_equal('[an] step statistics are stored per campaign, step and variant',
  coalesce(pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$insert into campaign_step_stats (campaign_id, stat_date, step, variant, sent, replies_unique)
       values ('a0ca0000-0000-0000-0000-000000000001', '2026-10-06', 1, 'A', 500, 6),
              ('a0ca0000-0000-0000-0000-000000000001', '2026-10-06', 2, '', 300, 2)$q$), 'no error'),
  'no error');
select pg_temp.check_equal('[an] step rows carry the campaign''s workspace',
  (select count(*)::text from campaign_step_stats where workspace_id = :'ws2'), '2');
select pg_temp.check_error('[an] steps are numbered from 1',
  pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$insert into campaign_step_stats (campaign_id, stat_date, step) values ('a0ca0000-0000-0000-0000-000000000001', '2026-10-06', 0)$q$));
select pg_temp.check_equal('[an] a member stores DNS checks for a sending domain',
  coalesce(pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    format($q$insert into email_domains (workspace_id, integration_id, domain, spf, dkim, dmarc, mx)
              values (%L, 'a0100000-0000-0000-0000-000000000002', 'send.example', true, true, false, true)$q$, :'ws2')), 'no error'),
  'no error');
select pg_temp.check_error('[an] users cannot delete mailbox history',
  pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$delete from email_account_stats$q$));
select pg_temp.check_error('[an] users cannot delete step history',
  pg_temp.as_role('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$delete from campaign_step_stats$q$));
select pg_temp.check_equal('[an] other workspaces see no mailboxes, mailbox stats, steps or domains',
  pg_temp.scalar_as('authenticated', 'a1111111-0000-0000-0000-000000000001',
    $q$select ((select count(*) from email_accounts) + (select count(*) from email_account_stats)
             + (select count(*) from campaign_step_stats) + (select count(*) from email_domains))::text$q$), '0');
select pg_temp.check_error('[an] anon cannot read mailboxes',
  pg_temp.as_role('anon', null, $q$select email from email_accounts$q$));
select pg_temp.check_error('[an] anon cannot read step statistics',
  pg_temp.as_role('anon', null, $q$select 1 from campaign_step_stats$q$));
select pg_temp.check_equal('[an] a campaign records its sending accounts',
  pg_temp.scalar_as('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$with u as (update campaigns_v2 set sender_emails = array['ishaan@send.example'] where id = 'a0ca0000-0000-0000-0000-000000000001' returning sender_emails)
       select array_to_string(sender_emails, ',') from u$q$), 'ishaan@send.example');

-- [dh] a new client starts with no domain health status (no implied "Healthy"); an entered one is kept
select pg_temp.check_equal('[dh] a new client has no domain health status until one is entered',
  (select coalesce(domain_health_status, 'null') from clients where id = 'a0c00000-0000-0000-0000-000000000002'), 'null');
select pg_temp.check_equal('[dh] clients.domain_health_status has no column default',
  (select coalesce(column_default, 'none') from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'domain_health_status'), 'none');
select pg_temp.check_equal('[dh] a status the agency enters is stored as entered',
  pg_temp.scalar_as('authenticated', 'a2222222-0000-0000-0000-000000000002',
    $q$with u as (update clients set domain_health_score = 91, domain_health_status = 'Healthy' where id = 'a0c00000-0000-0000-0000-000000000002' returning domain_health_status)
       select domain_health_status from u$q$), 'Healthy');

\echo 'ALL V2 TESTS PASSED'

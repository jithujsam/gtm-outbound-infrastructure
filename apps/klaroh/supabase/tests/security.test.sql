-- Security regression tests for the Klaroh database. Every block raises on
-- failure; run via supabase/tests/run.sh (applies stub + baseline + migrations).
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

-- ── fixtures (as superuser) ─────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'c@example.com');
insert into agency_details (id, user_id, agency_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Agency A'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Agency B');
-- V2: one workspace per agency with its user as owner (what the phase 1 back-fill
-- does for real data; new V1-style agency rows no longer get one automatically)
do $$ begin
  if to_regclass('public.workspaces') is not null then
    insert into workspaces (id, name, legacy_agency_id, plan)
      select id, agency_name, id, plan from agency_details on conflict do nothing;
    insert into workspace_members (workspace_id, user_id, role)
      select id, user_id, 'owner' from agency_details on conflict do nothing;
  end if;
end $$;
insert into clients (id, agency_id, name, slug, status) values
  ('c1000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'Client A',        'client-a', 'active'),
  ('c2000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'Client B paused', 'client-b', 'paused'),
  ('c3000000-0000-0000-0000-00000000000c', 'bbbbbbbb-0000-0000-0000-000000000002', 'Client C',        'client-c', 'active');
insert into campaigns (id, agency_id, client_id, name) values
  ('ca000000-0000-0000-0000-00000000000c', 'bbbbbbbb-0000-0000-0000-000000000002', 'c3000000-0000-0000-0000-00000000000c', 'B campaign');
-- the same campaign in V2 (when the V2 tables exist): agency B's workspace has the same id
do $$ begin
  if to_regclass('public.campaigns_v2') is not null then
    execute $q$
      insert into integrations (id, agency_id, tool, label, enabled) values
        ('1b000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'instantly', 'Instantly', true);
      insert into campaigns_v2 (id, workspace_id, integration_id, provider, external_id, name) values
        ('cb000000-0000-0000-0000-00000000000c', 'bbbbbbbb-0000-0000-0000-000000000002', '1b000000-0000-0000-0000-000000000002', 'instantly', 'b-ext', 'B campaign');
      insert into campaign_client_map (campaign_id, client_id) values
        ('cb000000-0000-0000-0000-00000000000c', 'c3000000-0000-0000-0000-00000000000c');
    $q$;
  end if;
end $$;
insert into remarks (agency_id, client_id, author_type, category, title, body) values
  ('bbbbbbbb-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-00000000000b', 'agency', 'General', 'secret remark', 'paused client data');

-- helper: run a statement under a role; returns null on success, else the error text
create function pg_temp.as_role(p_role text, p_sub text, p_sql text) returns text language plpgsql as $$
begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  begin
    execute p_sql;
  exception when others then
    reset role;
    return sqlstate || ': ' || sqlerrm;
  end;
  reset role;
  return null;
end $$;

create function pg_temp.scalar_as(p_role text, p_sub text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  execute p_sql into v;
  reset role;
  return v;
end $$;

create function pg_temp.expect_error(p_name text, p_err text) returns void language plpgsql as $$
begin
  if p_err is null then raise exception 'FAIL: % (expected an error, got success)', p_name; end if;
  raise notice 'ok: % [%]', p_name, left(p_err, 70);
end $$;

create function pg_temp.expect_equal(p_name text, p_actual text, p_expected text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL: % (expected %, got %)', p_name, p_expected, p_actual;
  end if;
  raise notice 'ok: %', p_name;
end $$;

-- ── remarks: anonymous writes ───────────────────────────────────────────────
select pg_temp.expect_error('anon cannot INSERT into remarks directly',
  pg_temp.as_role('anon', null,
    $q$insert into remarks (client_id, author_type, category, title, body)
       values ('c1000000-0000-0000-0000-00000000000a', 'client', 'General', 't', 'b')$q$));

select pg_temp.expect_error('anon cannot forge agency_id/other tenant via direct insert',
  pg_temp.as_role('anon', null,
    $q$insert into remarks (agency_id, client_id, author_type, category, title, body)
       values ('bbbbbbbb-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-00000000000b', 'client', 'General', 'x', 'y')$q$));

select pg_temp.expect_equal('post_public_remark (no longer API-callable) works for an active client and derives the agency',
  pg_temp.scalar_as('service_role', null,
    $q$select agency_id::text || '/' || author_type
       from post_public_remark('c1000000-0000-0000-0000-00000000000a', null, 'General', 'Hello', 'World')$q$),
  'aaaaaaaa-0000-0000-0000-000000000001/client');

select pg_temp.expect_error('anon cannot post to a paused client',
  pg_temp.as_role('service_role', null,
    $q$select post_public_remark('c2000000-0000-0000-0000-00000000000b', null, 'General', 't', 'b')$q$));

select pg_temp.expect_error('anon cannot post to an unknown client (same error, no probing)',
  pg_temp.as_role('service_role', null,
    $q$select post_public_remark('99999999-9999-9999-9999-999999999999', null, 'General', 't', 'b')$q$));

select pg_temp.expect_error('anon cannot attach another tenant''s campaign to a remark',
  pg_temp.as_role('service_role', null,
    $q$select post_public_remark('c1000000-0000-0000-0000-00000000000a', 'ca000000-0000-0000-0000-00000000000c', 'General', 't', 'b')$q$));
select pg_temp.expect_error('anon cannot attach another tenant''s V2 campaign to a remark',
  pg_temp.as_role('service_role', null,
    $q$select post_public_remark('c1000000-0000-0000-0000-00000000000a', 'cb000000-0000-0000-0000-00000000000c', 'General', 't', 'b')$q$));

select pg_temp.expect_error('invalid category rejected',
  pg_temp.as_role('service_role', null,
    $q$select post_public_remark('c1000000-0000-0000-0000-00000000000a', null, 'Hacked', 't', 'b')$q$));

select pg_temp.expect_error('blank title rejected',
  pg_temp.as_role('service_role', null,
    $q$select post_public_remark('c1000000-0000-0000-0000-00000000000a', null, 'General', '   ', 'b')$q$));

select pg_temp.expect_error('foreign attachment url rejected',
  pg_temp.as_role('service_role', null,
    $q$select post_public_remark('c1000000-0000-0000-0000-00000000000a', null, 'General', 't', 'b', 'https://evil.example/x.pdf', 'x.pdf')$q$));

select pg_temp.expect_error('javascript: attachment url rejected',
  pg_temp.as_role('service_role', null,
    $q$select post_public_remark('c1000000-0000-0000-0000-00000000000a', null, 'General', 't', 'b', 'javascript:alert(1)', 'x')$q$));

select pg_temp.expect_equal('a Klaroh storage attachment url is accepted',
  pg_temp.scalar_as('service_role', null,
    $q$select attachment_name from post_public_remark('c1000000-0000-0000-0000-00000000000a', null, 'General', 't', 'b',
       'https://proj.supabase.co/storage/v1/object/public/remark-attachments/123e4567-e89b-12d3-a456-426614174000.pdf', 'report.pdf')$q$),
  'report.pdf');

-- ── remarks: authenticated agencies ─────────────────────────────────────────
select pg_temp.expect_error('agency A cannot write a remark into agency B''s client',
  pg_temp.as_role('authenticated', '11111111-1111-1111-1111-111111111111',
    $q$insert into remarks (agency_id, client_id, author_type, category, title, body)
       values ('aaaaaaaa-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-00000000000b', 'agency', 'General', 'cross', 'tenant')$q$));

select pg_temp.expect_error('agency A cannot write into B''s ACTIVE client either',
  pg_temp.as_role('authenticated', '11111111-1111-1111-1111-111111111111',
    $q$insert into remarks (client_id, author_type, category, title, body)
       values ('c3000000-0000-0000-0000-00000000000c', 'agency', 'General', 'cross', 'tenant')$q$));

select pg_temp.expect_error('agency A cannot reference B''s campaign on its own client',
  pg_temp.as_role('authenticated', '11111111-1111-1111-1111-111111111111',
    $q$insert into remarks (client_id, campaign_id, author_type, category, title, body)
       values ('c1000000-0000-0000-0000-00000000000a', 'ca000000-0000-0000-0000-00000000000c', 'agency', 'General', 't', 'b')$q$));
select pg_temp.expect_error('agency A cannot reference B''s V2 campaign on its own client',
  pg_temp.as_role('authenticated', '11111111-1111-1111-1111-111111111111',
    $q$insert into remarks (client_id, campaign_id, author_type, category, title, body)
       values ('c1000000-0000-0000-0000-00000000000a', 'cb000000-0000-0000-0000-00000000000c', 'agency', 'General', 't', 'b')$q$));

select pg_temp.expect_equal('agency A can post to its own client; a forged agency_id is overridden',
  pg_temp.scalar_as('authenticated', '11111111-1111-1111-1111-111111111111',
    $q$with ins as (
         insert into remarks (agency_id, client_id, author_type, category, title, body)
         values ('bbbbbbbb-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-00000000000a', 'agency', 'General', 'own', 'client')
         returning agency_id)
       select agency_id::text from ins$q$),
  'aaaaaaaa-0000-0000-0000-000000000001');

select pg_temp.expect_error('an agency cannot post as author_type=client',
  pg_temp.as_role('authenticated', '11111111-1111-1111-1111-111111111111',
    $q$insert into remarks (client_id, author_type, category, title, body)
       values ('c1000000-0000-0000-0000-00000000000a', 'client', 'General', 't', 'b')$q$));

select pg_temp.expect_error('remarks are append-only: agencies cannot UPDATE',
  pg_temp.as_role('authenticated', '11111111-1111-1111-1111-111111111111',
    $q$with u as (update remarks set title = 'edited' where client_id = 'c1000000-0000-0000-0000-00000000000a' returning 1)
       select 1/(select count(*) from u)$q$));

-- ── tenant isolation on reads ───────────────────────────────────────────────
select pg_temp.expect_equal('agency A sees only its own clients',
  pg_temp.scalar_as('authenticated', '11111111-1111-1111-1111-111111111111', $q$select count(*)::text from clients$q$), '1');
select pg_temp.expect_equal('agency A cannot read agency B''s remarks',
  pg_temp.scalar_as('authenticated', '11111111-1111-1111-1111-111111111111',
    $q$select count(*)::text from remarks where agency_id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$), '0');
select pg_temp.expect_equal('anon cannot read clients directly',
  pg_temp.scalar_as('anon', null, $q$select count(*)::text from clients$q$), '0');
select pg_temp.expect_equal('anon cannot read campaigns directly',
  pg_temp.scalar_as('anon', null, $q$select count(*)::text from campaigns$q$), '0');
select pg_temp.expect_equal('anon cannot read remarks directly',
  pg_temp.scalar_as('anon', null, $q$select count(*)::text from remarks$q$), '0');
select pg_temp.expect_error('anon cannot read integrations (encrypted keys)',
  pg_temp.as_role('anon', null, $q$select count(*) from integrations$q$));

-- ── public RPCs: non-active clients expose nothing ──────────────────────────
select pg_temp.expect_equal('get_public_remarks hides a paused client''s remarks',
  pg_temp.scalar_as('service_role', null, $q$select count(*)::text from get_public_remarks('c2000000-0000-0000-0000-00000000000b')$q$), '0');
select pg_temp.expect_equal('get_public_campaigns hides a paused client''s campaigns',
  pg_temp.scalar_as('service_role', null, $q$select count(*)::text from get_public_campaigns('c3000000-0000-0000-0000-00000000000c')$q$), '1');
update clients set status = 'ended' where id = 'c3000000-0000-0000-0000-00000000000c';
select pg_temp.expect_equal('...and an ended client''s campaigns',
  pg_temp.scalar_as('service_role', null, $q$select count(*)::text from get_public_campaigns('c3000000-0000-0000-0000-00000000000c')$q$), '0');
select pg_temp.expect_equal('the portal returns no campaigns, stats or branding for a paused client',
  pg_temp.scalar_as('service_role', null, $q$select ((select count(*) from get_public_client_campaigns('c2000000-0000-0000-0000-00000000000b'))
                                          + (select count(*) from get_public_workspace_branding('c2000000-0000-0000-0000-00000000000b')))::text$q$), '0');
select pg_temp.expect_error('the retired V1 get_public_campaign_data is not callable',
  pg_temp.as_role('anon', null, $q$select * from get_public_campaign_data('c1000000-0000-0000-0000-00000000000a')$q$));
select pg_temp.expect_equal('get_public_client_by_slug withholds the name of a paused client',
  pg_temp.scalar_as('service_role', null, $q$select '[' || name || ']/' || status from get_public_client_by_slug('client-b')$q$), '[]/paused');

select pg_temp.expect_equal('the portal keeps the branding of an active client with NO campaigns',
  pg_temp.scalar_as('service_role', null,
    $q$select agency_name || '/' || (select count(*) from get_public_client_campaigns('c1000000-0000-0000-0000-00000000000a'))::text
       from get_public_workspace_branding('c1000000-0000-0000-0000-00000000000a')$q$),
  'Agency A/0');

-- ── agency_details: billing fields (V1 archive: read-only for users) ────────
-- (action and assertion are separate statements so the check sees the write)
select pg_temp.expect_error('a user cannot write agency_details (read-only archive)',
  pg_temp.as_role('authenticated', '11111111-1111-1111-1111-111111111111',
    $q$update agency_details set plan = 'pro' where user_id = '11111111-1111-1111-1111-111111111111'$q$));
select pg_temp.expect_equal('...so the plan is unchanged (a user cannot upgrade themselves)',
  (select plan from agency_details where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'trial');
select pg_temp.expect_equal('...and the owner can still read their archived agency profile',
  pg_temp.scalar_as('authenticated', '11111111-1111-1111-1111-111111111111', $q$select agency_name from agency_details$q$), 'Agency A');

select pg_temp.as_role('authenticated', '11111111-1111-1111-1111-111111111111',
  $q$update agency_details set created_at = now() + interval '1 year' where user_id = '11111111-1111-1111-1111-111111111111'$q$);
select pg_temp.expect_equal('a user cannot reset their trial clock',
  (select (created_at < now() + interval '1 day')::text from agency_details where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'true');

select pg_temp.as_role('authenticated', '33333333-3333-3333-3333-333333333333',
  $q$insert into agency_details (user_id, plan) values ('33333333-3333-3333-3333-333333333333', 'pro')$q$);
select pg_temp.expect_equal('a user cannot self-insert an agency row (with plan=pro or otherwise)',
  (select count(*)::text from agency_details where user_id = '33333333-3333-3333-3333-333333333333'), '0');

-- a non-trial plan value the live constraint accepts (baseline: standard; production: growth)
select case when exists (select 1 from pg_constraint where conname = 'agency_details_plan_check' and pg_get_constraintdef(oid) like '%growth%')
            then 'growth' else 'standard' end as test_plan \gset

select pg_temp.expect_equal('service_role plan update does not error',
  coalesce(pg_temp.as_role('service_role', null,
    format($q$update agency_details set plan = %L where id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$, :'test_plan')), 'no error'),
  'no error');
select pg_temp.expect_equal('...and service_role CAN change the plan',
  (select plan from agency_details where id = 'aaaaaaaa-0000-0000-0000-000000000001'), :'test_plan');

select pg_temp.expect_error('a user cannot change agency_details.user_id to take over another account',
  pg_temp.as_role('authenticated', '11111111-1111-1111-1111-111111111111',
    $q$update agency_details set user_id = '22222222-2222-2222-2222-222222222222' where user_id = '11111111-1111-1111-1111-111111111111'$q$));

-- ── integrations / functions ────────────────────────────────────────────────
insert into integrations (agency_id, tool, label, enabled) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'instantly', 'Instantly', true);
select pg_temp.expect_error('a second Instantly integration per agency is rejected',
  pg_temp.as_role('service_role', '11111111-1111-1111-1111-111111111111',
    $q$insert into integrations (agency_id, tool, label, enabled) values ('aaaaaaaa-0000-0000-0000-000000000001', 'instantly', 'Instantly', true)$q$));

select pg_temp.expect_error('anon cannot call check_rate_limit',
  pg_temp.as_role('anon', null, $q$select check_rate_limit('k', 1, 60)$q$));
select pg_temp.expect_error('authenticated cannot call check_rate_limit',
  pg_temp.as_role('authenticated', '11111111-1111-1111-1111-111111111111', $q$select check_rate_limit('k', 1, 60)$q$));
select pg_temp.expect_equal('service_role can call check_rate_limit',
  pg_temp.scalar_as('service_role', null, $q$select check_rate_limit('test-key', 1, 60)::text$q$), 'true');
select pg_temp.expect_equal('...and the limiter actually limits',
  pg_temp.scalar_as('service_role', null, $q$select check_rate_limit('test-key', 1, 60)::text$q$), 'false');

\echo 'ALL DATABASE SECURITY TESTS PASSED'

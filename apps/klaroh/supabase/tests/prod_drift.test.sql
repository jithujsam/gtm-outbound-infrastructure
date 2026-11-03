-- Runs AFTER the hardening migration on a database that has the production
-- drift (see prod_drift_fixture.sql). Every block raises on failure.
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

insert into auth.users (id, email) values ('99999999-9999-9999-9999-999999999991', 'drift@example.com');
insert into agency_details (id, user_id, agency_name) values
  ('dddddddd-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999991', 'Drift Agency');
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
insert into clients (id, agency_id, name, slug, status, client_email) values
  ('d1000000-0000-0000-0000-00000000000a', 'dddddddd-0000-0000-0000-000000000001', 'Drift Client', 'drift-client', 'active', 'secret-client@example.com');
insert into campaigns (agency_id, client_id, name) values
  ('dddddddd-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-00000000000a', 'Drift campaign');

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

select pg_temp.check_equal('[prod drift] anon can no longer read ALL clients (blanket policy removed)',
  pg_temp.scalar_as('anon', null, $q$select count(*)::text from clients$q$), '0');
select pg_temp.check_equal('[prod drift] anon can no longer read ALL campaigns (blanket policy removed)',
  pg_temp.scalar_as('anon', null, $q$select count(*)::text from campaigns$q$), '0');
select pg_temp.check_equal('[prod drift] anon cannot read client_email',
  pg_temp.scalar_as('anon', null, $q$select count(client_email)::text from clients$q$), '0');
select pg_temp.check_equal('[prod drift] no SELECT policy with USING (true) remains on any table',
  (select count(*)::text from pg_policies where schemaname = 'public' and qual = 'true' and cmd in ('SELECT', 'ALL')), '0');

select pg_temp.check_equal('[prod drift] anon cannot call the dead SECURITY DEFINER get_campaign_data()',
  (pg_temp.as_role('anon', null, $q$select * from get_campaign_data('99999999-9999-9999-9999-999999999991', 'd1000000-0000-0000-0000-00000000000a')$q$) is not null)::text, 'true');
select pg_temp.check_equal('[prod drift] authenticated cannot call it either',
  (pg_temp.as_role('authenticated', '99999999-9999-9999-9999-999999999991', $q$select * from get_campaign_data('99999999-9999-9999-9999-999999999991', 'd1000000-0000-0000-0000-00000000000a')$q$) is not null)::text, 'true');

select pg_temp.check_equal('[prod drift] the Pause toggle now works (status paused accepted)',
  coalesce(pg_temp.as_role('authenticated', '99999999-9999-9999-9999-999999999991',
    $q$update clients set status = 'paused' where id = 'd1000000-0000-0000-0000-00000000000a'$q$), 'no error'), 'no error');
select pg_temp.check_equal('...and a paused client is hidden from the public portal',
  pg_temp.scalar_as('service_role', null, $q$select ((select count(*) from get_public_client_campaigns('d1000000-0000-0000-0000-00000000000a'))
                                          + (select count(*) from get_public_workspace_branding('d1000000-0000-0000-0000-00000000000a')))::text$q$), '0');
update clients set status = 'active' where id = 'd1000000-0000-0000-0000-00000000000a';
select pg_temp.check_equal('[prod drift] public portal still works for an active client',
  pg_temp.scalar_as('service_role', null, $q$select agency_name from get_public_workspace_branding('d1000000-0000-0000-0000-00000000000a')$q$), 'Drift Agency');
select pg_temp.check_equal('[prod drift] anonymous remark posting works on the drifted schema',
  pg_temp.scalar_as('service_role', null, $q$select title from post_public_remark('d1000000-0000-0000-0000-00000000000a', null, 'General', 'Hi', 'there')$q$), 'Hi');

\echo 'ALL PRODUCTION-DRIFT TESTS PASSED'

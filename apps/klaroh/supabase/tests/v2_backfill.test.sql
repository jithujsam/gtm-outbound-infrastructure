-- V2 back-fill tests: run on a database that had realistic V1 data
-- (tests/v1_fixture.sql) BEFORE the V2 migrations were applied (twice).
-- Every block raises on failure.
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

create function pg_temp.check_equal(p_name text, p_actual text, p_expected text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then raise exception 'FAIL: % (expected %, got %)', p_name, p_expected, p_actual; end if;
  raise notice 'ok: %', p_name;
end $$;

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
create function pg_temp.check_error(p_name text, p_err text) returns void language plpgsql as $$
begin
  if p_err is null then raise exception 'FAIL: % (expected an error, got success)', p_name; end if;
  raise notice 'ok: % [%]', p_name, left(p_err, 70);
end $$;
-- latest snapshot of one campaign (superuser view of the read model)
create function pg_temp.get_client_campaigns_admin_check(p_campaign_id uuid) returns setof campaign_stats language sql as $$
  select * from campaign_stats where campaign_id = p_campaign_id order by stat_date desc, captured_at desc limit 1
$$;

-- ── Phase 1: workspaces ─────────────────────────────────────────────────────
select pg_temp.check_equal('every agency has exactly one workspace',
  (select count(*)::text from agency_details ad
    where (select count(*) from workspaces w where w.legacy_agency_id = ad.id) <> 1), '0');
select pg_temp.check_equal('workspace profile copied from the agency',
  (select name || '|' || website || '|' || logo_url || '|' || plan from workspaces where legacy_agency_id = 'fa000000-0000-0000-0000-000000000001'),
  'Fixture Agency One|https://one.example|https://cdn.example/one.png|trial');
select pg_temp.check_equal('every migrated workspace has its agency user as owner',
  (select count(*)::text from agency_details ad
    where not exists (select 1 from workspace_members m join workspaces w on w.id = m.workspace_id
                      where w.legacy_agency_id = ad.id and m.user_id = ad.user_id and m.role = 'owner')), '0');
select pg_temp.check_equal('no client, integration, remark or V1 campaign is left without a workspace',
  ((select count(*) from clients where workspace_id is null)
   + (select count(*) from integrations where workspace_id is null)
   + (select count(*) from remarks where workspace_id is null)
   + (select count(*) from campaigns where workspace_id is null))::text, '0');
select pg_temp.check_equal('workspace_id matches the agency for every client',
  (select count(*)::text from clients c join workspaces w on w.id = c.workspace_id
    where w.legacy_agency_id is distinct from c.agency_id), '0');
select pg_temp.check_equal('existing customer rows preserved (3 clients, 1 integration, 4 remarks, 4 V1 campaigns)',
  (select count(*) from clients)::text || '/' || (select count(*) from integrations)::text || '/' ||
  (select count(*) from remarks)::text || '/' || (select count(*) from campaigns)::text, '3/1/4/4');
select pg_temp.check_equal('integration provider back-filled from tool',
  (select provider from integrations where id = 'f1000000-0000-0000-0000-000000000001'), 'instantly');
select pg_temp.check_equal('migrations are idempotent: still one workspace per agency after the re-run',
  (select count(*)::text from workspaces), '2');

-- ── Phase 4: V1 Instantly campaigns → V2 ────────────────────────────────────
select pg_temp.check_equal('[p4] each Instantly campaign became exactly one V2 campaign; the demo campaign did not',
  (select string_agg(external_id, ',' order by external_id) from campaigns_v2), 'inst-x,inst-y');
select pg_temp.check_equal('[p4] the oldest V1 row''s id is reused as the V2 id',
  (select id::text from campaigns_v2 where external_id = 'inst-x'), 'fd000000-0000-0000-0000-00000000000a');
select pg_temp.check_equal('[p4] the same Instantly campaign on two clients is one campaign mapped to both',
  (select string_agg(cl.name, ',' order by cl.name) from campaign_client_map m join clients cl on cl.id = m.client_id
    where m.campaign_id = 'fd000000-0000-0000-0000-00000000000a'), 'Acme,Globex');
select pg_temp.check_equal('[p4] every V1 Instantly row is recorded in the legacy map, with its client-specific name',
  (select string_agg(legacy_name, ' | ' order by legacy_campaign_id) from campaign_legacy_map), 'Acme Q3 push | Globex view of X | Y campaign');
select pg_temp.check_equal('[p4] the provider name is the campaign name; the agency''s old name stays only in the legacy map',
  (select name || ' / ' || coalesce(display_name, '-') from campaigns_v2 where external_id = 'inst-x'), 'Q3 Outbound X / -');
select pg_temp.check_equal('[p4] statuses normalized (1 → active, 2 → paused)',
  (select string_agg(status || ':' || provider_status, ',' order by external_id) from campaigns_v2), 'active:1,paused:2');
select pg_temp.check_equal('[p4] campaign config copied',
  (select sender_count || '/' || daily_limit from campaigns_v2 where external_id = 'inst-x'), '3/150');
select pg_temp.check_equal('[p4] one historical snapshot per campaign, dated at the V1 sync',
  (select string_agg(c.external_id || '@' || s.stat_date::text, ',' order by c.external_id)
     from campaign_stats s join campaigns_v2 c on c.id = s.campaign_id), 'inst-x@2026-09-30,inst-y@2026-09-29');
select pg_temp.check_equal('[p4] V1 and V2 show the same numbers for every migrated campaign',
  (select count(*)::text from campaigns v1
     join campaign_legacy_map m on m.legacy_campaign_id = v1.id
     join pg_temp.get_client_campaigns_admin_check(m.campaign_id) s on true
    where (s.emails_sent, s.leads, s.contacted, s.replies_unique, s.opens_unique, s.opportunities, s.interested, s.meetings_booked)
          is distinct from
          (coalesce(v1.emails_sent_count, v1.emails_sent)::bigint, v1.leads_count::bigint, v1.contacted_count::bigint,
           v1.reply_count_unique::bigint, v1.open_count_unique::bigint, v1.total_opportunities::bigint,
           v1.total_interested::bigint, v1.total_meeting_booked::bigint)), '0');
select pg_temp.check_equal('[p4] values the V1 row did not have stay null in V2 (no fabricated zeros)',
  (select coalesce(s.bounces::text, 'null') from campaign_stats s join campaigns_v2 c on c.id = s.campaign_id where c.external_id = 'inst-y'), 'null');
select pg_temp.check_equal('[p4] one backfill sync run recorded for the integration',
  (select string_agg(triggered_by || ':' || status || ':' || campaigns_upserted || ':' || stats_written, ',') from sync_runs), 'backfill:success:2:2');
select pg_temp.check_equal('[p4] remark on the canonical V1 row keeps pointing at the same campaign',
  (select campaign_id::text || '/' || legacy_campaign_id::text from remarks where id = 'fe000000-0000-0000-0000-000000000002'),
  'fd000000-0000-0000-0000-00000000000a/fd000000-0000-0000-0000-00000000000a');
select pg_temp.check_equal('[p4] remark on the duplicate V1 row now points at the V2 campaign (original id kept)',
  (select campaign_id::text || '/' || legacy_campaign_id::text from remarks where id = 'fe000000-0000-0000-0000-000000000003'),
  'fd000000-0000-0000-0000-00000000000a/fd000000-0000-0000-0000-00000000000b');
select pg_temp.check_equal('[p4] remark on the un-migrated demo campaign is kept, on the General timeline, original id kept',
  (select coalesce(campaign_id::text, 'general') || '/' || legacy_campaign_id::text || '/' || title from remarks where id = 'fe000000-0000-0000-0000-000000000004'),
  'general/fd000000-0000-0000-0000-00000000000d/Demo remark');
select pg_temp.check_equal('[p4] all remark texts preserved',
  (select string_agg(title, '|' order by created_at) from remarks), 'Kick-off|X update (Acme)|X update (Globex)|Demo remark');
select pg_temp.check_equal('[p4] the V1 campaigns table is untouched (archive)',
  (select count(*)::text || '/' || string_agg(name, '|' order by id) from campaigns),
  '4/Acme Q3 push|Globex view of X|Y campaign|Demo campaign');

-- the owner reads their client's campaigns through the V2 read model
select pg_temp.check_equal('[p4] the owner sees Acme''s campaigns from V2, by their provider names',
  pg_temp.scalar_as('authenticated', 'f1111111-0000-0000-0000-000000000001',
    $q$select string_agg(name || '=' || emails_sent, ',' order by name) from get_client_campaigns('fc000000-0000-0000-0000-000000000001')$q$),
  'Q3 Outbound X=2400,Y campaign=160');

-- remark trigger translates a V1 campaign id (old links) to the V2 campaign
select pg_temp.check_equal('[p4] a remark posted with a V1 campaign id lands on the V2 campaign',
  pg_temp.scalar_as('authenticated', 'f1111111-0000-0000-0000-000000000001',
    $q$with ins as (insert into remarks (client_id, campaign_id, author_type, category, title, body)
       values ('fc000000-0000-0000-0000-000000000002', 'fd000000-0000-0000-0000-00000000000b', 'agency', 'General', 'via old id', 'b')
       returning campaign_id) select campaign_id::text from ins$q$),
  'fd000000-0000-0000-0000-00000000000a');
select pg_temp.check_error('[p4] a remark cannot reference a campaign not attached to that client',
  pg_temp.as_role('authenticated', 'f1111111-0000-0000-0000-000000000001',
    $q$insert into remarks (client_id, campaign_id, author_type, category, title, body)
       values ('fc000000-0000-0000-0000-000000000002', 'fd000000-0000-0000-0000-00000000000c', 'agency', 'General', 'x', 'y')$q$));

-- transition import (what the deploy-window mirror trigger ran): an old app
-- version writing V1 rows still fed V2
insert into campaigns (id, agency_id, client_id, integration_id, external_id, name, tool, source, emails_sent_count, last_synced, created_at)
values ('fd000000-0000-0000-0000-00000000000e', 'fa000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002',
        'f1000000-0000-0000-0000-000000000001', 'inst-z', 'Z', 'instantly', 'instantly', 50, '2026-10-01 10:00+00', '2026-10-01 09:00+00');
select pg_temp.check_equal('[p6] after retirement, V1 writes are no longer mirrored into V2',
  (select count(*)::text from campaigns_v2 where external_id = 'inst-z'), '0');
select public.v2_import_legacy_campaign('fd000000-0000-0000-0000-00000000000e');
select pg_temp.check_equal('[p4] the transition import adds a V1 row to V2 with its client',
  (select c.name || '/' || (select count(*) from campaign_client_map m where m.campaign_id = c.id)::text from campaigns_v2 c where external_id = 'inst-z'), 'Z/1');
update campaigns set emails_sent_count = 75, last_synced = '2026-10-02 10:00+00' where id = 'fd000000-0000-0000-0000-00000000000e';
select public.v2_import_legacy_campaign('fd000000-0000-0000-0000-00000000000e');
select pg_temp.check_equal('[p4] a later V1 metric update adds a V2 snapshot (history kept)',
  (select string_agg(s.stat_date::text || '=' || s.emails_sent, ',' order by s.stat_date)
     from campaign_stats s join campaigns_v2 c on c.id = s.campaign_id where c.external_id = 'inst-z'),
  '2026-10-01=50,2026-10-02=75');

-- ── Phase 5: the portal shows the migrated data ─────────────────────────────
select pg_temp.check_equal('[p5] portal for Acme lists both migrated campaigns',
  pg_temp.scalar_as('service_role', null, $q$select string_agg(name, ',' order by name) from get_public_campaigns('fc000000-0000-0000-0000-000000000001')$q$),
  'Q3 Outbound X,Y campaign');
select pg_temp.check_equal('[p5] portal numbers equal the V1 numbers',
  pg_temp.scalar_as('service_role', null, $q$select string_agg(name || '=' || emails_sent || '/' || opportunities, ',' order by name) from get_public_client_campaigns('fc000000-0000-0000-0000-000000000001')$q$),
  'Q3 Outbound X=2400/9,Y campaign=160/1');
select pg_temp.check_equal('[p5] Globex (the duplicate V1 row) sees the same campaign X, never another client''s old name',
  pg_temp.scalar_as('service_role', null, $q$select string_agg(name, ',' order by name) from get_public_campaigns('fc000000-0000-0000-0000-000000000002')$q$),
  'Q3 Outbound X,Z');
select pg_temp.check_equal('[p5] the remark posted on Globex''s duplicate row shows on Globex''s campaign timeline',
  pg_temp.scalar_as('service_role', null, $q$select string_agg(title, ',' order by title) from get_public_remarks('fc000000-0000-0000-0000-000000000002', 'fd000000-0000-0000-0000-00000000000a')$q$),
  'X update (Globex),via old id');

-- ── Phase 6: V1 is a read-only archive; nothing was lost ────────────────────
select pg_temp.check_equal('[p6] every V1 row is still there (agencies, clients, integrations, remarks, campaigns)',
  (select count(*) from agency_details)::text || '/' || (select count(*) from clients)::text || '/' ||
  (select count(*) from integrations)::text || '/' || (select count(*) from remarks)::text || '/' ||
  (select count(*) from campaigns)::text, '2/3/1/5/5');
select pg_temp.check_equal('[p6] the owner can still read their V1 archive',
  pg_temp.scalar_as('authenticated', 'f1111111-0000-0000-0000-000000000001', $q$select count(*)::text from campaigns$q$), '4');
select pg_temp.check_error('[p6] ...but cannot write to it',
  pg_temp.as_role('authenticated', 'f1111111-0000-0000-0000-000000000001',
    $q$update campaigns set name = 'x' where id = 'fd000000-0000-0000-0000-00000000000a'$q$));
select pg_temp.check_equal('[p6] the encrypted integration key is untouched',
  (select api_key_encrypted from integrations where id = 'f1000000-0000-0000-0000-000000000001'), 'ciphertext-not-a-real-key');

\echo 'ALL V2 BACK-FILL TESTS PASSED'

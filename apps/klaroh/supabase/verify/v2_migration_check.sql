-- Klaroh V2 migration check — READ-ONLY. Changes nothing.
--
-- Run in the Supabase SQL Editor after applying manual-apply/v2/ parts 01–11.
-- Every row should show ok = true. A row with ok = false names what to look at;
-- `detail` explains it. (Run again after part 12.)

with
agencies_without_workspace as (
  select count(*) as n from agency_details ad
  where not exists (select 1 from workspaces w where w.legacy_agency_id = ad.id)
),
agencies_without_owner as (
  select count(*) as n from agency_details ad
  join workspaces w on w.legacy_agency_id = ad.id
  where not exists (select 1 from workspace_members m
                    where m.workspace_id = w.id and m.user_id = ad.user_id and m.role = 'owner')
),
orphans as (
  select (select count(*) from clients where workspace_id is null)
       + (select count(*) from integrations where workspace_id is null)
       + (select count(*) from remarks where workspace_id is null) as n
),
v1_instantly as (
  select id, integration_id, external_id from campaigns
  where coalesce(tool, source) = 'instantly'
),
v1_instantly_migrated as (
  select count(*) as n from v1_instantly v join campaign_legacy_map m on m.legacy_campaign_id = v.id
),
v1_instantly_skipped as (
  select count(*) as n from v1_instantly v
  where not exists (select 1 from campaign_legacy_map m where m.legacy_campaign_id = v.id)
),
latest as (
  select distinct on (campaign_id) campaign_id, emails_sent, leads, contacted, replies_unique, opportunities
  from campaign_stats order by campaign_id, stat_date, captured_at
),
number_mismatches as (
  -- compares each migrated V1 row with the FIRST (migrated) V2 snapshot
  select count(*) as n
  from campaigns v1
  join campaign_legacy_map m on m.legacy_campaign_id = v1.id
  join latest s on s.campaign_id = m.campaign_id
  where (s.emails_sent, s.leads, s.contacted, s.replies_unique, s.opportunities)
        is distinct from
        (coalesce(v1.emails_sent_count, v1.emails_sent)::bigint, v1.leads_count::bigint,
         v1.contacted_count::bigint, v1.reply_count_unique::bigint, v1.total_opportunities::bigint)
    and coalesce(v1.leads_count, v1.contacted_count, v1.emails_sent_count, v1.open_count_unique,
                 v1.reply_count_unique, v1.total_opportunities, v1.bounced_count) is not null
),
links_missing as (
  select count(*) as n from campaigns v1
  join campaign_legacy_map m on m.legacy_campaign_id = v1.id
  where not exists (select 1 from campaign_client_map cm where cm.campaign_id = m.campaign_id and cm.client_id = v1.client_id)
),
remarks_on_missing_campaign as (
  select count(*) as n from remarks r
  where r.campaign_id is not null and not exists (select 1 from campaigns_v2 c where c.id = r.campaign_id)
),
remarks_moved_to_general as (
  select count(*) as n from remarks where campaign_id is null and legacy_campaign_id is not null
)
select 'every agency has a workspace' as check, n = 0 as ok, n || ' agencies without a workspace' as detail from agencies_without_workspace
union all select 'every workspace has its agency user as owner', n = 0, n || ' missing owners' from agencies_without_owner
union all select 'no client / integration / remark without a workspace', n = 0, n || ' rows' from orphans
union all select 'V1 Instantly campaigns migrated to V2', true, n || ' V1 rows migrated' from v1_instantly_migrated
union all select 'V1 Instantly campaigns NOT migrated (no integration or Instantly id on the V1 row)', n = 0,
                 n || ' rows kept only in the V1 archive' from v1_instantly_skipped
union all select 'V1 and V2 numbers match for migrated campaigns', n = 0, n || ' mismatches' from number_mismatches
union all select 'every V1 client link exists in V2', n = 0, n || ' missing links' from links_missing
union all select 'no remark points at a missing campaign', n = 0, n || ' remarks' from remarks_on_missing_campaign
union all select 'remarks moved to the General timeline (their V1 campaign was demo/not migrated)', true,
                 n || ' remarks (original campaign id kept in legacy_campaign_id)' from remarks_moved_to_general
union all select 'V2 campaigns / snapshots / sync runs', true,
                 (select count(*) from campaigns_v2) || ' campaigns, ' || (select count(*) from campaign_stats)
                 || ' snapshots, ' || (select count(*) from sync_runs) || ' sync runs';

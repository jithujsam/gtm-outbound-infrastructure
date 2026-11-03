-- Klaroh provider-campaign-name check — READ-ONLY. Changes nothing.
--
-- Run in the Supabase SQL Editor after manual-apply/v2/14_provider_campaign_name_1of1.sql.
-- Every row should show ok = true.

select 'no campaign carries a Klaroh-side name override' as check,
       not exists (select 1 from public.campaigns_v2 where display_name is not null) as ok,
       'campaigns_v2.display_name is retired (always null)' as detail
union all
select 'display_name cannot be set again',
       exists (select 1 from pg_trigger where tgname = 'trg_campaigns_v2_provider_name'
               and tgrelid = 'public.campaigns_v2'::regclass and not tgisinternal),
       'trigger trg_campaigns_v2_provider_name'
union all
select 'read models return the provider name',
       not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public'
                     and p.proname in ('get_client_campaigns', 'get_public_campaigns', 'get_public_client_campaigns')
                     and p.prosrc like '%display_name%'),
       'get_client_campaigns / get_public_campaigns / get_public_client_campaigns'
union all
select 'stored name matches the last provider payload',
       not exists (select 1 from public.campaigns_v2
                   where provider_raw ? 'name' and provider_raw->>'name' is distinct from name),
       'campaigns_v2.name = provider_raw.name for every synced campaign'
union all
select 'every campaign keeps its client links and statistics',
       not exists (select 1 from public.campaign_legacy_map l
                   where not exists (select 1 from public.campaigns_v2 c where c.id = l.campaign_id)),
       'no campaign referenced by the V1 map is missing';

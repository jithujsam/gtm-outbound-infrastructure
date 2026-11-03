-- Klaroh client-onboarding check — READ-ONLY. Changes nothing.
--
-- Run in the Supabase SQL Editor after manual-apply/v2/13_client_onboarding_integrations_1of1.sql.
-- Every row should show ok = true.

select 'signed-in users cannot read the stored credential' as check,
       not has_column_privilege('authenticated', 'public.integrations', 'api_key_encrypted', 'SELECT') as ok,
       'expected: no SELECT on integrations.api_key_encrypted for authenticated' as detail
union all
select 'signed-in users cannot write integrations directly',
       not (has_table_privilege('authenticated', 'public.integrations', 'INSERT')
            or has_table_privilege('authenticated', 'public.integrations', 'UPDATE')
            or has_table_privilege('authenticated', 'public.integrations', 'DELETE')),
       'the server writes credentials with the service role'
union all
select 'anon has no access to integrations',
       not has_table_privilege('anon', 'public.integrations', 'SELECT'),
       ''
union all
select 'members can read integration status columns',
       has_column_privilege('authenticated', 'public.integrations', 'has_credential', 'SELECT')
       and has_column_privilege('authenticated', 'public.integrations', 'enabled', 'SELECT'),
       ''
union all
select 'has_credential matches the stored key on every row',
       not exists (select 1 from public.integrations where has_credential is distinct from (api_key_encrypted is not null)),
       ''
union all
select 'campaigns_v2.unavailable_since exists',
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'campaigns_v2' and column_name = 'unavailable_since'),
       ''
union all
select 'every stored campaign is used by a client (nothing imported beyond selections)',
       not exists (select 1 from public.campaigns_v2 c
                   where not exists (select 1 from public.campaign_client_map m where m.campaign_id = c.id)),
       'campaigns removed from every client stay (history) and are no longer synced; false here is informational';

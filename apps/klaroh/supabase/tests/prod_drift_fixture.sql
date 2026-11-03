-- Reproduces the DIFFERENCES found on the real production database (from its
-- fingerprint) on top of the baseline, so migrations are tested against what
-- production actually looks like. TEST USE ONLY. Applied before the hardening
-- migration by tests/run.sh.

-- blanket public read policies that production still has
create policy "clients_public"   on clients   for select using (true);
create policy "campaigns_public" on campaigns for select using (true);

-- get_campaign_data is SECURITY DEFINER on production
alter function get_campaign_data(uuid, uuid) security definer set search_path = public;

-- production's client status check only allows active/inactive
alter table clients drop constraint clients_status_check;
alter table clients add constraint clients_status_check check (status in ('active', 'inactive'));

-- production's plan check uses the prototype plan names
alter table agency_details drop constraint agency_details_plan_check;
alter table agency_details add constraint agency_details_plan_check check (plan in ('trial', 'solo', 'growth', 'agency'));

-- production has no updated_at on clients/campaigns, and no updated_at triggers on clients/campaigns/integrations
drop trigger update_clients_updated_at on clients;
drop trigger update_campaigns_updated_at on campaigns;
drop trigger update_integrations_updated_at on integrations;
alter table clients   drop column updated_at;
alter table campaigns drop column updated_at;

-- stricter NOT NULLs / defaults seen on production
alter table campaigns alter column week_1_leads set not null, alter column week_2_leads set not null,
  alter column week_3_leads set not null, alter column week_4_leads set not null,
  alter column open_rate set not null, alter column reply_rate set not null,
  alter column positive_reply_rate set not null, alter column emails_sent set not null;
alter table campaigns alter column name set default 'Campaign';
alter table integrations alter column label set default '', alter column label set not null;

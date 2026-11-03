-- Realistic V1 data, loaded BEFORE the V2 migrations by tests/run.sh, so the
-- V2 back-fill is tested against the shape production really has: agencies,
-- clients, an Instantly integration, Instantly campaigns (including the same
-- Instantly campaign attached to two clients), a legacy demo campaign, and
-- remarks pointing at each of them. TEST USE ONLY.

insert into auth.users (id, email) values
  ('f1111111-0000-0000-0000-000000000001', 'owner1@example.com'),
  ('f2222222-0000-0000-0000-000000000002', 'owner2@example.com');

insert into agency_details (id, user_id, agency_name, agency_website, agency_logo_url, plan) values
  ('fa000000-0000-0000-0000-000000000001', 'f1111111-0000-0000-0000-000000000001', 'Fixture Agency One', 'https://one.example', 'https://cdn.example/one.png', 'trial'),
  ('fa000000-0000-0000-0000-000000000002', 'f2222222-0000-0000-0000-000000000002', 'Fixture Agency Two', null, null, 'trial');

insert into clients (id, agency_id, name, slug, status, client_email) values
  ('fc000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', 'Acme',    'fx-acme',    'active', 'acme@example.com'),
  ('fc000000-0000-0000-0000-000000000002', 'fa000000-0000-0000-0000-000000000001', 'Globex',  'fx-globex',  'active', null),
  ('fc000000-0000-0000-0000-000000000003', 'fa000000-0000-0000-0000-000000000002', 'Initech', 'fx-initech', 'active', null);

insert into integrations (id, agency_id, tool, label, enabled, api_key_encrypted) values
  ('f1000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', 'instantly', 'Instantly', true, 'ciphertext-not-a-real-key');

-- Instantly campaign X attached to Acme (older) and to Globex (newer); Y on Acme only.
insert into campaigns (id, agency_id, client_id, integration_id, external_id, name, tool, source,
                       external_name, external_status, external_sender_count, external_daily_limit,
                       leads_count, contacted_count, emails_sent_count, emails_sent, open_count_unique,
                       reply_count, reply_count_unique, bounced_count, unsubscribed_count,
                       total_opportunities, total_opportunity_value, total_interested, total_meeting_booked,
                       open_rate, reply_rate, last_synced, created_at) values
  ('fd000000-0000-0000-0000-00000000000a', 'fa000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001',
   'f1000000-0000-0000-0000-000000000001', 'inst-x', 'Acme Q3 push', 'instantly', 'instantly',
   'Q3 Outbound X', 1, 3, 150, 1200, 900, 2400, 2400, 400, 60, 45, 12, 3, 9, 4500.00, 7, 4,
   44.44, 5.00, '2026-09-30 10:00:00+00', '2026-09-01 09:00:00+00'),
  ('fd000000-0000-0000-0000-00000000000b', 'fa000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002',
   'f1000000-0000-0000-0000-000000000001', 'inst-x', 'Globex view of X', 'instantly', 'instantly',
   'Q3 Outbound X', 1, 3, 150, 1200, 900, 2400, 2400, 400, 60, 45, 12, 3, 9, 4500.00, 7, 4,
   44.44, 5.00, '2026-09-30 10:00:00+00', '2026-09-05 09:00:00+00'),
  ('fd000000-0000-0000-0000-00000000000c', 'fa000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001',
   'f1000000-0000-0000-0000-000000000001', 'inst-y', 'Y campaign', 'instantly', 'instantly',
   'Y campaign', 2, 1, 50, 100, 80, 160, 160, 20, 5, 4, null, null, 1, 0, 1, 0,
   25.00, 5.00, '2026-09-29 08:00:00+00', '2026-09-10 09:00:00+00');

-- Legacy demo campaign on Initech (fake data: never migrated into V2).
insert into campaigns (id, agency_id, client_id, name, tool, source, emails_sent, week_1_leads, week_2_leads)
values ('fd000000-0000-0000-0000-00000000000d', 'fa000000-0000-0000-0000-000000000002', 'fc000000-0000-0000-0000-000000000003',
        'Demo campaign', 'demo', 'demo', 3240, 8, 3);

insert into remarks (id, agency_id, client_id, campaign_id, author_type, category, title, body, created_at) values
  ('fe000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001', null,
   'agency', 'General', 'Kick-off', 'General remark', '2026-09-02 09:00:00+00'),
  ('fe000000-0000-0000-0000-000000000002', 'fa000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-00000000000a',
   'agency', 'Campaign Update', 'X update (Acme)', 'On the canonical row', '2026-09-03 09:00:00+00'),
  ('fe000000-0000-0000-0000-000000000003', 'fa000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002', 'fd000000-0000-0000-0000-00000000000b',
   'agency', 'Campaign Update', 'X update (Globex)', 'On the duplicate row', '2026-09-06 09:00:00+00'),
  ('fe000000-0000-0000-0000-000000000004', 'fa000000-0000-0000-0000-000000000002', 'fc000000-0000-0000-0000-000000000003', 'fd000000-0000-0000-0000-00000000000d',
   'client', 'General', 'Demo remark', 'On the demo campaign', '2026-09-07 09:00:00+00');

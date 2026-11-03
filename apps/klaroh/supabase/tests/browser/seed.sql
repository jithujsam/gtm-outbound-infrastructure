-- Browser-check fixture: one agency workspace with realistic analytics history.
-- Applied after every migration on a throw-away database (see run.sh). Edge
-- cases on purpose: a mailbox in error, one with poor warmup, one that stopped
-- sending, a campaign without meeting data, a campaign with zero sends, and a
-- domain failing DMARC.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values ('b0000000-0000-0000-0000-000000000001', 'owner@agency.example');
insert into workspaces (id, name) values ('b0000000-0000-0000-0000-0000000000a1', 'Clospect');
insert into workspace_members (workspace_id, user_id, role) values ('b0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-000000000001', 'owner');

-- an unrelated workspace whose data must never show up
insert into auth.users (id, email) values ('b0000000-0000-0000-0000-000000000002', 'other@agency.example');
insert into workspaces (id, name) values ('b0000000-0000-0000-0000-0000000000a2', 'Other agency');
insert into workspace_members (workspace_id, user_id, role) values ('b0000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-000000000002', 'owner');

insert into clients (id, workspace_id, name, slug, status) values
  ('b0c00000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000a1', 'Vish Hire', 'vish-hire', 'active'),
  ('b0c00000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-0000000000a1', 'Northwind Capital', 'northwind', 'active'),
  ('b0c00000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-0000000000a2', 'SECRET OTHER CLIENT', 'secret-other', 'active');

insert into integrations (id, workspace_id, provider, tool, label, enabled, api_key_encrypted) values
  ('b0100000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000a1', 'instantly', 'instantly', 'Instantly', true, 'not-a-real-key'),
  ('b0100000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-0000000000a2', 'instantly', 'instantly', 'Instantly', true, 'not-a-real-key');

-- campaigns: (id suffix, name, status, start, daily sends, reply ‰, meetings?, client)
create temp table seed_campaigns (n int, name text, status text, created date, sends int, reply_permille int, meetings boolean, client int);
insert into seed_campaigns values
  (1, 'Pharma', 'paused', current_date - 40, 45, 12, true, 1),
  (2, 'Semicon', 'completed', current_date - 50, 40, 4, true, 1),
  (3, 'Defence and Aviation', 'active', current_date - 25, 30, 9, true, 1),
  (4, 'D2C', 'active', current_date - 20, 35, 6, false, 2),
  (5, 'Fintech, BFSI', 'active', current_date - 12, 55, 7, true, 2),
  (6, 'Draft – Q4 Logistics', 'draft', current_date - 2, 0, 0, true, 2);

insert into campaigns_v2 (id, workspace_id, integration_id, provider, external_id, name, status, provider_status,
                          sender_count, daily_limit, start_date, external_created_at, last_synced_at, sender_emails)
select ('b0ca0000-0000-0000-0000-00000000000' || n)::uuid, 'b0000000-0000-0000-0000-0000000000a1', 'b0100000-0000-0000-0000-000000000001',
       'instantly', 'ext-' || n, name, status, '1', 3, 180, created, created::timestamptz, now(),
       case when n % 2 = 1 then array['ishaan@vishhire.example', 'i.davar@vishhire.example', 'ishaan@vishrecruiter.example']
            else array['ops@northwind-mail.example', 'team@northwind-mail.example', 'ishaan@vishhire.example'] end
from seed_campaigns;

insert into campaign_client_map (campaign_id, client_id)
select ('b0ca0000-0000-0000-0000-00000000000' || n)::uuid, ('b0c00000-0000-0000-0000-00000000000' || client)::uuid from seed_campaigns;

-- other workspace: one campaign that must stay invisible
insert into campaigns_v2 (id, workspace_id, integration_id, provider, external_id, name, status)
values ('b0ca0000-0000-0000-0000-000000000099', 'b0000000-0000-0000-0000-0000000000a2', 'b0100000-0000-0000-0000-000000000009', 'instantly', 'ext-x', 'SECRET OTHER CAMPAIGN', 'active');
insert into campaign_client_map (campaign_id, client_id) values ('b0ca0000-0000-0000-0000-000000000099', 'b0c00000-0000-0000-0000-000000000009');

-- daily cumulative snapshots; a 4-day gap ~2 weeks ago; meetings only reported from 20 days ago
insert into campaign_stats (campaign_id, workspace_id, stat_date, captured_at, leads, contacted, new_leads_contacted, emails_sent,
                            opens, opens_unique, replies, replies_unique, clicks, clicks_unique, bounces, unsubscribes, completed,
                            opportunities, opportunity_value, interested, meetings_booked, meetings_completed, closed)
select ('b0ca0000-0000-0000-0000-00000000000' || c.n)::uuid, 'b0000000-0000-0000-0000-0000000000a1', d::date, d + interval '18 hours',
       500 + c.n * 120,
       floor(c.sends * k * 0.92), floor(c.sends * k * 0.55), c.sends * k,
       0, 0,
       floor(c.sends * k * c.reply_permille / 1000.0 * 1.15), floor(c.sends * k * c.reply_permille / 1000.0),
       0, 0, floor(c.sends * k * 0.012), floor(c.sends * k * 0.002), floor(c.sends * k * 0.1),
       floor(c.sends * k * c.reply_permille / 1000.0 * 0.35), floor(c.sends * k * c.reply_permille / 1000.0 * 0.35) * 750,
       case when c.meetings and d >= current_date - 20 then floor(c.sends * k * c.reply_permille / 1000.0 * 0.5) end,
       case when c.meetings and d >= current_date - 20 then floor(c.sends * k * c.reply_permille / 1000.0 * 0.25) end,
       case when c.meetings and d >= current_date - 20 then floor(c.sends * k * c.reply_permille / 1000.0 * 0.18) end,
       case when c.meetings and d >= current_date - 20 then floor(c.sends * k * c.reply_permille / 1000.0 * 0.06) end
from seed_campaigns c,
     generate_series(greatest(c.created, current_date - 34), current_date - 1, interval '1 day') d,
     lateral (select (d::date - c.created + 1) as k) kk
where d::date not between current_date - 16 and current_date - 13;

-- steps (Pharma: A/B on step 1; Fintech: three plain steps)
insert into campaign_step_stats (campaign_id, workspace_id, stat_date, captured_at, step, variant, sent, replies, replies_unique, opportunities) values
  ('b0ca0000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000a1', current_date - 1, now(), 1, 'A', 640, 11, 9, 3),
  ('b0ca0000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000a1', current_date - 1, now(), 1, 'B', 620, 6, 5, 1),
  ('b0ca0000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000a1', current_date - 1, now(), 2, '', 480, 9, 8, 2),
  ('b0ca0000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000a1', current_date - 1, now(), 3, '', 31, 2, 2, 0),
  ('b0ca0000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-0000000000a1', current_date - 1, now(), 1, '', 330, 3, 3, 1),
  ('b0ca0000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-0000000000a1', current_date - 1, now(), 2, '', 210, 2, 2, 0);

-- mailboxes
insert into email_accounts (id, workspace_id, integration_id, provider, email, status, provider_status, warmup_status, provider_warmup_status,
                            warmup_score, daily_limit, sending_gap_minutes, tracking_domain, tracking_domain_status, last_used_at, provider_raw)
values
  ('b0e00000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000a1', 'b0100000-0000-0000-0000-000000000001', 'instantly', 'ishaan@vishhire.example', 'active', '1', 'active', '1', 100, 30, 10, 'track.vishhire.example', 'verified', now() - interval '3 hours', '{"status": 1}'),
  ('b0e00000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-0000000000a1', 'b0100000-0000-0000-0000-000000000001', 'instantly', 'i.davar@vishhire.example', 'active', '1', 'active', '1', 98, 30, 10, 'track.vishhire.example', 'verified', now() - interval '5 hours', '{"status": 1}'),
  ('b0e00000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-0000000000a1', 'b0100000-0000-0000-0000-000000000001', 'instantly', 'ishaan@vishrecruiter.example', 'active', '1', 'active', '1', 62, 30, 10, null, null, now() - interval '1 day', '{"status": 1}'),
  ('b0e00000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-0000000000a1', 'b0100000-0000-0000-0000-000000000001', 'instantly', 'ops@northwind-mail.example', 'error', '-3', 'paused', '0', null, 40, 15, null, null, now() - interval '9 days', '{"status": -3}'),
  ('b0e00000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-0000000000a1', 'b0100000-0000-0000-0000-000000000001', 'instantly', 'team@northwind-mail.example', 'active', '1', 'active', '1', 91, 40, 15, null, null, now() - interval '6 days', '{"status": 1}'),
  ('b0e00000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-0000000000a2', 'b0100000-0000-0000-0000-000000000009', 'instantly', 'secret@other.example', 'active', '1', 'active', '1', 100, 30, 10, null, null, now(), null);

insert into email_account_stats (account_id, workspace_id, stat_date, captured_at, sent, bounced, replies,
                                 warmup_sent, warmup_landed_inbox, warmup_landed_spam, warmup_received)
select a.id, 'b0000000-0000-0000-0000-0000000000a1', d::date, now(),
       case
         when a.n = 4 and d::date > current_date - 9 then 0        -- error mailbox stopped
         when a.n = 5 and d::date > current_date - 6 then 0        -- stopped sending
         when a.n = 2 then 6 + (extract(day from d)::int % 3)       -- underused
         else 24 + (extract(day from d)::int % 7) end,
       case when a.n = 3 then 2 else (extract(day from d)::int % 3 = 0)::int end,
       (extract(day from d)::int % 4 = 0)::int,
       case when a.n = 4 then null else 35 + (extract(day from d)::int % 6) end,
       case when a.n = 4 then null when a.n = 3 then 28 else 34 + (extract(day from d)::int % 6) end,
       case when a.n = 4 then null when a.n = 3 then 7 else 1 end,
       case when a.n = 4 then null else 30 end
from (values ('b0e00000-0000-0000-0000-000000000001'::uuid, 1), ('b0e00000-0000-0000-0000-000000000002'::uuid, 2),
             ('b0e00000-0000-0000-0000-000000000003'::uuid, 3), ('b0e00000-0000-0000-0000-000000000004'::uuid, 4),
             ('b0e00000-0000-0000-0000-000000000005'::uuid, 5)) a(id, n),
     generate_series(current_date - 29, current_date - 1, interval '1 day') d;

insert into email_domains (workspace_id, integration_id, domain, spf, dkim, dmarc, mx, checked_at) values
  ('b0000000-0000-0000-0000-0000000000a1', 'b0100000-0000-0000-0000-000000000001', 'vishhire.example', true, true, true, true, now()),
  ('b0000000-0000-0000-0000-0000000000a1', 'b0100000-0000-0000-0000-000000000001', 'vishrecruiter.example', true, true, false, true, now()),
  ('b0000000-0000-0000-0000-0000000000a1', 'b0100000-0000-0000-0000-000000000001', 'northwind-mail.example', true, true, true, true, now());

insert into sync_runs (workspace_id, integration_id, provider, triggered_by, status, started_at, finished_at, details)
values ('b0000000-0000-0000-0000-0000000000a1', 'b0100000-0000-0000-0000-000000000001', 'instantly', 'cron', 'success', now() - interval '1 hour', now() - interval '59 minutes',
        '{"outcomes": "ok", "extras": "done", "steps": "ok", "accounts": "ok", "accountDaily": "ok", "warmup": "ok", "domains": "ok"}');

-- ── client portal (20261008000300) ─────────────────────────────────────────
-- Known tokens so the check can open each report. Scenarios: Vish Hire (3 campaigns,
-- detailed view, USD economics), Northwind (simple view, costs in two currencies),
-- Fresh Start (one young campaign: not enough data yet, healthy mailboxes),
-- Empty Co (no campaigns).
insert into clients (id, workspace_id, name, slug, status) values
  ('b0c00000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-0000000000a1', 'Fresh Start', 'fresh-start', 'active'),
  ('b0c00000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-0000000000a1', 'Empty Co', 'empty-co', 'active');
insert into campaigns_v2 (id, workspace_id, integration_id, provider, external_id, name, status, start_date, external_created_at, last_synced_at, sender_emails)
values ('b0ca0000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-0000000000a1', 'b0100000-0000-0000-0000-000000000001', 'instantly', 'ext-7',
        'Healthcare pilot', 'active', current_date - 3, now() - interval '3 days', now(), array['ishaan@vishhire.example', 'i.davar@vishhire.example']);
insert into campaign_client_map (campaign_id, client_id) values ('b0ca0000-0000-0000-0000-000000000007', 'b0c00000-0000-0000-0000-000000000003');
insert into campaign_stats (campaign_id, stat_date, captured_at, emails_sent, new_leads_contacted, replies_unique, opportunities, bounces) values
  ('b0ca0000-0000-0000-0000-000000000007', current_date - 2, now() - interval '2 days', 40, 20, 0, 0, 0),
  ('b0ca0000-0000-0000-0000-000000000007', current_date - 1, now() - interval '1 day', 95, 46, 1, 0, 1);

update client_portals set access_token = repeat('0123456789abcdef', 4) where client_id = 'b0c00000-0000-0000-0000-000000000001';
update client_portals set access_token = repeat('fedcba9876543210', 4), mode = 'simple' where client_id = 'b0c00000-0000-0000-0000-000000000002';
update client_portals set access_token = repeat('1', 64) where client_id = 'b0c00000-0000-0000-0000-000000000003';
update client_portals set access_token = repeat('2', 64) where client_id = 'b0c00000-0000-0000-0000-000000000004';

insert into campaign_economics (campaign_id, client_id, currency, cost, value_per_positive) values
  ('b0ca0000-0000-0000-0000-000000000001', 'b0c00000-0000-0000-0000-000000000001', 'USD', 1500, 400),
  ('b0ca0000-0000-0000-0000-000000000003', 'b0c00000-0000-0000-0000-000000000001', 'USD', 1200, 400),
  ('b0ca0000-0000-0000-0000-000000000004', 'b0c00000-0000-0000-0000-000000000002', 'EUR', 2000, null),
  ('b0ca0000-0000-0000-0000-000000000005', 'b0c00000-0000-0000-0000-000000000002', 'GBP', 1800, null);

-- ── Inbox (20261008000400) ──────────────────────────────────────────────────
-- Conversations on Vish Hire (Pharma, Defence) and Northwind (D2C): positive,
-- not interested, a question without a status, and an out-of-office.
insert into reply_sync_runs (workspace_id, integration_id, triggered_by, status, started_at, finished_at, messages_seen, messages_stored, threads_updated, details)
values ('b0000000-0000-0000-0000-0000000000a1', 'b0100000-0000-0000-0000-000000000001', 'cron', 'success', now() - interval '50 minutes', now() - interval '49 minutes', 9, 9, 7, '{"pages": 1, "backlog": false}');

insert into reply_threads (id, campaign_id, provider_thread_id, lead_external_id, lead_email, lead_name, lead_company, interest, subject) values
  ('b0f00000-0000-0000-0000-000000000001', 'b0ca0000-0000-0000-0000-000000000001', 'th-1', 'l-1', 'john.smith@acmepharma.example', 'John Smith', 'Acme Pharma', 'interested', 'Re: Hiring senior regulatory leads'),
  ('b0f00000-0000-0000-0000-000000000002', 'b0ca0000-0000-0000-0000-000000000001', 'th-2', 'l-2', 'priya@examplebio.example', 'Priya Rao', 'Example Bio', 'meeting_booked', 'Re: Hiring senior regulatory leads'),
  ('b0f00000-0000-0000-0000-000000000003', 'b0ca0000-0000-0000-0000-000000000001', 'th-3', 'l-3', 'mark.lee@novapharm.example', 'Mark Lee', 'NovaPharm', 'not_interested', 'Re: Hiring senior regulatory leads'),
  ('b0f00000-0000-0000-0000-000000000004', 'b0ca0000-0000-0000-0000-000000000001', 'th-4', 'l-4', 'away@medico.example', 'Lena Fischer', 'Medico', 'out_of_office', 'Automatic reply: Hiring senior regulatory leads'),
  ('b0f00000-0000-0000-0000-000000000005', 'b0ca0000-0000-0000-0000-000000000003', 'th-5', 'l-5', 'sarah.thomas@aerodyne.example', 'Sarah Thomas', 'Aerodyne Systems', 'interested', 'Re: Avionics engineers for your Q1 programme'),
  ('b0f00000-0000-0000-0000-000000000006', 'b0ca0000-0000-0000-0000-000000000003', 'th-6', 'l-6', 'r.patel@gmail.com', 'Raj Patel', null, null, 'Re: Avionics engineers for your Q1 programme'),
  ('b0f00000-0000-0000-0000-000000000007', 'b0ca0000-0000-0000-0000-000000000004', 'th-7', 'l-7', 'emma@brightbrands.example', 'Emma Clarke', 'Bright Brands', 'interested', 'Re: Growing your D2C team');

insert into reply_messages (thread_id, provider_message_id, sent_at, is_auto_reply, from_email, from_name, subject, body) values
  ('b0f00000-0000-0000-0000-000000000001', 'm-1', now() - interval '3 days 4 hours', false, 'john.smith@acmepharma.example', 'John Smith', 'Re: Hiring senior regulatory leads',
   E'Hi Ishaan,\n\nThanks for reaching out. We are actually looking to bring on two senior regulatory affairs leads in the next quarter.\n\nWhat does your process look like?'),
  ('b0f00000-0000-0000-0000-000000000001', 'm-2', now() - interval '1 day 2 hours', false, 'john.smith@acmepharma.example', 'John Smith', 'Re: Hiring senior regulatory leads',
   E'Yes, this looks interesting. Can we schedule a call on Thursday afternoon? I''ll bring our Head of Quality.\n\nBest,\nJohn'),
  ('b0f00000-0000-0000-0000-000000000002', 'm-3', now() - interval '2 days', false, 'priya@examplebio.example', 'Priya Rao', 'Re: Hiring senior regulatory leads',
   E'Happy to talk. I''ve booked Tuesday 10:00 through your link.'),
  ('b0f00000-0000-0000-0000-000000000003', 'm-4', now() - interval '4 days', false, 'mark.lee@novapharm.example', 'Mark Lee', 'Re: Hiring senior regulatory leads',
   E'Not a priority for us this year, thanks.'),
  ('b0f00000-0000-0000-0000-000000000004', 'm-5', now() - interval '5 days', true, 'away@medico.example', 'Lena Fischer', 'Automatic reply: Hiring senior regulatory leads',
   E'I am out of the office until 20 October with limited access to email.'),
  ('b0f00000-0000-0000-0000-000000000005', 'm-6', now() - interval '6 hours', false, 'sarah.thomas@aerodyne.example', 'Sarah Thomas', 'Re: Avionics engineers for your Q1 programme',
   E'Can you send me more details on the candidates you have for flight-control software? We have three open roles.'),
  ('b0f00000-0000-0000-0000-000000000006', 'm-7', now() - interval '1 day', false, 'r.patel@gmail.com', 'Raj Patel', 'Re: Avionics engineers for your Q1 programme',
   E'Who is your client exactly? I''d need to know more before passing this on.'),
  ('b0f00000-0000-0000-0000-000000000006', 'm-8', now() - interval '20 hours', true, 'r.patel@gmail.com', 'Raj Patel', 'Automatic reply: travelling',
   E'I am travelling and will reply next week.'),
  ('b0f00000-0000-0000-0000-000000000007', 'm-9', now() - interval '2 days 5 hours', false, 'emma@brightbrands.example', 'Emma Clarke', 'Re: Growing your D2C team',
   E'Interesting timing — we''re hiring a growth lead. Send over a couple of profiles?');

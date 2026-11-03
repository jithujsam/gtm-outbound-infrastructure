import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITY_WINDOW_DAYS,
  attentionDetail,
  campaignStatusInfo,
  latestTimestamp,
  needsAttention,
  providerLabel,
  recentActivity,
  sourcesLabel,
  toCampaignView,
  trackingSummary,
} from '../campaign-view.ts';
import { countsFromRow, metricSet } from '../analytics/metrics.ts';

const row = (over: Record<string, unknown> = {}) => ({
  campaign_id: 'c1',
  client_id: 'cl1',
  name: 'Pharma',
  provider_name: 'Pharma',
  provider: 'instantly',
  status: 'active',
  contacted: 300,
  emails_sent: '900',
  opens_unique: 100,
  replies_unique: 7,
  bounces: null,
  opportunities: null,
  leads: 1000,
  captured_at: '2026-10-06T09:00:00Z',
  ...over,
});

test('toCampaignView maps read-model rows; numeric strings become numbers, nulls stay null', () => {
  const v = toCampaignView(row());
  assert.equal(v.id, 'c1');
  assert.equal(v.name, 'Pharma');
  assert.equal(v.provider_name, 'Pharma');
  assert.equal(v.emails_sent, 900);
  assert.equal(v.bounces, null);
  assert.equal(v.status, 'active');
  assert.equal(toCampaignView(row({ status: 'weird' })).status, 'unknown');
});

test('client views feed CampaignView rows into the shared metric layer (same numbers as the Overview)', () => {
  const v = toCampaignView(row({ new_leads_contacted: 200 }));
  assert.deepEqual(countsFromRow(v), { emailsSent: 900, prospectsContacted: 200, humanReplies: 7, positive: null, bounces: null });
  const set = metricSet([countsFromRow(v)]);
  assert.equal(set.rates.replyRate, (7 / 200) * 100, 'human replies ÷ prospects contacted (not ÷ contacted or ÷ emails sent)');
  assert.equal(set.rates.positiveRate, null, 'unreported positive is never 0');
});

test('several client campaigns aggregate by summing counts, never by averaging rates', () => {
  const rows = [
    toCampaignView(row({ campaign_id: 'a', new_leads_contacted: 100, replies_unique: 10 })),
    toCampaignView(row({ campaign_id: 'b', new_leads_contacted: 900, replies_unique: 9 })),
  ];
  assert.equal(metricSet(rows.map(countsFromRow)).rates.replyRate, 1.9);
});

test('status, attention and provider labels are provider-neutral', () => {
  assert.equal(campaignStatusInfo('error').label, 'Needs attention');
  assert.equal(needsAttention('suspended'), true);
  assert.equal(needsAttention('paused'), false);
  assert.equal(providerLabel('instantly'), 'Instantly');
  assert.equal(providerLabel(null), 'No source');
  assert.equal(sourcesLabel([toCampaignView(row())]), 'Instantly');
  assert.equal(sourcesLabel([]), 'No source');
});

test('latestTimestamp prefers the snapshot capture time', () => {
  const a = toCampaignView(row({ captured_at: '2026-10-05T00:00:00Z' }));
  const b = toCampaignView(row({ captured_at: null, last_synced_at: '2026-10-06T00:00:00Z' }));
  assert.equal(latestTimestamp([a, b]), '2026-10-06T00:00:00Z');
  assert.equal(latestTimestamp([]), null);
});

test('attention wording repeats the provider state and never diagnoses a mailbox problem', () => {
  assert.equal(attentionDetail('error'), 'The provider reports an error');
  assert.equal(attentionDetail('suspended'), 'Suspended by the provider');
  for (const s of ['draft', 'active', 'paused', 'completed', 'unknown'] as const) assert.equal(attentionDetail(s), null);
  for (const s of ['error', 'suspended'] as const) {
    assert.equal(needsAttention(s), true);
    assert.doesNotMatch(attentionDetail(s)!, /mailbox|health|operational/i);
  }
});

test('the client summary is a campaign count, not a health claim', () => {
  assert.equal(trackingSummary(1, 1), '1 campaign, 1 live');
  assert.equal(trackingSummary(3, 0), '3 campaigns, 0 live');
  assert.doesNotMatch(trackingSummary(5, 5), /operational|healthy|all systems/i);
});

test('recent activity uses campaign start dates only, within the window', () => {
  const today = '2026-10-10';
  const rows = [
    toCampaignView(row({ campaign_id: 'a', name: 'Recent', start_date: '2026-10-08' })),
    toCampaignView(row({ campaign_id: 'b', name: 'Edge', start_date: '2026-09-27' })), // day 14 of the window
    toCampaignView(row({ campaign_id: 'c', name: 'Old', start_date: '2026-09-26' })),
    toCampaignView(row({ campaign_id: 'd', name: 'Future', start_date: '2026-10-11' })),
    // no start date: creation and last-update times are not start times
    toCampaignView(row({ campaign_id: 'e', name: 'Created only', start_date: null, external_created_at: '2026-10-09T10:00:00Z' })),
    // paused campaign: no pause event, because the pause time is not stored
    toCampaignView(row({ campaign_id: 'f', name: 'Paused', status: 'paused', start_date: null, external_updated_at: '2026-10-09T10:00:00Z' })),
  ];
  const items = recentActivity(rows, today);
  assert.equal(ACTIVITY_WINDOW_DAYS, 14);
  assert.deepEqual(items, [
    { id: 'start-a', day: '2026-10-08', text: 'Campaign started: Recent' },
    { id: 'start-b', day: '2026-09-27', text: 'Campaign started: Edge' },
  ]);
  assert.ok(items.every((i) => !/paused|sync/i.test(i.text)));
});

test('recent activity is newest first, capped, and empty without start dates', () => {
  const rows = Array.from({ length: 9 }, (_, i) =>
    toCampaignView(row({ campaign_id: `c${i}`, name: `C${i}`, start_date: `2026-10-0${i + 1}` }))
  );
  const items = recentActivity(rows, '2026-10-10');
  assert.equal(items.length, 7);
  assert.equal(items[0].day, '2026-10-09');
  assert.equal(items[6].day, '2026-10-03');
  assert.deepEqual(recentActivity([toCampaignView(row({ start_date: null }))], '2026-10-10'), []);
  assert.deepEqual(recentActivity([], '2026-10-10'), []);
});

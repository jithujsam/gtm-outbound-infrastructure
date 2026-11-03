import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInstantlyAdapter } from '../providers/instantly/adapter.ts';
import {
  normalizeInstantlyCampaign,
  normalizeInstantlyStats,
  normalizeInstantlyStatus,
} from '../providers/instantly/normalize.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(handler: (url: string) => { status?: number; body: unknown }): string[] {
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    const reply = handler(url);
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
  }) as typeof fetch;
  return urls;
}

const adapter = createInstantlyAdapter({ maxRetries: 0 });

test('status codes map to provider-neutral statuses', () => {
  assert.equal(normalizeInstantlyStatus(0), 'draft');
  assert.equal(normalizeInstantlyStatus(1), 'active');
  assert.equal(normalizeInstantlyStatus(2), 'paused');
  assert.equal(normalizeInstantlyStatus(3), 'completed');
  assert.equal(normalizeInstantlyStatus(4), 'active');
  assert.equal(normalizeInstantlyStatus(-1), 'error');
  assert.equal(normalizeInstantlyStatus(-2), 'error');
  assert.equal(normalizeInstantlyStatus(-99), 'suspended');
  assert.equal(normalizeInstantlyStatus(77), 'unknown');
  assert.equal(normalizeInstantlyStatus(undefined), 'unknown');
});

test('campaign normalization: Klaroh field names, cleaned dates, raw kept without email copy', () => {
  const raw = { id: 'c1', name: 'Q3', status: 2, sequences: [{ body: 'secret copy' }], pl_value: 5 };
  const n = normalizeInstantlyCampaign(
    {
      campaign_id: 'c1',
      campaign_name: 'Q3',
      campaign_status: 2,
      campaign_sender_count: 3,
      campaign_daily_limit: 49.6,
      campaign_start_date: '2026-09-01T00:00:00.000Z',
      campaign_end_date: 'not a date',
      campaign_created_at: '2026-08-31T10:00:00Z',
    },
    raw
  );
  assert.equal(n.externalId, 'c1');
  assert.equal(n.status, 'paused');
  assert.equal(n.providerStatus, '2');
  assert.equal(n.senderCount, 3);
  assert.equal(n.dailyLimit, 50);
  assert.equal(n.startDate, '2026-09-01');
  assert.equal(n.endDate, null);
  assert.equal(n.externalCreatedAt, '2026-08-31T10:00:00.000Z');
  assert.deepEqual(n.providerRaw, { id: 'c1', name: 'Q3', status: 2, pl_value: 5 });
});

test('stats normalization: missing values stay null (never fabricated zeros)', () => {
  const s = normalizeInstantlyStats(
    { campaign_id: 'c1', emails_sent_count: 900, reply_count_unique: 7.2, total_opportunity_value: 10.005 },
    { campaign_id: 'c1', emails_sent_count: 900 }
  );
  assert.equal(s.externalId, 'c1');
  assert.equal(s.metrics.emailsSent, 900);
  assert.equal(s.metrics.repliesUnique, 7);
  assert.equal(s.metrics.opportunityValue, 10.01);
  assert.equal(s.metrics.bounces, null);
  assert.equal(s.metrics.leads, null);
  assert.deepEqual(s.providerRaw, { campaign_id: 'c1', emails_sent_count: 900 });
});

test('adapter.listCampaigns pages through every campaign and normalizes them', async () => {
  const page1 = Array.from({ length: 100 }, (_, i) => ({ id: `c${i}`, name: `C${i}`, status: 1 }));
  const page2 = [{ id: 'c100', name: 'Last', status: 3 }];
  const urls = stubFetch((url) =>
    url.includes('starting_after=cur1')
      ? { body: { items: page2 } }
      : { body: { items: page1, next_starting_after: 'cur1' } }
  );
  const res = await adapter.listCampaigns('key-123456789012345678');
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.data.length, 101);
    assert.equal(res.data[100].externalId, 'c100');
    assert.equal(res.data[100].status, 'completed');
    assert.deepEqual(res.data[100].providerRaw, { id: 'c100', name: 'Last', status: 3 });
  }
  assert.equal(urls.length, 2);
});

test('adapter.fetchStats keeps the raw analytics row as provider_raw', async () => {
  stubFetch(() => ({ body: [{ campaign_id: 'c1', leads_count: 10, new_metric_from_instantly: 3 }] }));
  const res = await adapter.fetchStats('key');
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.data[0].metrics.leads, 10);
    assert.equal(res.data[0].providerRaw?.new_metric_from_instantly, 3);
  }
});

test('adapter errors are returned (not thrown) and made user-safe', async () => {
  stubFetch(() => ({ status: 401, body: { message: 'Invalid API key' } }));
  const res = await adapter.listCampaigns('bad');
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.status, 401);
    assert.equal(adapter.userSafeError(res.error, 'x'), 'Your Instantly API key is invalid or revoked.');
  }
  const v = await adapter.validateCredentials('bad');
  assert.equal(v.ok, false);
});

// Shapes taken from a real Instantly v2 response (identifiers anonymised).
const LIVE_CAMPAIGN = {
  id: 'a3296b00-0000-0000-0000-000000000000',
  name: 'Pharma',
  status: 2,
  daily_limit: 180,
  email_gap: 15,
  pl_value: 2000,
  email_list: ['a@send1.example', 'b@send1.example', 'c@send2.example'],
  campaign_schedule: { start_date: null, end_date: null, schedules: [] },
  timestamp_created: '2026-09-15T04:47:24.071Z',
  timestamp_updated: '2026-10-01T06:42:24.163Z',
};
const LIVE_ANALYTICS = {
  campaign_id: 'a3296b00-0000-0000-0000-000000000000',
  campaign_name: 'Pharma',
  campaign_status: 2,
  leads_count: 0,
  contacted_count: 865,
  new_leads_contacted_count: 439,
  emails_sent_count: 865,
  open_count: 0,
  open_count_unique: 0,
  reply_count: 11,
  reply_count_unique: 9,
  reply_count_automatic: 4,
  link_click_count: 0,
  link_click_count_unique: 0,
  bounced_count: 7,
  unsubscribed_count: 0,
  completed_count: 0,
  total_opportunities: 5,
  total_opportunity_value: 3900,
};

test('the provider campaign name is taken verbatim as the campaign name', async () => {
  stubFetch(() => ({ body: { items: [LIVE_CAMPAIGN] } }));
  const res = await adapter.listCampaigns('key');
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.data[0].name, 'Pharma');
    assert.equal(res.data[0].externalId, LIVE_CAMPAIGN.id, 'the provider id is the stable identity');
  }
});

test('mailboxes (email IDs) are sending infrastructure: a sender count, never leads', async () => {
  stubFetch(() => ({ body: { items: [LIVE_CAMPAIGN] } }));
  const res = await adapter.listCampaigns('key');
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.data[0].senderCount, 3);
    assert.equal(res.data[0].dailyLimit, 180);
    assert.ok(!('leads' in res.data[0]), 'campaign config carries no lead counts');
  }
});

test('leads, opportunities, interested and meetings map to their own fields only', async () => {
  stubFetch(() => ({ body: [LIVE_ANALYTICS] }));
  const res = await adapter.fetchStats('key');
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const m = res.data[0].metrics;
  assert.equal(m.leads, 0, 'leads = Instantly leads_count');
  assert.equal(m.contacted, 865);
  assert.equal(m.newLeadsContacted, 439);
  assert.equal(m.opportunities, 5, 'opportunities = Instantly total_opportunities');
  assert.equal(m.opportunityValue, 3900);
  // This endpoint does not report these: they stay unknown, never 0 and never
  // derived from opportunities or replies.
  assert.equal(m.interested, null);
  assert.equal(m.meetingsBooked, null);
  assert.equal(m.meetingsCompleted, null);
  assert.equal(m.closed, null);
  assert.equal(res.data[0].providerRaw?.reply_count_automatic, 4, 'unmapped provider fields are kept raw');
});

test('meetings are only ever Instantly meeting counts', () => {
  const s = normalizeInstantlyStats({
    campaign_id: 'c1', total_opportunities: 9, total_interested: 4, total_meeting_booked: 2, total_meeting_completed: 1, total_closed: 1,
  });
  assert.deepEqual(
    [s.metrics.opportunities, s.metrics.interested, s.metrics.meetingsBooked, s.metrics.meetingsCompleted, s.metrics.closed],
    [9, 4, 2, 1, 1]
  );
});

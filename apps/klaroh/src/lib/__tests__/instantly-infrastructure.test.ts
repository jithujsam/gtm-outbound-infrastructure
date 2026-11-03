import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInstantlyAdapter } from '../providers/instantly/adapter.ts';
import { normalizeInstantlySteps } from '../providers/instantly/normalize.ts';
import { mergeOutcomes } from '../providers/types.ts';
import { ACCOUNT_RAW_KEYS } from '../instantly-mappers.ts';
import type { CampaignMetrics } from '../providers/types.ts';

// Payload shapes follow Instantly API v2 (steps, overview, accounts, warmup,
// daily account analytics, vitals). The mapping is defensive: unknown or
// missing fields become null, never a fabricated number.

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Call { url: string; method: string; body: unknown }

function stub(handler: (call: Call) => { status?: number; body: unknown }): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const reply = handler(call);
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
  }) as typeof fetch;
  return calls;
}

const adapter = createInstantlyAdapter({ maxRetries: 0 });
const KEY = 'key-123456789012345678';

test('campaign outcomes: interested / meetings / closed come only from Instantly meeting fields', async () => {
  const calls = stub(() => ({
    body: { total_opportunities: 5, total_opportunity_value: 3900, total_interested: 7, total_meeting_booked: 3, total_meeting_completed: 2, total_closed: 1 },
  }));
  const res = await adapter.fetchCampaignOutcomes!(KEY, 'camp-1');
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.data, { interested: 7, meetingsBooked: 3, meetingsCompleted: 2, closed: 1, opportunities: 5, opportunityValue: 3900 });
  assert.match(calls[0].url, /\/campaigns\/analytics\/overview\?id=camp-1$/);
  assert.equal(calls[0].method, 'GET');
});

test('campaign outcomes: fields Instantly does not send stay absent (null after merge)', async () => {
  stub(() => ({ body: { total_opportunities: 5 } }));
  const res = await adapter.fetchCampaignOutcomes!(KEY, 'camp-1');
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.data, { opportunities: 5 });
  const base = { meetingsBooked: null, interested: null, opportunities: 4 } as unknown as CampaignMetrics;
  const merged = mergeOutcomes(base, { ...res.data, meetingsBooked: 2 });
  assert.equal(merged.opportunities, 4, 'the analytics value is never overwritten');
  assert.equal(merged.meetingsBooked, 2, 'a missing value is filled');
  assert.equal(merged.interested, null);
});

test('step analytics: 0-based steps become 1-based, variants become letters', async () => {
  stub(() => ({
    body: [
      { step: '0', variant: '0', sent: 500, unique_opened: 0, unique_replies: 6, replies: 7, opportunities: 2 },
      { step: '0', variant: '1', sent: 480, unique_replies: 3 },
      { step: '1', variant: '0', sent: 400, unique_replies: 2 },
      { step: null, variant: null, sent: 1 },
    ],
  }));
  const res = await adapter.fetchStepStats!(KEY, 'camp-1');
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.data.map((s) => [s.step, s.variant, s.sent, s.repliesUnique]), [
    [1, 'A', 500, 6],
    [1, 'B', 480, 3],
    [2, 'A', 400, 2],
  ]);
  assert.equal(res.data[1].opportunities, null, 'unreported stays null');
});

test('step analytics: 1-based steps are kept and duplicate rows are summed', () => {
  const steps = normalizeInstantlySteps('c', [
    { step: 1, variant: null, sent: 10 },
    { step: 1, variant: null, sent: 5 },
    { step: 2, variant: null, sent: 3 },
  ]);
  assert.deepEqual(steps.map((s) => [s.step, s.variant, s.sent]), [[1, '', 15], [2, '', 3]]);
});

test('accounts: statuses are normalized and no credential ever leaves the adapter', async () => {
  stub(() => ({
    body: {
      items: [
        {
          email: 'Ishaan@Send.example', status: 1, warmup_status: 1, stat_warmup_score: 100, daily_limit: 30,
          sending_gap: 10, timestamp_last_used: '2026-10-06T10:00:00Z', tracking_domain_name: 'track.send.example',
          smtp_password: 'secret', imap_password: 'secret', smtp_host: 'smtp.example', signature: '<p>Hi</p>',
        },
        { email: 'paused@send.example', status: 2, warmup_status: 0 },
        { email: 'broken@send.example', status: -3, warmup_status: -1, stat_warmup_score: 140 },
        { email: 'not-an-email' },
      ],
    },
  }));
  const res = await adapter.listAccounts!(KEY);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.data.map((a) => [a.email, a.status, a.warmupStatus]), [
    ['ishaan@send.example', 'active', 'active'],
    ['paused@send.example', 'paused', 'paused'],
    ['broken@send.example', 'error', 'error'],
  ]);
  const a = res.data[0];
  assert.equal(a.warmupScore, 100);
  assert.equal(a.dailyLimit, 30);
  assert.equal(a.sendingGapMinutes, 10);
  assert.equal(a.trackingDomain, 'track.send.example');
  assert.equal(res.data[2].warmupScore, null, 'an out-of-range score is not trusted');
  const serialized = JSON.stringify(res.data);
  assert.ok(!/secret|smtp_host|smtp_password|imap|signature/.test(serialized), 'only whitelisted fields are kept');
  for (const key of Object.keys(a.providerRaw ?? {})) assert.ok((ACCOUNT_RAW_KEYS as readonly string[]).includes(key));
});

test('accounts: paging follows the cursor', async () => {
  const calls = stub(({ url }) =>
    url.includes('starting_after=next')
      ? { body: { items: [{ email: 'b@x.example' }] } }
      : { body: { items: [{ email: 'a@x.example' }], next_starting_after: 'next' } }
  );
  const res = await adapter.listAccounts!(KEY);
  assert.equal(res.ok, true);
  if (res.ok) assert.deepEqual(res.data.map((a) => a.email), ['a@x.example', 'b@x.example']);
  assert.equal(calls.length, 2);
});

test('account daily analytics: campaign sending per mailbox per day', async () => {
  const calls = stub(() => ({
    body: [
      { date: '2026-10-05', email_account: 'a@x.example', sent: 25, bounced: 1, replies: 2 },
      { date: '2026-10-06', email_account: 'a@x.example', sent: 0 },
      { date: 'bad', email_account: 'a@x.example', sent: 9 },
    ],
  }));
  const res = await adapter.fetchAccountDaily!(KEY, ['a@x.example'], '2026-10-01', '2026-10-06');
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.data, [
    { email: 'a@x.example', date: '2026-10-05', sent: 25, bounced: 1, replies: 2 },
    { email: 'a@x.example', date: '2026-10-06', sent: 0, bounced: null, replies: null },
  ]);
  assert.match(calls[0].url, /start_date=2026-10-01&end_date=2026-10-06&emails=a%40x.example/);
});

test('warmup analytics: read-only POST; warmup days and health scores, separate from campaign sends', async () => {
  const calls = stub(() => ({
    body: {
      email_date_data: {
        'a@x.example': {
          '2026-10-05': { sent: 40, landed_inbox: 39, landed_spam: 1, received: 38 },
          '2026-10-06': { sent: 41, landed_inbox: 41 },
        },
      },
      aggregate_data: { 'a@x.example': { sent: 81, landed_inbox: 80, landed_spam: 1, received: 38, health_score: 99, health_score_label: '99%' } },
    },
  }));
  const res = await adapter.fetchWarmup!(KEY, ['a@x.example']);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { emails: ['a@x.example'] });
  assert.deepEqual(res.data.days[1], { email: 'a@x.example', date: '2026-10-06', sent: 41, landedInbox: 41, landedSpam: null, received: null });
  assert.equal(res.data.healthScores.get('a@x.example'), 99);
});

test('domain vitals: SPF/DKIM/DMARC/MX per domain; unknown values stay unknown', async () => {
  const calls = stub(() => ({
    body: {
      success_list: [{ domain: 'Send.example', spf: true, dkim: true, dmarc: true, mx: true }],
      failure_list: [{ domain: 'bad.example', spf: false, dkim: 'missing', dmarc: null, mx: true }],
    },
  }));
  const res = await adapter.checkDomains!(KEY, ['a@send.example', 'b@bad.example']);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.data, [
    { domain: 'send.example', spf: true, dkim: true, dmarc: true, mx: true },
    { domain: 'bad.example', spf: false, dkim: false, dmarc: null, mx: true },
  ]);
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { accounts: ['a@send.example', 'b@bad.example'] });
});

test('infrastructure provider failures are returned, not thrown', async () => {
  stub(() => ({ status: 403, body: { message: 'scope missing' } }));
  const res = await adapter.listAccounts!(KEY);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.status, 403);
    assert.match(adapter.userSafeError(res.error, 'x'), /permission/);
  }
});

test('campaign list carries the sending accounts (lower-cased, unique) — infrastructure, not leads', async () => {
  stub(() => ({ body: { items: [{ id: 'c1', name: 'Pharma', email_list: ['A@x.example', 'a@x.example', 'b@x.example', 7] }] } }));
  const res = await adapter.listCampaigns(KEY);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.data[0].senderEmails, ['a@x.example', 'b@x.example']);
  assert.equal(res.data[0].senderCount, 2);
});

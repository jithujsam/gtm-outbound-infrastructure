import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { htmlToText, mapEmailRow, mapLeadRow } from '../instantly-mappers.ts';
import { EMAIL_REQUEST_SPACING_MS, EMAIL_REQUESTS_PER_MINUTE, fetchInstantlyReceivedEmailPage, waitForEmailSlot } from '../instantly-api.ts';
import { isAutoReplyMessage, normalizeInstantlyEmail, normalizeInstantlyInterest, normalizeInstantlyLead, stripQuotedText } from '../providers/instantly/normalize.ts';
import { METRICS } from '../analytics/metrics.ts';
import {
  companyLabel,
  emptyState,
  filterThreads,
  isPositiveInterest,
  POSITIVE_INTEREST,
  prospectLabel,
  type ReplySyncInfo,
  type ThreadSummary,
} from '../analytics/replies.ts';
import {
  MAX_PAGES_PER_RUN,
  REPLY_HISTORY_DAYS,
  syncReplies,
  type MessageInsert,
  type ReplyStore,
  type ReplySyncState,
  type ThreadInsert,
} from '../sync/reply-sync.ts';
import type { LeadProfile, ProviderAdapter, ProviderResult, ReceivedMessage, ReplyPage } from '../providers/types.ts';

// ── Instantly email mapping ─────────────────────────────────────────────────
const RAW = {
  id: 'e-1',
  thread_id: 't-1',
  campaign_id: 'c-1',
  lead: 'John@Acme.example',
  lead_id: 'l-1',
  eaccount: 'Sales@Agency.example',
  ue_type: 2,
  is_auto_reply: 0,
  i_status: 1,
  timestamp_created: '2026-10-08T10:00:00.000Z',
  timestamp_email: '2026-10-08T09:59:00.000Z',
  subject: 'Re: Quick question',
  from_address_email: 'john@acme.example',
  from_address_json: [{ address: 'john@acme.example', name: 'John Smith' }],
  to_address_email_list: 'sales@agency.example',
  body: { text: 'Yes, interested.\n\nOn Mon, 6 Oct 2026, Sales <sales@agency.example> wrote:\n> Hi John', html: '<p>ignored</p>' },
  step: 1,
};

test('email rows map the documented fields; addresses are lower-cased', () => {
  const e = mapEmailRow(RAW)!;
  assert.equal(e.thread_id, 't-1');
  assert.equal(e.lead_email, 'john@acme.example');
  assert.equal(e.eaccount, 'sales@agency.example');
  assert.equal(e.ue_type, 2);
  assert.equal(e.is_auto_reply, false);
  assert.equal(e.timestamp, '2026-10-08T09:59:00.000Z', 'timestamp_email is when it was sent');
  assert.equal(e.from_name, 'John Smith');
  assert.equal(e.to_email, 'sales@agency.example');
  assert.equal(mapEmailRow({ subject: 'no id' }), null);
});

test('html bodies become readable text; a missing body falls back to the preview', () => {
  assert.equal(htmlToText('<div>Hi<br>there&nbsp;&amp; you</div><style>x{}</style>'), 'Hi\nthere & you');
  assert.equal(mapEmailRow({ id: 'x', body: { html: '<p>Hello</p>' } })!.text, 'Hello');
  assert.equal(mapEmailRow({ id: 'x', content_preview: 'Preview' })!.text, 'Preview');
});

test('normalization keeps received messages only and cuts the quoted history', () => {
  const m = normalizeInstantlyEmail(mapEmailRow(RAW)!)!;
  assert.equal(m.body, 'Yes, interested.');
  assert.equal(m.interest, 'interested');
  assert.equal(m.isAutoReply, false);
  assert.equal(normalizeInstantlyEmail(mapEmailRow({ ...RAW, ue_type: 1 })!), null, 'a campaign email we sent is not a reply');
  assert.equal(normalizeInstantlyEmail(mapEmailRow({ ...RAW, ue_type: 3 })!), null, 'a manual email we sent is not a reply');
  assert.equal(normalizeInstantlyEmail(mapEmailRow({ ...RAW, timestamp_email: null, timestamp_created: null })!), null);
  const noThread = normalizeInstantlyEmail(mapEmailRow({ ...RAW, thread_id: null })!)!;
  assert.equal(noThread.threadId, 'e-1', 'a message without a thread is its own conversation');
});

test('quoted text in its common forms is removed, the reply itself kept', () => {
  assert.equal(stripQuotedText('Sounds good.\n-----Original Message-----\nFrom: x'), 'Sounds good.');
  assert.equal(stripQuotedText('Call me Friday.\nFrom: Sales <s@a.example>\nSent: Monday\nSubject: x'), 'Call me Friday.');
  assert.equal(stripQuotedText('Yes!\n> old line\n> older'), 'Yes!');
  assert.equal(stripQuotedText('Ok\nOn Tue, 7 Oct 2026 at 10:00, Sales <s@a.example>\nwrote:\nold'), 'Ok');
  assert.equal(stripQuotedText('On reflection, yes. Let us talk.'), 'On reflection, yes. Let us talk.', 'a sentence starting with "On" stays');
});

test('auto-replies: the provider flag first; subject patterns only when there is no flag', () => {
  assert.equal(isAutoReplyMessage(true, 'Re: hi', null), true);
  assert.equal(isAutoReplyMessage(false, 'Automatic reply: away', null), false, 'an explicit "not automatic" wins');
  assert.equal(isAutoReplyMessage(null, 'Automatic reply: away', null), true);
  assert.equal(isAutoReplyMessage(null, 'Out of Office: back Monday', null), true);
  assert.equal(isAutoReplyMessage(null, 'Re: Quick question', null), false);
  assert.equal(isAutoReplyMessage(false, 'Re: hi', 'out_of_office'), true, 'a lead marked out of office is not a human reply');
  const m = normalizeInstantlyEmail(mapEmailRow({ ...RAW, is_auto_reply: 1, i_status: null })!)!;
  assert.equal(m.isAutoReply, true);
});

test('interest codes map to statuses; unknown codes are not guessed', () => {
  assert.deepEqual([1, 2, 3, 4, 0, -1, -2, -3, 7, null].map((c) => normalizeInstantlyInterest(c)), [
    'interested', 'meeting_booked', 'meeting_completed', 'won', 'out_of_office', 'not_interested', 'wrong_person', 'lost', null, null,
  ]);
});

test('leads: name, company and current status', () => {
  const l = normalizeInstantlyLead(mapLeadRow({ id: 'l-1', email: 'J@A.example', first_name: 'John', last_name: 'Smith', company_name: 'Acme', lt_interest_status: 2 })!);
  assert.deepEqual(l, { externalId: 'l-1', email: 'j@a.example', name: 'John Smith', company: 'Acme', interest: 'meeting_booked' });
  assert.equal(normalizeInstantlyLead(mapLeadRow({ id: 'l-2' })!).name, null);
});

// ── positive = the metric's definition ─────────────────────────────────────
test('positive conversations use exactly the statuses the positive metric counts', () => {
  assert.deepEqual([...POSITIVE_INTEREST], ['interested', 'meeting_booked', 'meeting_completed', 'won']);
  assert.match(METRICS.positive.definition, /interested, meeting booked, meeting completed or won/);
  for (const i of ['out_of_office', 'not_interested', 'wrong_person', 'lost', null] as const) assert.equal(isPositiveInterest(i), false);
  // the client's view (SQL) uses the same set
  const sql = fs.readFileSync(new URL('../../../supabase/migrations/20261008000400_reply_inbox.sql', import.meta.url), 'utf8');
  assert.match(sql, /t\.interest in \('interested', 'meeting_booked', 'meeting_completed', 'won'\)/);
});

// ── rate limiting ───────────────────────────────────────────────────────────
test('email requests are spaced under the 20-per-minute limit, per API key', async () => {
  assert.ok(60_000 / EMAIL_REQUEST_SPACING_MS < EMAIL_REQUESTS_PER_MINUTE);
  let clock = 1_000_000;
  const waits: number[] = [];
  const opts = { now: () => clock, sleep: async (ms: number) => { waits.push(ms); clock += ms; } };
  for (let i = 0; i < 4; i++) await waitForEmailSlot('key-spacing', opts);
  assert.deepEqual(waits, [EMAIL_REQUEST_SPACING_MS, EMAIL_REQUEST_SPACING_MS, EMAIL_REQUEST_SPACING_MS]);
  waits.length = 0;
  await waitForEmailSlot('another-key', opts);
  assert.deepEqual(waits, [], 'another API key has its own budget');
});

test('a 429 on the email endpoint is not retried; paging params are sent', async () => {
  const real = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ message: 'Too many requests' }), { status: 429, headers: { 'retry-after': '1' } });
  }) as typeof fetch;
  try {
    const r = await fetchInstantlyReceivedEmailPage('key-429', { since: '2026-10-01T00:00:00.000Z', cursor: 'abc' }, { spacingMs: 0 });
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.error.status, 429);
    assert.equal(urls.length, 1, 'exactly one request');
    const u = new URL(urls[0]);
    assert.equal(u.pathname, '/api/v2/emails');
    assert.equal(u.searchParams.get('email_type'), 'received');
    assert.equal(u.searchParams.get('starting_after'), 'abc');
    assert.equal(u.searchParams.get('min_timestamp_created'), '2026-10-01T00:00:00.000Z');
  } finally {
    globalThis.fetch = real;
  }
});

// ── the sync (fake provider + fake store) ──────────────────────────────────
interface FakeThread extends ThreadInsert { id: string; leadCompany?: string | null; interestCheckedAt?: string | null }
function fakeStore(scope: Record<string, string> = { 'c-1': 'K-1' }) {
  const db = {
    runs: [] as { id: string; status: string; started_at: string; details?: Record<string, unknown>; error?: string | null }[],
    state: null as ReplySyncState | null,
    threads: new Map<string, FakeThread>(),
    messages: new Map<string, MessageInsert>(),
    failWrites: false,
  };
  const store: ReplyStore = {
    async scopedCampaigns() { return { ok: true, data: new Map(Object.entries(scope)) }; },
    async lastRunStartedAt() { return db.runs.at(-1)?.started_at ?? null; },
    async closeStaleRuns(_i, before) { for (const r of db.runs) if (r.status === 'running' && r.started_at < before) r.status = 'failed'; },
    async startRun(_c, _t, startedAt) {
      if (db.runs.some((r) => r.status === 'running')) return null;
      const id = `run-${db.runs.length + 1}`;
      db.runs.push({ id, status: 'running', started_at: startedAt });
      return { id };
    },
    async finishRun(id, f) { const r = db.runs.find((x) => x.id === id)!; r.status = f.status; r.details = f.details; r.error = f.errorMessage; },
    async getState() { return db.state; },
    async saveState(_c, s) { db.state = { ...s }; return { ok: true, data: null }; },
    async findThreads(_i, ids) { return { ok: true, data: new Map([...db.threads.values()].filter((t) => ids.includes(t.providerThreadId)).map((t) => [t.providerThreadId, t.id])) }; },
    async insertThreads(rows) {
      if (db.failWrites) return { ok: false, error: 'db down' };
      const out = new Map<string, string>();
      for (const r of rows) { const id = `T-${r.providerThreadId}`; db.threads.set(id, { ...r, id }); out.set(r.providerThreadId, id); }
      return { ok: true, data: out };
    },
    async insertMessages(rows) {
      if (db.failWrites) return { ok: false, error: 'db down' };
      let n = 0;
      for (const r of rows) if (!db.messages.has(r.providerMessageId)) { db.messages.set(r.providerMessageId, r); n++; }
      return { ok: true, data: n };
    },
    async threadsForLeadRefresh(_i, touched) {
      return [...db.threads.values()].filter((t) => touched.includes(t.id) && t.leadExternalId).map((t) => ({ threadId: t.id, leadExternalId: t.leadExternalId! }));
    },
    async updateLeads(us) { for (const u of us) Object.assign(db.threads.get(u.threadId)!, { leadName: u.lead.name, leadCompany: u.lead.company, interest: u.lead.interest, interestCheckedAt: u.checkedAt }); return { ok: true, data: us.length }; },
    async setInterest(us) { for (const u of us) db.threads.get(u.threadId)!.interest = u.interest; return { ok: true, data: us.length }; },
  };
  return { db, store };
}

const msg = (id: string, thread: string, at: string, extra: Partial<ReceivedMessage> = {}): ReceivedMessage => ({
  externalId: id, threadId: thread, campaignExternalId: 'c-1', leadExternalId: `lead-${thread}`, leadEmail: `${thread}@p.example`,
  isAutoReply: false, interest: null, sentAt: at, subject: 'Re: hello', fromEmail: `${thread}@p.example`, fromName: null,
  toEmail: null, body: `body ${id}`, step: 1, ...extra,
});

function fakeAdapter(pages: (ProviderResult<ReplyPage> | ((since: string, cursor: string | null) => ProviderResult<ReplyPage>))[], leads?: ProviderResult<LeadProfile[]>) {
  const calls: { since: string; cursor: string | null }[] = [];
  let i = 0;
  const adapter: ProviderAdapter = {
    provider: 'fake', label: 'Fake',
    async validateCredentials() { return { ok: true, data: null }; },
    async listCampaigns() { return { ok: true, data: [] }; },
    async fetchStats() { return { ok: true, data: [] }; },
    userSafeError(e, fallback) { return e.status === 429 ? 'Rate limit reached.' : fallback; },
    async fetchReplyPage(_k, p) {
      calls.push(p);
      const next = pages[Math.min(i++, pages.length - 1)];
      return typeof next === 'function' ? next(p.since, p.cursor) : next;
    },
    ...(leads ? { async fetchLeads() { return leads; } } : {}),
  };
  return { adapter, calls };
}
const page = (messages: ReceivedMessage[], nextCursor: string | null, rows = messages.length): ProviderResult<ReplyPage> => ({ ok: true, data: { messages, rows, nextCursor } });
const NOW = new Date('2026-10-08T12:00:00.000Z');
const params = (store: ReplyStore, adapter: ProviderAdapter, extra = {}) => ({
  store, adapter, ctx: { workspaceId: 'w', integrationId: 'i' }, apiKey: 'k', trigger: 'manual' as const, now: () => NOW, ...extra,
});

test('sync: groups messages into threads, stores each message once, out-of-scope campaigns dropped', async () => {
  const { db, store } = fakeStore();
  const { adapter, calls } = fakeAdapter([
    page([msg('m1', 'a', '2026-10-01T10:00:00Z'), msg('m2', 'a', '2026-10-02T10:00:00Z'), msg('m3', 'b', '2026-10-03T10:00:00Z'),
          msg('m9', 'z', '2026-10-03T10:00:00Z', { campaignExternalId: 'not-a-client-campaign' }), msg('m2', 'a', '2026-10-02T10:00:00Z')], null),
  ]);
  const out = await syncReplies(params(store, adapter));
  assert.equal(out.status, 'success');
  assert.deepEqual([...db.threads.keys()].sort(), ['T-a', 'T-b']);
  assert.equal(db.messages.size, 3);
  assert.equal(out.messagesStored, 3);
  assert.equal(calls[0].since, new Date(NOW.getTime() - REPLY_HISTORY_DAYS * 86_400_000).toISOString(), 'first sync: 90 days');
  assert.equal(db.state?.syncedThrough, NOW.toISOString());
  assert.equal(db.state?.cursor, null);
});

test('sync: re-running is idempotent and incremental (only since the last completed window)', async () => {
  const { db, store } = fakeStore();
  const one = page([msg('m1', 'a', '2026-10-01T10:00:00Z')], null);
  await syncReplies(params(store, fakeAdapter([one]).adapter));
  const later = new Date(NOW.getTime() + 3_600_000);
  const { adapter, calls } = fakeAdapter([one]);
  const out = await syncReplies(params(store, adapter, { now: () => later }));
  assert.equal(out.messagesStored, 0, 'nothing stored twice');
  assert.equal(db.messages.size, 1);
  assert.equal(calls[0].since, new Date(NOW.getTime() - 10 * 60_000).toISOString(), 'from the previous window, minus the overlap');
});

test('sync: pagination follows the cursor; the per-run page budget leaves a backlog that the next run continues', async () => {
  const { db, store } = fakeStore();
  const many = () => (_s: string, cursor: string | null) => page([msg(`m-${cursor ?? 0}`, `t-${cursor ?? 0}`, '2026-10-01T10:00:00Z')], `c${Number((cursor ?? 'c0').slice(1)) + 1}`);
  const { adapter, calls } = fakeAdapter([many()]);
  const out = await syncReplies(params(store, adapter));
  assert.equal(calls.length, MAX_PAGES_PER_RUN, 'never more pages than the budget');
  assert.equal(out.backlog, true);
  assert.equal(db.state?.cursor, `c${MAX_PAGES_PER_RUN}`, 'progress saved');
  assert.equal(db.state?.syncedThrough, null, 'the window is not complete');
  const { adapter: a2, calls: c2 } = fakeAdapter([page([], null, 0)]);
  await syncReplies(params(store, a2, { now: () => new Date(NOW.getTime() + 600_000) }));
  assert.equal(c2[0].cursor, `c${MAX_PAGES_PER_RUN}`, 'continues from the saved cursor');
  assert.equal(c2[0].since, calls[0].since, 'in the same window');
  assert.equal(db.state?.syncedThrough, NOW.toISOString(), 'the window completes as of when it opened');
});

test('sync: a provider repeating a cursor cannot cause a loop', async () => {
  const { store } = fakeStore();
  const { adapter, calls } = fakeAdapter([page([msg('m1', 'a', '2026-10-01T10:00:00Z')], 'same'), page([msg('m2', 'a', '2026-10-01T11:00:00Z')], 'same')]);
  const out = await syncReplies(params(store, adapter));
  assert.equal(calls.length, 2);
  assert.equal(out.status, 'success');
});

test('sync: a 429 stops the run at once, keeps what was stored, and is resumable', async () => {
  const { db, store } = fakeStore();
  const { adapter, calls } = fakeAdapter([page([msg('m1', 'a', '2026-10-01T10:00:00Z')], 'c1'), { ok: false, error: { status: 429, message: 'rate' } }]);
  const out = await syncReplies(params(store, adapter));
  assert.equal(calls.length, 2, 'no further requests after a 429');
  assert.equal(out.status, 'partial');
  assert.equal(out.errorKind, 'rate_limited');
  assert.equal(db.messages.size, 1, 'what was fetched is kept');
  assert.equal(db.state?.cursor, 'c1');
  assert.equal(db.runs[0].details?.errorKind, 'rate_limited');
});

test('sync: a failure never deletes or replaces stored conversations', async () => {
  const { db, store } = fakeStore();
  await syncReplies(params(store, fakeAdapter([page([msg('m1', 'a', '2026-10-01T10:00:00Z')], null)]).adapter));
  const later = () => new Date(NOW.getTime() + 3_600_000);
  const out = await syncReplies(params(store, fakeAdapter([{ ok: false, error: { status: 401, message: 'bad key' } }]).adapter, { now: later }));
  assert.equal(out.status, 'failed');
  assert.equal(out.errorKind, 'auth');
  assert.equal(db.messages.size, 1);
  assert.equal(db.state?.syncedThrough, NOW.toISOString(), 'the last good window stays');
  db.failWrites = true;
  const out2 = await syncReplies(params(store, fakeAdapter([page([msg('m2', 'b', '2026-10-01T10:00:00Z')], null)]).adapter, { now: () => new Date(NOW.getTime() + 7_200_000) }));
  assert.equal(out2.status, 'failed');
  assert.equal(db.messages.size, 1);
});

test('sync: duplicate runs are refused; a manual run within 2 minutes is skipped; no campaigns, no calls', async () => {
  const { db, store } = fakeStore();
  db.runs.push({ id: 'other', status: 'running', started_at: new Date(NOW.getTime() - 60_000).toISOString() });
  const { adapter, calls } = fakeAdapter([page([], null)]);
  assert.equal((await syncReplies(params(store, adapter))).status, 'in_progress');
  assert.equal(calls.length, 0);
  db.runs[0].status = 'success';
  assert.equal((await syncReplies(params(store, adapter, { minIntervalMs: 120_000 }))).status, 'skipped');
  assert.equal(calls.length, 0);
  const empty = fakeStore({});
  assert.equal((await syncReplies(params(empty.store, adapter))).status, 'skipped');
  assert.equal(calls.length, 0);
});

test('sync: a run that never finished does not block the next one', async () => {
  const { db, store } = fakeStore();
  db.runs.push({ id: 'old', status: 'running', started_at: new Date(NOW.getTime() - 3_600_000).toISOString() });
  const out = await syncReplies(params(store, fakeAdapter([page([], null)]).adapter));
  assert.equal(out.status, 'success');
  assert.equal(db.runs[0].status, 'failed');
});

test('sync: positive comes from the lead\'s CURRENT status; the message status is only a fallback', async () => {
  const { db, store } = fakeStore();
  const leads: ProviderResult<LeadProfile[]> = { ok: true, data: [{ externalId: 'lead-a', email: 'a@p.example', name: 'Ann Lee', company: 'Acme', interest: 'meeting_booked' }] };
  await syncReplies(params(store, fakeAdapter([page([msg('m1', 'a', '2026-10-01T10:00:00Z', { interest: 'interested' }), msg('m2', 'b', '2026-10-01T10:00:00Z', { interest: 'not_interested', leadExternalId: null })], null)], leads).adapter));
  assert.equal(db.threads.get('T-a')!.interest, 'meeting_booked');
  assert.equal(db.threads.get('T-a')!.leadName, 'Ann Lee');
  assert.equal(db.threads.get('T-b')!.interest, 'not_interested', 'no lead record: the status on the message');
  // leads endpoint failing: conversations stay, statuses from messages
  const second = fakeStore();
  const out = await syncReplies(params(second.store, fakeAdapter([page([msg('m1', 'a', '2026-10-01T10:00:00Z', { interest: 'interested' })], null)], { ok: false, error: { status: 500, message: 'x' } }).adapter));
  assert.equal(out.status, 'success');
  assert.equal(second.db.threads.get('T-a')!.interest, 'interested');
  assert.equal(second.db.runs[0].details?.leads, 'failed');
});

test('sync: an auto-reply never sets a positive status', async () => {
  const { db, store } = fakeStore();
  await syncReplies(params(store, fakeAdapter([page([msg('m1', 'a', '2026-10-01T10:00:00Z', { isAutoReply: true, interest: 'out_of_office' })], null)]).adapter));
  assert.equal(db.messages.get('m1')!.isAutoReply, true);
  assert.equal(isPositiveInterest(db.threads.get('T-a')!.interest), false);
});

// ── list + empty states ─────────────────────────────────────────────────────
const t = (id: string, extra: Partial<ThreadSummary> = {}): ThreadSummary => ({
  id, campaignId: 'c', campaignName: 'C', leadName: null, leadCompany: null, leadEmail: `${id}@acme.example`, interest: null, subject: null,
  humanReplies: 1, autoReplies: 0, lastHumanReplyAt: '2026-10-01T00:00:00Z', lastReplyAt: '2026-10-01T00:00:00Z', snippet: null, ...extra,
});
const synced: ReplySyncInfo = { everSynced: true, syncing: false, lastSuccessAt: '2026-10-08T00:00:00Z', lastFailed: false, lastError: null, backlog: false };

test('filters: positive only, human replies only, newest first', () => {
  const all = [t('a', { interest: 'interested', lastHumanReplyAt: '2026-10-02T00:00:00Z' }), t('b', { interest: 'not_interested' }), t('c', { humanReplies: 0, autoReplies: 2, interest: 'interested' }), t('d', { interest: 'won', lastHumanReplyAt: '2026-10-05T00:00:00Z' })];
  assert.deepEqual(filterThreads(all, 'positive').map((x) => x.id), ['d', 'a']);
  assert.deepEqual(filterThreads(all, 'human').map((x) => x.id), ['d', 'a', 'b']);
});

test('empty states: never synced, syncing, no replies, only auto-replies, no positive', () => {
  assert.equal(emptyState([], [], 'positive', { ...synced, everSynced: false }), 'never_synced');
  assert.equal(emptyState([], [], 'positive', { ...synced, everSynced: false, syncing: true }), 'syncing_first');
  assert.equal(emptyState([], [], 'positive', synced), 'no_replies');
  const auto = [t('a', { humanReplies: 0, autoReplies: 1 })];
  assert.equal(emptyState(auto, [], 'human', synced), 'only_auto');
  const human = [t('a', { interest: 'not_interested' })];
  assert.equal(emptyState(human, [], 'positive', synced), 'no_positive');
  assert.equal(emptyState(human, human, 'human', synced), null);
});

test('labels: name, else address; company, else a business domain (never a free-mail domain)', () => {
  assert.equal(prospectLabel({ leadName: ' ', leadEmail: 'x@y.example' }), 'x@y.example');
  assert.equal(companyLabel({ leadCompany: null, leadEmail: 'x@acme.example' }), 'acme.example');
  assert.equal(companyLabel({ leadCompany: null, leadEmail: 'x@gmail.com' }), null);
});

test('client wording never says "Interested" (the portal says "Positive response")', async () => {
  const { CLIENT_INTEREST_LABEL } = await import('../analytics/replies.ts');
  assert.equal(CLIENT_INTEREST_LABEL.interested, 'Positive response');
  assert.ok(!Object.values(CLIENT_INTEREST_LABEL).some((l) => /interested/i.test(l!)));
  assert.equal(CLIENT_INTEREST_LABEL.not_interested, undefined, 'non-positive statuses have no client wording');
});

test('reply freshness: last success kept through failures; running only while not stale', async () => {
  const { deriveReplySync } = await import('../data/inbox.ts');
  const now = new Date('2026-10-08T12:00:00Z');
  const ok = { status: 'success', started_at: '2026-10-08T10:00:00Z', finished_at: '2026-10-08T10:01:00Z' };
  const failed = { status: 'failed', started_at: '2026-10-08T11:00:00Z', finished_at: '2026-10-08T11:00:05Z', error_message: 'Instantly rate limit reached.' };
  assert.deepEqual(deriveReplySync([], null, now), { everSynced: false, syncing: false, lastSuccessAt: null, lastFailed: false, lastError: null, backlog: false });
  const s = deriveReplySync([failed, ok], ok, now);
  assert.equal(s.lastSuccessAt, '2026-10-08T10:01:00Z');
  assert.equal(s.lastFailed, true);
  assert.equal(s.lastError, 'Instantly rate limit reached.');
  assert.equal(deriveReplySync([{ status: 'running', started_at: '2026-10-08T11:59:00Z', finished_at: null }, ok], ok, now).syncing, true);
  assert.equal(deriveReplySync([{ status: 'running', started_at: '2026-10-08T09:00:00Z', finished_at: null }, ok], ok, now).syncing, false, 'a run that never finished is not "syncing" forever');
  assert.equal(deriveReplySync([{ ...ok, details: { backlog: true } }], ok, now).backlog, true);
});

// ── regression (real account, 2026-10-09): email rows mostly carry no lead id ──
test('status refresh: a lead marked positive after its reply becomes positive on the next sync (no lead id)', async () => {
  const { db, store } = fakeStore();
  const reply = (interest: ReceivedMessage['interest']) => msg('m1', 'a', '2026-10-01T10:00:00Z', { leadExternalId: null, interest });
  // first sync: the reply arrives while the lead has no status
  await syncReplies(params(store, fakeAdapter([page([reply(null)], null)]).adapter, { refreshDays: 30 }));
  assert.equal(db.threads.get('T-a')!.interest, null);
  // later the team marks the lead interested; no new message arrives
  const later = new Date(NOW.getTime() + 86_400_000);
  const { adapter, calls } = fakeAdapter([
    (since) => (since === new Date(NOW.getTime() - 10 * 60_000).toISOString() ? page([], null, 0) : page([reply('interested')], null)),
  ]);
  const out = await syncReplies(params(store, adapter, { now: () => later, refreshDays: 30 }));
  assert.equal(out.status, 'success');
  assert.equal(calls.length, 2, 'the incremental window, then one refresh page');
  assert.equal(calls[1].since, new Date(later.getTime() - 30 * 86_400_000).toISOString());
  assert.equal(db.threads.get('T-a')!.interest, 'interested');
  assert.equal(db.messages.size, 1, 're-reading stores nothing twice');
  assert.equal(db.runs.at(-1)!.details?.statusRefresh, 'ok');
});

test('status refresh: never fails the run, stays within the page budget, skipped while a backlog remains', async () => {
  const { db, store } = fakeStore();
  await syncReplies(params(store, fakeAdapter([page([msg('m1', 'a', '2026-10-01T10:00:00Z')], null)]).adapter));
  const later = () => new Date(NOW.getTime() + 86_400_000);
  // a 429 during the refresh: the run still succeeds
  const limited = fakeAdapter([page([], null, 0), { ok: false, error: { status: 429, message: 'rate' } }]);
  const out = await syncReplies(params(store, limited.adapter, { now: later, refreshDays: 30 }));
  assert.equal(out.status, 'success');
  assert.equal(db.runs.at(-1)!.details?.statusRefresh, 'rate_limited');
  assert.equal(limited.calls.length, 2, 'no retry after a 429');
  // budget: an endless refresh stops at MAX_PAGES_PER_RUN in total
  const endless = fakeAdapter([page([], null, 0), (_s: string, c: string | null) => page([], `r${Number((c ?? 'r0').slice(1)) + 1}`, 1)]);
  await syncReplies(params(store, endless.adapter, { now: () => new Date(NOW.getTime() + 2 * 86_400_000), refreshDays: 30 }));
  assert.equal(endless.calls.length, MAX_PAGES_PER_RUN);
  assert.equal(db.runs.at(-1)!.details?.statusRefresh, 'partial');
  // backlog: the incremental window uses the whole budget, no refresh
  const fresh = fakeStore();
  const busy = fakeAdapter([(_s: string, c: string | null) => page([msg(`x${c}`, `t${c}`, '2026-10-01T10:00:00Z')], `c${Number((c ?? 'c0').slice(1)) + 1}`)]);
  await syncReplies(params(fresh.store, busy.adapter, { refreshDays: 30 }));
  assert.equal(busy.calls.length, MAX_PAGES_PER_RUN);
  assert.ok(busy.calls.every((c) => c.since === busy.calls[0].since), 'only the incremental window was read');
  assert.equal(fresh.db.runs.at(-1)!.details?.statusRefresh, undefined);
});

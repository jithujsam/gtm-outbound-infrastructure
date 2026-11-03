import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncIntegration } from '../sync/sync-integration.ts';
import {
  toCampaignRow,
  toStatRow,
  type AccountRow,
  type AccountSendingRow,
  type AccountWarmupRow,
  type CampaignRow,
  type CampaignStore,
  type DomainRow,
  type StatRow,
  type StepStatRow,
  type SyncRunFinish,
} from '../sync/campaign-store.ts';
import type {
  NormalizedAccount,
  CampaignMetrics,
  CampaignStatSnapshot,
  NormalizedCampaign,
  ProviderAdapter,
  ProviderResult,
} from '../providers/types.ts';

const ctx = { workspaceId: 'ws-1', integrationId: 'int-1', provider: 'instantly' };

const metrics = (emailsSent: number | null): CampaignMetrics => ({
  leads: null, contacted: null, newLeadsContacted: null, emailsSent, opens: null, opensUnique: null,
  replies: null, repliesUnique: null, clicks: null, clicksUnique: null, bounces: null, unsubscribes: null,
  completed: null, opportunities: null, opportunityValue: null, interested: null, meetingsBooked: null,
  meetingsCompleted: null, closed: null,
});

const campaign = (id: string, name = id): NormalizedCampaign => ({
  externalId: id, name, status: 'active', providerStatus: '1', isEvergreen: null, senderCount: null,
  dailyLimit: null, startDate: null, endDate: null, externalCreatedAt: null, externalUpdatedAt: null,
  providerRaw: { id }, senderEmails: null,
});

const stat = (id: string, sent: number): CampaignStatSnapshot => ({
  externalId: id, metrics: metrics(sent), providerRaw: { campaign_id: id },
});

function fakeAdapter(
  list: ProviderResult<NormalizedCampaign[]>,
  stats: ProviderResult<CampaignStatSnapshot[]>
): ProviderAdapter {
  return {
    provider: 'instantly',
    label: 'Instantly',
    validateCredentials: async () => ({ ok: true, data: null }),
    listCampaigns: async () => list,
    fetchStats: async () => stats,
    userSafeError: (e, fallback) => (e.status === 401 ? 'bad key' : fallback),
  };
}

/**
 * In-memory store enforcing the same uniqueness rules as the database.
 * `linked` = external ids linked to a client (the sync scope).
 */
function memoryStore(linked: string[] = ['a', 'b']) {
  const unavailable = new Map<string, string>(); // external id → since
  const campaigns = new Map<string, CampaignRow & { id: string }>(); // key integration|external
  const stats = new Map<string, StatRow>(); // key campaign|date
  const runs = new Map<string, { status: string; finish?: SyncRunFinish; startedAt: string; finishedAt?: string }>();
  const steps = new Map<string, StepStatRow>();
  const accounts = new Map<string, Omit<AccountRow, 'unavailable_since'> & { id: string; unavailable_since: string | null }>();
  const accountDays = new Map<string, Partial<AccountSendingRow & AccountWarmupRow>>();
  const domains = new Map<string, DomainRow>();
  let seq = 0;
  const store: CampaignStore = {
    async lastExtrasSyncAt() {
      const done = [...runs.values()].filter((r) => r.finish?.details?.extras === 'done');
      return done.length ? done.map((r) => r.startedAt).sort().at(-1)! : null;
    },
    async upsertStepStats(rows) {
      for (const r of rows) steps.set(`${r.campaign_id}|${r.stat_date}|${r.step}|${r.variant}`, r);
      return { ok: true, data: rows.length };
    },
    async upsertAccounts(rows) {
      const ids = new Map<string, string>();
      for (const r of rows) {
        const id = accounts.get(r.email)?.id ?? `acct-${++seq}`;
        accounts.set(r.email, { ...r, id });
        ids.set(r.email, id);
      }
      return { ok: true, data: ids };
    },
    async markAccountsUnavailable(_i, keep, at) {
      for (const a of accounts.values()) if (!keep.includes(a.email) && !a.unavailable_since) a.unavailable_since = at;
    },
    async upsertAccountSending(rows) {
      for (const r of rows) {
        const key = `${r.account_id}|${r.stat_date}`;
        accountDays.set(key, { ...accountDays.get(key), ...r });
      }
      return { ok: true, data: rows.length };
    },
    async upsertAccountWarmup(rows) {
      for (const r of rows) {
        const key = `${r.account_id}|${r.stat_date}`;
        accountDays.set(key, { ...accountDays.get(key), ...r });
      }
      return { ok: true, data: rows.length };
    },
    async upsertDomains(rows) {
      for (const r of rows) domains.set(r.domain, r);
      return { ok: true, data: rows.length };
    },
    async scopedExternalIds() {
      return { ok: true, data: [...linked] };
    },
    async markUnavailable(_integrationId, externalIds, at) {
      for (const id of externalIds) if (!unavailable.has(id)) unavailable.set(id, at);
    },
    async lastSuccessfulSyncAt(integrationId) {
      const ok = [...runs.values()].filter((r) => r.status === 'success' && integrationId === ctx.integrationId);
      return ok.length ? ok.map((r) => r.startedAt).sort().at(-1)! : null;
    },
    async activeRunStartedAt(_integrationId, startedAfter) {
      const running = [...runs.values()].filter((r) => r.status === 'running' && r.startedAt > startedAfter);
      return running.length ? running.map((r) => r.startedAt).sort().at(-1)! : null;
    },
    async startRun(_c, _t, startedAt) {
      const id = `run-${++seq}`;
      runs.set(id, { status: 'running', startedAt });
      return id;
    },
    async upsertCampaigns(rows) {
      const ids = new Map<string, string>();
      for (const r of rows) {
        const key = `${r.integration_id}|${r.external_id}`;
        const existing = campaigns.get(key);
        const id = existing?.id ?? `camp-${++seq}`;
        campaigns.set(key, { ...r, id });
        ids.set(r.external_id, id);
        if (r.unavailable_since === null) unavailable.delete(r.external_id);
      }
      return { ok: true, data: ids };
    },
    async upsertStats(rows) {
      for (const r of rows) {
        const key = `${r.campaign_id}|${r.stat_date}`;
        const existing = stats.get(key);
        if (!existing || existing.captured_at <= r.captured_at) stats.set(key, r);
      }
      return { ok: true, data: rows.length };
    },
    async finishRun(runId, finish, finishedAt) {
      const run = runs.get(runId)!;
      run.status = finish.status;
      run.finish = finish;
      run.finishedAt = finishedAt;
    },
  };
  return { store, campaigns, stats, runs, unavailable, steps, accounts, accountDays, domains };
}

const clock = (iso: string) => () => new Date(iso);

test('a sync stores only campaigns linked to a client, one snapshot each, and records the run', async () => {
  const mem = memoryStore(['a', 'b']);
  const out = await syncIntegration({
    store: mem.store,
    adapter: fakeAdapter(
      { ok: true, data: [campaign('a'), campaign('b'), campaign('unselected')] },
      { ok: true, data: [stat('a', 10), stat('b', 20), stat('unselected', 99)] }
    ),
    ctx, apiKey: 'k', trigger: 'manual', now: clock('2026-10-06T09:00:00Z'),
  });
  assert.equal(out.status, 'success');
  assert.equal(out.campaignsSeen, 2);
  assert.equal(out.campaignsUpserted, 2);
  assert.equal(out.statsWritten, 2);
  assert.equal(mem.campaigns.size, 2);
  assert.ok(![...mem.campaigns.values()].some((c) => c.external_id === 'unselected'), 'unselected campaign not stored');
  assert.equal(mem.stats.size, 2);
  const run = mem.runs.get(out.runId!)!;
  assert.equal(run.status, 'success');
  assert.equal(run.finish?.statsWritten, 2);
});

test('repeated syncs never duplicate campaigns; same day refreshes, a new day adds history', async () => {
  const mem = memoryStore();
  const run = (iso: string, sent: number) =>
    syncIntegration({
      store: mem.store,
      adapter: fakeAdapter({ ok: true, data: [campaign('a')] }, { ok: true, data: [stat('a', sent)] }),
      ctx, apiKey: 'k', trigger: 'manual', now: clock(iso),
    });
  await run('2026-10-06T09:00:00Z', 10);
  await run('2026-10-06T15:00:00Z', 15);
  assert.equal(mem.campaigns.size, 1);
  assert.equal(mem.stats.size, 1);
  assert.equal([...mem.stats.values()][0].emails_sent, 15);
  await run('2026-10-07T09:00:00Z', 30);
  assert.equal(mem.campaigns.size, 1);
  assert.deepEqual(
    [...mem.stats.values()].map((s) => `${s.stat_date}=${s.emails_sent}`).sort(),
    ['2026-10-06=15', '2026-10-07=30']
  );
});

test('a provider returning the same campaign twice is written once', async () => {
  const mem = memoryStore(['a']);
  const out = await syncIntegration({
    store: mem.store,
    adapter: fakeAdapter({ ok: true, data: [campaign('a', 'first'), campaign('a', 'second')] }, { ok: true, data: [stat('a', 1), stat('a', 2)] }),
    ctx, apiKey: 'k', trigger: 'cron', now: clock('2026-10-06T09:00:00Z'),
  });
  assert.equal(out.campaignsSeen, 1);
  assert.equal(mem.campaigns.size, 1);
  assert.equal(mem.stats.size, 1);
});

test('a provider error fails the run with a user-safe message and writes nothing', async () => {
  const mem = memoryStore();
  const out = await syncIntegration({
    store: mem.store,
    adapter: fakeAdapter({ ok: false, error: { status: 401, message: 'raw provider text' } }, { ok: true, data: [] }),
    ctx, apiKey: 'k', trigger: 'manual', now: clock('2026-10-06T09:00:00Z'),
  });
  assert.equal(out.status, 'failed');
  assert.equal(out.error, 'bad key');
  assert.equal(mem.campaigns.size, 0);
  assert.equal(mem.runs.get(out.runId!)!.finish?.errorMessage, 'bad key');
});

test('stats failure keeps campaigns and marks the run partial', async () => {
  const mem = memoryStore();
  const out = await syncIntegration({
    store: mem.store,
    adapter: fakeAdapter({ ok: true, data: [campaign('a')] }, { ok: false, error: { status: 503, message: 'down' } }),
    ctx, apiKey: 'k', trigger: 'manual', now: clock('2026-10-06T09:00:00Z'),
  });
  assert.equal(out.status, 'partial');
  assert.equal(mem.campaigns.size, 1);
  assert.equal(mem.stats.size, 0);
});

test('stats for campaigns the provider no longer lists are ignored', async () => {
  const mem = memoryStore(['a', 'gone']);
  const out = await syncIntegration({
    store: mem.store,
    adapter: fakeAdapter({ ok: true, data: [campaign('a')] }, { ok: true, data: [stat('a', 1), stat('gone', 9)] }),
    ctx, apiKey: 'k', trigger: 'manual', now: clock('2026-10-06T09:00:00Z'),
  });
  assert.equal(out.statsWritten, 1);
});

test('nothing linked to any client: no provider call, no run', async () => {
  const mem = memoryStore([]);
  let calls = 0;
  const adapter = fakeAdapter({ ok: true, data: [campaign('a')] }, { ok: true, data: [stat('a', 1)] });
  const counting = {
    ...adapter,
    listCampaigns: async (k: string) => (calls++, adapter.listCampaigns(k)),
    fetchStats: async (k: string) => (calls++, adapter.fetchStats(k)),
  };
  const out = await syncIntegration({ store: mem.store, adapter: counting, ctx, apiKey: 'k', trigger: 'cron' });
  assert.equal(out.status, 'skipped');
  assert.equal(calls, 0);
  assert.equal(mem.runs.size, 0);
  assert.equal(mem.campaigns.size, 0);
});

test('import: an explicit scope stores exactly the selected campaigns and reports missing ones', async () => {
  const mem = memoryStore([]);
  const out = await syncIntegration({
    store: mem.store,
    adapter: fakeAdapter(
      { ok: true, data: [campaign('a'), campaign('b'), campaign('c'), campaign('d'), campaign('e')] },
      { ok: true, data: ['a', 'b', 'c', 'd', 'e'].map((id) => stat(id, 1)) }
    ),
    ctx, apiKey: 'k', trigger: 'attach', scope: ['a', 'c', 'not-in-account'], now: clock('2026-10-06T09:00:00Z'),
  });
  assert.equal(out.status, 'success');
  assert.deepEqual([...out.campaignIds.keys()].sort(), ['a', 'c']);
  assert.deepEqual(out.missing, ['not-in-account']);
  assert.deepEqual([...mem.campaigns.values()].map((c) => c.external_id).sort(), ['a', 'c']);
  assert.equal(mem.stats.size, 2);
});

test('a selected campaign deleted at the provider is flagged unavailable, keeps history, and recovers', async () => {
  const mem = memoryStore(['a']);
  const sync = (list: NormalizedCampaign[], iso: string) =>
    syncIntegration({
      store: mem.store,
      adapter: fakeAdapter({ ok: true, data: list }, { ok: true, data: list.map((c) => stat(c.externalId, 5)) }),
      ctx, apiKey: 'k', trigger: 'cron', now: clock(iso),
    });
  await sync([campaign('a')], '2026-10-06T09:00:00Z');
  const gone = await sync([campaign('other')], '2026-10-07T09:00:00Z');
  assert.equal(gone.status, 'success');
  assert.deepEqual(gone.missing, ['a']);
  assert.equal(mem.unavailable.get('a'), '2026-10-07T09:00:00.000Z');
  assert.equal(mem.campaigns.size, 1, 'campaign row kept; the unselected one is not stored');
  assert.equal(mem.stats.size, 1, 'earlier snapshot kept');
  await sync([campaign('a')], '2026-10-08T09:00:00Z');
  assert.equal(mem.unavailable.has('a'), false, 'available again once the provider returns it');
});

test('minIntervalMs skips a sync right after a successful one', async () => {
  const mem = memoryStore();
  const adapter = fakeAdapter({ ok: true, data: [campaign('a')] }, { ok: true, data: [stat('a', 1)] });
  await syncIntegration({ store: mem.store, adapter, ctx, apiKey: 'k', trigger: 'manual', now: clock('2026-10-06T09:00:00Z') });
  const again = await syncIntegration({
    store: mem.store, adapter, ctx, apiKey: 'k', trigger: 'manual', minIntervalMs: 30_000, now: clock('2026-10-06T09:00:10Z'),
  });
  assert.equal(again.status, 'skipped');
  assert.equal(mem.runs.size, 1);
  const later = await syncIntegration({
    store: mem.store, adapter, ctx, apiKey: 'k', trigger: 'manual', minIntervalMs: 30_000, now: clock('2026-10-06T09:01:00Z'),
  });
  assert.equal(later.status, 'success');
});

test('row builders produce Klaroh columns only', () => {
  const row = toCampaignRow(ctx, campaign('a', 'Name'), '2026-10-06T09:00:00.000Z');
  assert.equal(row.external_id, 'a');
  assert.equal(row.workspace_id, 'ws-1');
  assert.equal(row.last_synced_at, '2026-10-06T09:00:00.000Z');
  assert.equal(row.name, 'Name', 'the provider name is written as the campaign name');
  assert.ok(!('display_name' in row), 'no Klaroh-side name exists to write');
  const s = toStatRow(ctx, 'camp-1', stat('a', 5), 'run-1', '2026-10-06T23:59:59.000Z');
  assert.equal(s.stat_date, '2026-10-06');
  assert.equal(s.emails_sent, 5);
  assert.equal(s.bounces, null);
  assert.equal(s.sync_run_id, 'run-1');
});

test('a stale campaign name is corrected by sync: same campaign, history and identity kept', async () => {
  const mem = memoryStore(['a']);
  const run = (iso: string, name: string, sent: number) =>
    syncIntegration({
      store: mem.store,
      adapter: fakeAdapter({ ok: true, data: [campaign('a', name)] }, { ok: true, data: [stat('a', sent)] }),
      ctx, apiKey: 'k', trigger: 'manual', now: clock(iso),
    });
  const first = await run('2026-10-05T09:00:00Z', 'KKK1', 100);
  const second = await run('2026-10-06T09:00:00Z', 'Pharma', 150);

  assert.equal(mem.campaigns.size, 1, 'a rename never creates a campaign');
  const stored = [...mem.campaigns.values()][0];
  assert.equal(stored.name, 'Pharma', 'the provider name replaces the stale one');
  assert.equal(stored.external_id, 'a');
  assert.equal(first.campaignIds.get('a'), second.campaignIds.get('a'), 'the Klaroh id is stable across renames');

  const history = [...mem.stats.values()].sort((x, y) => x.stat_date.localeCompare(y.stat_date));
  assert.deepEqual(history.map((h) => [h.stat_date, h.emails_sent, h.campaign_id]), [
    ['2026-10-05', 100, stored.id],
    ['2026-10-06', 150, stored.id],
  ], 'earlier statistics stay attached to the renamed campaign');
});

test('sync keeps leads, opportunities and meetings in their own columns', () => {
  const s = toStatRow(ctx, 'camp-1', {
    externalId: 'a',
    metrics: { ...metrics(865), leads: 0, contacted: 865, opportunities: 5, meetingsBooked: null, interested: null },
    providerRaw: null,
  }, null, '2026-10-06T09:00:00.000Z');
  assert.equal(s.leads, 0);
  assert.equal(s.contacted, 865);
  assert.equal(s.opportunities, 5);
  assert.equal(s.meetings_booked, null, 'opportunities never become meetings');
  assert.equal(s.interested, null);
});

// ── outcomes + analytics/infrastructure extras ──────────────────────────────

const account = (email: string, over: Partial<NormalizedAccount> = {}): NormalizedAccount => ({
  email, status: 'active', providerStatus: '1', warmupStatus: 'active', providerWarmupStatus: '1', warmupScore: 100,
  dailyLimit: 30, sendingGapMinutes: 10, trackingDomain: null, trackingDomainStatus: null,
  lastUsedAt: null, externalCreatedAt: null, providerRaw: { status: 1 }, ...over,
});

function fullAdapter(over: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return {
    ...fakeAdapter(
      { ok: true, data: [{ ...campaign('a', 'Pharma'), senderEmails: ['m1@x.example', 'm2@x.example'] }] },
      { ok: true, data: [stat('a', 865)] }
    ),
    fetchCampaignOutcomes: async () => ({ ok: true, data: { interested: 7, meetingsBooked: 3, meetingsCompleted: 2, closed: 1 } }),
    fetchStepStats: async (_k, id) => ({
      ok: true,
      data: [
        { externalId: id, step: 1, variant: 'A', sent: 500, opens: null, opensUnique: null, replies: 7, repliesUnique: 6, clicks: null, clicksUnique: null, opportunities: 2 },
        { externalId: id, step: 2, variant: '', sent: 365, opens: null, opensUnique: null, replies: 3, repliesUnique: 3, clicks: null, clicksUnique: null, opportunities: null },
      ],
    }),
    listAccounts: async () => ({ ok: true, data: [account('m1@x.example'), account('m2@x.example', { status: 'error' }), account('other@x.example')] }),
    fetchAccountDaily: async () => ({ ok: true, data: [{ email: 'm1@x.example', date: '2026-10-05', sent: 25, bounced: 1, replies: 2 }] }),
    fetchWarmup: async () => ({
      ok: true,
      data: { days: [{ email: 'm1@x.example', date: '2026-10-05', sent: 40, landedInbox: 39, landedSpam: 1, received: 38 }], healthScores: new Map() },
    }),
    checkDomains: async () => ({ ok: true, data: [{ domain: 'x.example', spf: true, dkim: true, dmarc: false, mx: true }, { domain: 'elsewhere.example', spf: true, dkim: true, dmarc: true, mx: true }] }),
    ...over,
  };
}

test('outcomes: meetings and interested are merged into the daily snapshot', async () => {
  const mem = memoryStore(['a']);
  const out = await syncIntegration({ store: mem.store, adapter: fullAdapter(), ctx, apiKey: 'k', trigger: 'manual', now: clock('2026-10-06T09:00:00Z') });
  assert.equal(out.status, 'success');
  const snap = [...mem.stats.values()][0];
  assert.deepEqual([snap.emails_sent, snap.interested, snap.meetings_booked, snap.meetings_completed, snap.closed], [865, 7, 3, 2, 1]);
  assert.equal(out.details?.outcomes, 'ok');
  assert.equal(out.details?.extras, 'skipped', 'extras only when asked');
  assert.equal(mem.accounts.size, 0);
});

test('outcomes: a provider failure keeps the sync successful and the outcome unknown (null)', async () => {
  const mem = memoryStore(['a']);
  const out = await syncIntegration({
    store: mem.store,
    adapter: fullAdapter({ fetchCampaignOutcomes: async () => ({ ok: false, error: { status: 500, message: 'boom' } }) }),
    ctx, apiKey: 'k', trigger: 'manual', now: clock('2026-10-06T09:00:00Z'),
  });
  assert.equal(out.status, 'success');
  assert.equal(out.details?.outcomes, 'failed');
  assert.equal([...mem.stats.values()][0].meetings_booked, null);
  assert.equal(mem.runs.get(out.runId!)!.finish?.details?.outcomes, 'failed', 'recorded on the run');
});

test('extras: steps, scoped mailboxes, sending and warmup kept apart, DNS of sending domains only', async () => {
  const mem = memoryStore(['a']);
  const out = await syncIntegration({ store: mem.store, adapter: fullAdapter(), ctx, apiKey: 'k', trigger: 'cron', extras: true, now: clock('2026-10-06T09:00:00Z') });
  assert.equal(out.status, 'success');
  assert.deepEqual(out.details, { outcomes: 'ok', extras: 'done', steps: 'ok', accounts: 'ok', accountDaily: 'ok', warmup: 'ok', domains: 'ok' });

  assert.deepEqual([...mem.steps.values()].map((r) => [r.step, r.variant, r.sent, r.replies_unique]), [[1, 'A', 500, 6], [2, '', 365, 3]]);
  assert.deepEqual([...mem.accounts.keys()].sort(), ['m1@x.example', 'm2@x.example'], 'only mailboxes the client campaigns send from');
  assert.equal(mem.accounts.get('m2@x.example')!.status, 'error');

  const day = [...mem.accountDays.values()][0];
  assert.equal(day.sent, 25, 'campaign sends');
  assert.equal(day.warmup_sent, 40, 'warmup sends in their own column');
  assert.deepEqual([...mem.domains.keys()], ['x.example']);
  const campaignRow = [...mem.campaigns.values()][0];
  assert.deepEqual(campaignRow.sender_emails, ['m1@x.example', 'm2@x.example']);
  assert.ok(!JSON.stringify([...mem.accounts.values()]).match(/password|smtp|imap/i), 'no credentials stored');
});

test('extras: an API key without account access never fails the campaign sync', async () => {
  const mem = memoryStore(['a']);
  const out = await syncIntegration({
    store: mem.store,
    adapter: fullAdapter({ listAccounts: async () => ({ ok: false, error: { status: 403, message: 'scope' } }) }),
    ctx, apiKey: 'k', trigger: 'cron', extras: true, now: clock('2026-10-06T09:00:00Z'),
  });
  assert.equal(out.status, 'success');
  assert.equal(out.statsWritten, 1);
  assert.equal(out.details?.accounts, 'failed');
  assert.equal(out.details?.warmup, 'skipped');
  assert.equal(out.details?.errors?.accounts, 'Instantly email accounts unavailable', 'a user-safe reason is recorded');
  assert.equal(mem.steps.size, 2, 'other parts still ran');
});

test('extras: a mailbox no longer used by any client campaign is flagged, history kept', async () => {
  const mem = memoryStore(['a']);
  const run = (emails: string[], iso: string) =>
    syncIntegration({
      store: mem.store,
      adapter: fullAdapter({
        listCampaigns: async () => ({ ok: true, data: [{ ...campaign('a', 'Pharma'), senderEmails: emails }] }),
      }),
      ctx, apiKey: 'k', trigger: 'cron', extras: true, now: clock(iso),
    });
  await run(['m1@x.example', 'm2@x.example'], '2026-10-05T09:00:00Z');
  await run(['m1@x.example'], '2026-10-06T09:00:00Z');
  assert.equal(mem.accounts.get('m2@x.example')!.unavailable_since, '2026-10-06T09:00:00.000Z');
  assert.equal(mem.accounts.get('m1@x.example')!.unavailable_since, null);
  assert.equal(mem.accountDays.size, 1, 'stored mailbox history stays');
});

test('a provider without optional capabilities still syncs campaigns', async () => {
  const mem = memoryStore(['a']);
  const out = await syncIntegration({
    store: mem.store,
    adapter: fakeAdapter({ ok: true, data: [campaign('a')] }, { ok: true, data: [stat('a', 1)] }),
    ctx, apiKey: 'k', trigger: 'cron', extras: true, now: clock('2026-10-06T09:00:00Z'),
  });
  assert.equal(out.status, 'success');
  assert.equal(out.details?.outcomes, 'unsupported');
  assert.equal(out.details?.steps, 'unsupported');
  assert.equal(out.details?.accounts, 'unsupported');
});

// ── sync status: duplicate protection, timestamps, failure kind ─────────────

const okAdapter = () => fakeAdapter({ ok: true, data: [campaign('a'), campaign('b')] }, { ok: true, data: [stat('a', 1), stat('b', 2)] });

test('duplicate sync: a running sync of the integration blocks a manual one (no run, no provider call)', async () => {
  const mem = memoryStore(['a', 'b']);
  mem.runs.set('run-busy', { status: 'running', startedAt: '2026-10-08T15:14:30.000Z' });
  let providerCalls = 0;
  const adapter = okAdapter();
  const counted: ProviderAdapter = { ...adapter, listCampaigns: async (k) => (providerCalls++, adapter.listCampaigns(k)) };
  const out = await syncIntegration({
    store: mem.store, adapter: counted, ctx, apiKey: 'k', trigger: 'manual', skipIfRunning: true,
    now: clock('2026-10-08T15:15:00Z'),
  });
  assert.equal(out.status, 'in_progress');
  assert.equal(out.runningSince, '2026-10-08T15:14:30.000Z');
  assert.equal(out.runId, null);
  assert.equal(providerCalls, 0);
  assert.equal(mem.runs.size, 1, 'no second run recorded');
});

test('a running row older than STALE_RUN_MS never finished and does not block a new sync', async () => {
  const mem = memoryStore(['a', 'b']);
  mem.runs.set('run-dead', { status: 'running', startedAt: '2026-10-08T14:00:00.000Z' });
  const out = await syncIntegration({
    store: mem.store, adapter: okAdapter(), ctx, apiKey: 'k', trigger: 'cron', skipIfRunning: true,
    now: clock('2026-10-08T15:15:00Z'),
  });
  assert.equal(out.status, 'success');
});

test('without skipIfRunning (campaign import) a running sync does not block', async () => {
  const mem = memoryStore(['a', 'b']);
  mem.runs.set('run-busy', { status: 'running', startedAt: '2026-10-08T15:14:30.000Z' });
  const out = await syncIntegration({
    store: mem.store, adapter: okAdapter(), ctx, apiKey: 'k', trigger: 'attach', scope: ['a'],
    now: clock('2026-10-08T15:15:00Z'),
  });
  assert.equal(out.status, 'success');
});

test('manual and scheduled syncs record server start and finish times on their run', async () => {
  for (const trigger of ['manual', 'cron'] as const) {
    const mem = memoryStore(['a', 'b']);
    let t = Date.parse('2026-10-08T15:15:00Z');
    const out = await syncIntegration({
      store: mem.store, adapter: okAdapter(), ctx, apiKey: 'k', trigger, skipIfRunning: true,
      now: () => new Date((t += 1000)),
    });
    const run = mem.runs.get(out.runId!)!;
    assert.equal(run.status, 'success', trigger);
    assert.ok(run.startedAt >= '2026-10-08T15:15:00Z', trigger);
    assert.ok(run.finishedAt! > run.startedAt, `${trigger}: finished after it started`);
    assert.equal(run.finish!.errorKind, undefined, 'a success carries no error kind');
  }
});

test('a rejected key records errorKind auth on the failed run (drives "needs reauthentication")', async () => {
  const mem = memoryStore(['a']);
  const out = await syncIntegration({
    store: mem.store,
    adapter: fakeAdapter({ ok: false, error: { status: 401, message: 'Invalid API key' } }, { ok: false, error: { status: 401, message: 'Invalid API key' } }),
    ctx, apiKey: 'k', trigger: 'manual', now: clock('2026-10-08T15:15:00Z'),
  });
  assert.equal(out.status, 'failed');
  const run = mem.runs.get(out.runId!)!;
  assert.equal(run.finish!.errorKind, 'auth');
  assert.equal(run.finish!.errorMessage, 'bad key');
});

test('a rate-limited sync records errorKind rate_limited, never auth', async () => {
  const mem = memoryStore(['a']);
  const out = await syncIntegration({
    store: mem.store,
    adapter: fakeAdapter({ ok: false, error: { status: 429, message: 'slow down' } }, { ok: true, data: [] }),
    ctx, apiKey: 'k', trigger: 'cron', now: clock('2026-10-08T15:15:00Z'),
  });
  assert.equal(mem.runs.get(out.runId!)!.finish!.errorKind, 'rate_limited');
});

test('finishRun stores errorKind inside sync_runs.details, keeping the part outcomes', async () => {
  const { createSupabaseCampaignStore } = await import('../sync/campaign-store.ts');
  const writes: Record<string, unknown>[] = [];
  const fake = {
    from: () => ({
      update: (payload: Record<string, unknown>) => ({
        eq: async () => {
          writes.push(payload);
          return { error: null };
        },
      }),
    }),
  };
  const store = createSupabaseCampaignStore(fake as never);
  const base = { campaignsSeen: 1, campaignsUpserted: 0, statsWritten: 0 };
  await store.finishRun('r1', { ...base, status: 'failed', errorMessage: 'bad key', errorKind: 'auth' }, '2026-10-08T15:15:01Z');
  await store.finishRun('r2', { ...base, status: 'success', errorMessage: null, details: { outcomes: 'ok', extras: 'skipped' } }, '2026-10-08T15:15:02Z');
  await store.finishRun('r3', { ...base, status: 'success', errorMessage: null }, '2026-10-08T15:15:03Z');
  assert.deepEqual(writes[0].details, { errorKind: 'auth' });
  assert.equal(writes[0].finished_at, '2026-10-08T15:15:01Z');
  assert.deepEqual(writes[1].details, { outcomes: 'ok', extras: 'skipped' });
  assert.equal('details' in writes[2], false, 'nothing to record: details untouched');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOUNCE_UNIT_VERIFIED,
  campaignsMetricSet,
  clientBreakdown,
  comparisonRows,
  countsFromRow,
  COUNT_KEYS,
  emptyCounts,
  formatMetric,
  funnelStages,
  isShown,
  METRICS,
  MIN_POSITIVE_FOR_EMAILS_PER_POSITIVE,
  metricSet,
  observations,
  RATE_KEYS,
  readMetric,
  scopeCampaigns,
  sortComparison,
  STAT_COLUMN,
  type CampaignRecord,
  type Counts,
} from '../analytics/metrics.ts';

const counts = (over: Partial<Counts> = {}): Counts => ({ ...emptyCounts(), ...over });
const full = (emailsSent: number, prospectsContacted: number, humanReplies: number, positive: number, bounces: number): Counts => ({
  emailsSent, prospectsContacted, humanReplies, positive, bounces,
});
const rec = (id: string, c: Counts, over: Partial<CampaignRecord> = {}): CampaignRecord => ({
  id, name: id.toUpperCase(), provider: 'instantly', status: 'active', clientIds: ['client-1'], counts: c,
  capturedAt: '2026-10-07T06:00:00Z', senderEmails: [], unavailableSince: null, ...over,
});
const noNaN = (v: unknown) => assert.equal(/NaN|Infinity/.test(JSON.stringify(v)), false);

// ── definitions ─────────────────────────────────────────────────────────────

test('every metric has a stable key, label, definition, source and kind; derived ones a calculation', () => {
  for (const [key, d] of Object.entries(METRICS)) {
    assert.equal(d.key, key);
    assert.ok(d.label && d.definition && d.source);
    assert.ok(d.kind === 'fact' || d.kind === 'derived');
    if (d.kind === 'derived') assert.ok(d.calculation, `${key} states its calculation`);
  }
  assert.deepEqual(Object.keys(METRICS).sort(), [...COUNT_KEYS, ...RATE_KEYS].sort());
});

test('approved sources: prospects = new_leads_contacted, replies = replies_unique, positive = opportunities', () => {
  assert.deepEqual(STAT_COLUMN, {
    emailsSent: 'emails_sent',
    prospectsContacted: 'new_leads_contacted',
    humanReplies: 'replies_unique',
    positive: 'opportunities',
    bounces: 'bounces',
  });
  assert.equal(METRICS.positive.label, 'Positive (as marked in Instantly)');
  // Never leads_count, contacted_count, interested, opens or clicks.
  const used = Object.values(STAT_COLUMN);
  for (const banned of ['leads', 'contacted', 'interested', 'opens', 'opens_unique', 'clicks', 'clicks_unique', 'replies']) {
    assert.ok(!used.includes(banned), `${banned} is not a source of any metric`);
  }
});

test('bounce rate is withheld until the bounce unit is verified', () => {
  assert.equal(BOUNCE_UNIT_VERIFIED, false);
  assert.equal(isShown('bounceRate'), false);
  assert.equal(isShown('bounces'), true);
  const set = metricSet([full(1000, 100, 5, 3, 4)]);
  assert.equal(set.rates.bounceRate, null);
  assert.equal(readMetric(set, 'bounceRate').state, 'unverified');
});

// ── rates ───────────────────────────────────────────────────────────────────

test('reply rate: 0 replies / 100 prospects = 0%', () => {
  const r = readMetric(metricSet([counts({ humanReplies: 0, prospectsContacted: 100 })]), 'replyRate');
  assert.deepEqual(r, { key: 'replyRate', value: 0, state: 'ok' });
  assert.equal(formatMetric('replyRate', r.value), '0%');
});

test('reply rate: 5 / 100 = 5%', () => {
  assert.equal(metricSet([counts({ humanReplies: 5, prospectsContacted: 100 })]).rates.replyRate, 5);
});

test('positive rate: 3 / 100 = 3%', () => {
  assert.equal(metricSet([counts({ positive: 3, prospectsContacted: 100 })]).rates.positiveRate, 3);
});

test('emails per positive: 1000 / 10 = 100', () => {
  const set = metricSet([counts({ emailsSent: 1000, positive: 10 })]);
  assert.equal(set.rates.emailsPerPositive, 100);
  assert.equal(formatMetric('emailsPerPositive', 100), '100 : 1');
});

test('emails per positive: 1000 / 4 is not available (below the minimum of 5 positive)', () => {
  assert.equal(MIN_POSITIVE_FOR_EMAILS_PER_POSITIVE, 5);
  const set = metricSet([counts({ emailsSent: 1000, positive: 4 })]);
  assert.equal(set.rates.emailsPerPositive, null);
  assert.equal(readMetric(set, 'emailsPerPositive').state, 'below_threshold');
  assert.equal(metricSet([counts({ emailsSent: 1000, positive: 5 })]).rates.emailsPerPositive, 200, '5 is enough');
});

test('division by zero: 0 prospects → unavailable, never NaN or Infinity', () => {
  const set = metricSet([full(0, 0, 0, 0, 0)]);
  assert.equal(set.rates.replyRate, null);
  assert.equal(set.rates.positiveRate, null);
  assert.equal(set.rates.emailsPerPositive, null);
  assert.equal(readMetric(set, 'replyRate').state, 'no_prospects');
  assert.equal(formatMetric('replyRate', set.rates.replyRate), '—');
  noNaN(set);
  noNaN(metricSet([counts({ humanReplies: 7, prospectsContacted: 0 })]));
});

test('positive is never divided by replies (Instantly can mark positive without a reply)', () => {
  // Real case: 3 positive, 1 human reply. A positive ÷ replies rate would be 300%.
  const set = metricSet([counts({ positive: 3, humanReplies: 1, prospectsContacted: 466 })]);
  assert.equal(set.rates.positiveRate, (3 / 466) * 100);
  assert.ok(!JSON.stringify(set.rates).includes('300'));
  const [, replies, positive] = funnelStages(set);
  assert.equal(replies.rateKey, 'replyRate');
  assert.equal(positive.rateKey, 'positiveRate', 'positive stage is measured against prospects');
});

// ── missing values ──────────────────────────────────────────────────────────

test('missing / null provider values stay null — never fabricated zeroes', () => {
  const c = countsFromRow({ emails_sent: 320, new_leads_contacted: null, replies_unique: undefined, opportunities: '', bounces: 'n/a' });
  assert.deepEqual(c, { emailsSent: 320, prospectsContacted: null, humanReplies: null, positive: null, bounces: null });
  assert.deepEqual(countsFromRow(null), emptyCounts());
  assert.deepEqual(countsFromRow({ emails_sent: -5, bounces: true }), { ...emptyCounts() }, 'negative or boolean is not a count');
  const set = metricSet([c]);
  assert.equal(set.counts.humanReplies, null);
  assert.equal(set.rates.replyRate, null);
  assert.equal(readMetric(set, 'humanReplies').state, 'not_reported');
  assert.equal(readMetric(set, 'replyRate').state, 'not_reported');
  assert.equal(formatMetric('humanReplies', set.counts.humanReplies), '—');
});

test('an explicitly reported 0 is kept as 0', () => {
  const c = countsFromRow({ emails_sent: '0', new_leads_contacted: 0, replies_unique: 0, opportunities: 0, bounces: 0 });
  assert.deepEqual(c, { emailsSent: 0, prospectsContacted: 0, humanReplies: 0, positive: 0, bounces: 0 });
  assert.equal(readMetric(metricSet([c]), 'humanReplies').state, 'ok');
});

// ── aggregation ─────────────────────────────────────────────────────────────

test('aggregation across campaigns: counts are summed, rates come from the sums (not an average of rates)', () => {
  const set = metricSet([full(1000, 100, 10, 2, 3), full(9000, 900, 9, 18, 7)]);
  assert.deepEqual(set.counts, { emailsSent: 10_000, prospectsContacted: 1000, humanReplies: 19, positive: 20, bounces: 10 });
  assert.equal(set.rates.replyRate, 1.9, '19 ÷ 1000, not the mean of 10% and 1%');
  assert.equal(set.rates.positiveRate, 2);
  assert.equal(set.rates.emailsPerPositive, 500);
  assert.equal(set.campaigns, 2);
});

test('aggregation: a campaign missing one side of a rate never dilutes it', () => {
  const set = metricSet([counts({ humanReplies: 10, prospectsContacted: 100 }), counts({ prospectsContacted: 900 })]);
  assert.equal(set.counts.prospectsContacted, 1000);
  assert.equal(set.counts.humanReplies, 10);
  assert.equal(set.reporting.humanReplies, 1);
  assert.equal(set.rates.replyRate, 10, 'only the campaign reporting both');
});

test('aggregation of nothing is all null', () => {
  const set = metricSet([]);
  assert.deepEqual(set.counts, emptyCounts());
  assert.ok(Object.values(set.rates).every((v) => v === null));
});

test('a campaign linked to several clients counts once in a workspace total', () => {
  const shared = rec('x', full(100, 10, 1, 1, 0), { clientIds: ['a', 'b'] });
  const set = campaignsMetricSet([shared, { ...shared }, rec('y', full(50, 5, 1, 0, 0))]);
  assert.equal(set.counts.emailsSent, 150);
  assert.equal(set.campaigns, 2);
});

// ── scoping / isolation ─────────────────────────────────────────────────────

const records = [
  rec('a1', full(100, 50, 5, 1, 1), { clientIds: ['acme'] }),
  rec('a2', full(200, 100, 2, 0, 3), { clientIds: ['acme', 'globex'] }),
  rec('g1', full(300, 150, 9, 6, 2), { clientIds: ['globex'], provider: 'other' }),
];

test('client isolation: a client sees only its own campaigns', () => {
  const acme = scopeCampaigns(records, { clientId: 'acme', campaignId: null, provider: null });
  assert.deepEqual(acme.map((r) => r.id), ['a1', 'a2']);
  assert.equal(campaignsMetricSet(acme).counts.emailsSent, 300);
  assert.deepEqual(scopeCampaigns(records, { clientId: 'nobody', campaignId: null, provider: null }), []);
});

test('campaign isolation: one campaign means only that campaign', () => {
  const one = scopeCampaigns(records, { clientId: null, campaignId: 'g1', provider: null });
  assert.deepEqual(one.map((r) => r.id), ['g1']);
  assert.deepEqual(campaignsMetricSet(one).counts, records[2].counts);
  assert.deepEqual(scopeCampaigns(records, { clientId: 'acme', campaignId: 'g1', provider: null }), [], 'a campaign of another client is not reachable through a client filter');
});

test('workspace scope: no filter = every record the (RLS-scoped) loader returned, once', () => {
  const all = scopeCampaigns([...records, records[0]], { clientId: null, campaignId: null, provider: null });
  assert.deepEqual(all.map((r) => r.id), ['a1', 'a2', 'g1']);
  assert.deepEqual(scopeCampaigns(records, { clientId: null, campaignId: null, provider: 'other' }).map((r) => r.id), ['g1']);
});

test('client breakdown: per-client sets; a shared campaign counts for each client it belongs to', () => {
  const rows = clientBreakdown(records, [{ id: 'acme', label: 'Acme' }, { id: 'globex', label: 'Globex' }, { id: 'empty', label: 'Empty' }]);
  assert.deepEqual(rows.map((r) => [r.id, r.campaigns, r.set.counts.emailsSent]), [['acme', 2, 300], ['globex', 2, 500]]);
});

// ── comparison ──────────────────────────────────────────────────────────────

test('comparison: low-volume campaigns never top a rate ranking; unknown values sort last', () => {
  const rows = comparisonRows([
    rec('big', full(5000, 2000, 40, 20, 5)),
    rec('lucky', full(30, 10, 3, 2, 0)),
    rec('unknown', counts({ emailsSent: 100 })),
  ]);
  assert.equal(rows.find((r) => r.id === 'lucky')!.lowVolume, true);
  assert.deepEqual(sortComparison(rows, 'positiveRate').map((r) => r.id), ['big', 'lucky', 'unknown']);
  assert.deepEqual(sortComparison(rows, 'emailsSent').map((r) => r.id), ['big', 'unknown', 'lucky']);
  assert.deepEqual(sortComparison(rows, 'name', 'asc').map((r) => r.id), ['big', 'lucky', 'unknown']);
});

test('observations only rank rates among campaigns with enough prospects', () => {
  const rows = comparisonRows([rec('big', full(5000, 2000, 40, 20, 5)), rec('lucky', full(30, 10, 3, 2, 0))]);
  const obs = observations(rows);
  assert.equal(obs.find((o) => o.key === 'positiveRate')!.campaign!.id, 'big');
  assert.equal(obs.find((o) => o.key === 'lowVolume')!.value, '1');
  assert.deepEqual(observations([]), []);
});

test('funnel: prospects → human replies → positive, each against prospects; unknown stays null', () => {
  const stages = funnelStages(metricSet([full(1000, 200, 10, 4, 2)]));
  assert.deepEqual(stages.map((s) => [s.key, s.value, s.ofProspects]), [
    ['prospectsContacted', 200, null],
    ['humanReplies', 10, 5],
    ['positive', 4, 2],
  ]);
  const unknown = funnelStages(metricSet([counts({ emailsSent: 10 })]));
  assert.ok(unknown.every((s) => s.value === null && s.ofProspects === null));
});

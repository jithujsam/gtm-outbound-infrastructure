import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metricSet, type Counts } from '../analytics/metrics.ts';
import { fmtCurrency } from '../analytics/format.ts';
import { snapshotHistory, hasHistory, historyReadiness, MIN_HISTORY_POINTS, MIN_HISTORY_SPAN_DAYS } from '../analytics/history.ts';
import {
  campaignPhase,
  DEFAULT_PORTAL_METRICS,
  economicsSummary,
  isCurrencyCode,
  isPortalMetric,
  parseAmount,
  parseEconomics,
  parsePortalSettings,
  portalCampaignFromRow,
  portalInfrastructure,
  portalSummary,
  reportStatus,
  verdictFor,
  type PortalAccountRow,
  type PortalCampaign,
} from '../analytics/portal.ts';

const counts = (c: Partial<Counts>): Counts => ({ emailsSent: null, prospectsContacted: null, humanReplies: null, positive: null, bounces: null, ...c });
const camp = (id: string, c: Partial<Counts>, extra: Partial<PortalCampaign> = {}): PortalCampaign => ({
  id, name: id, status: 'active', counts: counts(c), capturedAt: null, startDate: null, ended: false, economics: null, ...extra,
});
const setOf = (list: PortalCampaign[]) => metricSet(list.map((c) => c.counts));
const ALL = DEFAULT_PORTAL_METRICS;
const UUID1 = '11111111-1111-4111-8111-111111111111';

// ── metrics offered to clients ──────────────────────────────────────────────
test('only trusted metrics can be shown to a client', () => {
  for (const k of ['emailsSent', 'prospectsContacted', 'humanReplies', 'positive', 'replyRate', 'positiveRate', 'bounces']) assert.ok(isPortalMetric(k), k);
  for (const k of ['meetings', 'meetingsBooked', 'openRate', 'leads_count', 'interested', 'bounceRate', 'revenue', 'emailsPerPositive', 42, null]) {
    assert.equal(isPortalMetric(k), false, String(k));
  }
});

// ── settings validation ─────────────────────────────────────────────────────
test('settings: valid input is accepted and campaign ids are de-duplicated', () => {
  const r = parsePortalSettings({ mode: 'simple', metrics: ['positive', 'emailsSent'], campaignIds: [UUID1, UUID1], showInfrastructure: false, showEconomics: true });
  assert.deepEqual(r, { ok: true, value: { mode: 'simple', metrics: ['positive', 'emailsSent'], campaignIds: [UUID1], showInfrastructure: false, showEconomics: true, showConversations: true } });
  const off = parsePortalSettings({ mode: 'simple', metrics: [], campaignIds: null, showInfrastructure: true, showEconomics: true, showConversations: false });
  assert.equal(off.ok && off.value.showConversations, false);
  assert.equal(parsePortalSettings({ mode: 'simple', metrics: [], campaignIds: null, showInfrastructure: true, showEconomics: true, showConversations: 'no' }).ok, false);
});
test('settings: null campaigns means every campaign; an empty selection is refused', () => {
  const base = { mode: 'advanced', metrics: [], showInfrastructure: true, showEconomics: true };
  assert.equal((parsePortalSettings({ ...base, campaignIds: null }) as { value: { campaignIds: null } }).value.campaignIds, null);
  assert.equal(parsePortalSettings({ ...base, campaignIds: [] }).ok, false);
});
test('settings: unknown or duplicate metrics, bad modes and bad ids are rejected', () => {
  const base = { mode: 'advanced', metrics: ['emailsSent'], campaignIds: null, showInfrastructure: true, showEconomics: true };
  assert.equal(parsePortalSettings({ ...base, metrics: ['meetings'] }).ok, false);
  assert.equal(parsePortalSettings({ ...base, metrics: ['emailsSent', 'emailsSent'] }).ok, false);
  assert.equal(parsePortalSettings({ ...base, mode: 'full' }).ok, false);
  assert.equal(parsePortalSettings({ ...base, campaignIds: ['x'] }).ok, false);
  assert.equal(parsePortalSettings({ ...base, showEconomics: 'yes' }).ok, false);
  assert.equal(parsePortalSettings(null).ok, false);
});

// ── economics input ─────────────────────────────────────────────────────────
test('amounts: blank is "not set", never 0; negatives and junk are invalid', () => {
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount(null), null);
  assert.equal(parseAmount('1,500.456'), 1500.46);
  assert.equal(parseAmount(0), 0);
  assert.equal(parseAmount(-1), undefined);
  assert.equal(parseAmount('abc'), undefined);
  assert.equal(parseAmount(Infinity), undefined);
});
test('currencies: explicit ISO codes only', () => {
  for (const c of ['USD', 'EUR', 'GBP', 'INR', 'JPY']) assert.ok(isCurrencyCode(c), c);
  for (const c of ['usd', 'US', 'DOLLARS', '', null, 'ZZZ']) assert.equal(isCurrencyCode(c), false, String(c));
});
test('economics input: validated per campaign', () => {
  assert.deepEqual(parseEconomics([{ campaignId: UUID1, currency: 'EUR', cost: '1500', valuePerPositive: '' }]), {
    ok: true, value: [{ campaignId: UUID1, currency: 'EUR', cost: 1500, valuePerPositive: null }],
  });
  assert.equal(parseEconomics([{ campaignId: UUID1, currency: 'eur', cost: 1 }]).ok, false);
  assert.equal(parseEconomics([{ campaignId: UUID1, currency: 'USD', cost: -1 }]).ok, false);
  assert.equal(parseEconomics([{ campaignId: UUID1, currency: 'USD' }, { campaignId: UUID1, currency: 'USD' }]).ok, false);
  assert.deepEqual(parseEconomics(undefined), { ok: true, value: [] });
});

// ── summary rules ───────────────────────────────────────────────────────────
test('summary: strong performance (the brief example: 1,036 prospects, 13 replies, 10 positive)', () => {
  const list = [camp('a', { emailsSent: 4620, prospectsContacted: 1036, humanReplies: 13, positive: 10 })];
  const s = portalSummary(setOf(list), list, ALL);
  assert.equal(s.verdict, 'strong');
  assert.equal(s.sentences[0], 'Your campaign has reached 1,036 prospects and generated 13 replies and 10 positive responses.');
  assert.match(s.sentences[1], /actively producing opportunities/);
});
test('summary: weak performance is said gently and never called "working well"', () => {
  const list = [camp('a', { prospectsContacted: 1036, humanReplies: 3, positive: 0 }), camp('b', { prospectsContacted: 500, humanReplies: 1, positive: 0 })];
  const s = portalSummary(setOf(list), list, ALL);
  assert.equal(s.verdict, 'weak');
  assert.equal(s.sentences[0], 'Your 2 campaigns have reached 1,536 prospects, but response volume is currently low.');
  assert.match(s.sentences.join(' '), /More data is needed before drawing a strong conclusion/);
  assert.doesNotMatch(s.sentences.join(' '), /producing|working well/);
});
test('summary: moderate when there is engagement but not enough to call it strong', () => {
  const list = [camp('a', { prospectsContacted: 1036, humanReplies: 8, positive: 2 })];
  assert.equal(portalSummary(setOf(list), list, ALL).verdict, 'moderate');
});
test('summary: insufficient data below the volume threshold, whatever the rates', () => {
  const list = [camp('a', { prospectsContacted: 40, humanReplies: 10, positive: 8 })];
  const s = portalSummary(setOf(list), list, ALL);
  assert.equal(s.verdict, 'insufficient');
  assert.match(s.sentences.join(' '), /still gathering data/);
});
test('summary: nothing reported yet, and no campaigns', () => {
  const list = [camp('a', {})];
  assert.match(portalSummary(setOf(list), list, ALL).sentences[0], /haven’t been reported yet/);
  assert.match(portalSummary(metricSet([]), [], ALL).sentences[0], /No campaigns/);
});
test('summary: missing replies are not invented (no "0 replies")', () => {
  const list = [camp('a', { prospectsContacted: 800, positive: 7 })];
  const s = portalSummary(setOf(list), list, ALL);
  assert.equal(s.sentences[0], 'Your campaign has reached 800 prospects and generated 7 positive responses.');
});
test('summary: quotes only the counts the agency lets the client see', () => {
  const list = [camp('a', { prospectsContacted: 1036, humanReplies: 13, positive: 10 })];
  const s = portalSummary(setOf(list), list, ['positive']);
  assert.equal(s.sentences[0], 'Your campaign has generated 10 positive responses.');
  assert.doesNotMatch(s.sentences.join(' '), /1,036|13 repl/);
});
test('summary: says when campaigns are not running', () => {
  const list = [camp('a', { prospectsContacted: 1000, humanReplies: 20, positive: 9 }, { status: 'paused' }), camp('b', { prospectsContacted: 1000, humanReplies: 20, positive: 9 })];
  assert.match(portalSummary(setOf(list), list, ALL).sentences.join(' '), /1 of the 2 campaigns is currently running/);
  const paused = [camp('a', { prospectsContacted: 1000 }, { status: 'paused' })];
  assert.match(portalSummary(setOf(paused), paused, ALL).sentences.join(' '), /currently paused/);
});
test('verdict thresholds are inclusive and rate-based on the aggregate', () => {
  assert.equal(verdictFor(metricSet([counts({ prospectsContacted: 100, humanReplies: 2, positive: 1 })])), 'moderate');
  assert.equal(verdictFor(metricSet([counts({ prospectsContacted: 400, positive: 5, humanReplies: 5 })])), 'strong');
  assert.equal(verdictFor(metricSet([counts({ prospectsContacted: 99, positive: 50 })])), 'insufficient');
});

// ── campaign state ──────────────────────────────────────────────────────────
test('campaign phases and the overall status in business words', () => {
  assert.equal(campaignPhase({ status: 'active', ended: false }).label, 'Running');
  assert.equal(campaignPhase({ status: 'suspended', ended: false }).label, 'Needs attention');
  assert.equal(campaignPhase({ status: 'active', ended: true }).label, 'Ended');
  assert.deepEqual(reportStatus([camp('a', {}), camp('b', {}, { status: 'paused' })]), { label: 'Live', tone: 'good', detail: '1 of 2 campaigns running' });
  assert.equal(reportStatus([camp('a', {}, { status: 'paused' })]).label, 'Paused');
  assert.equal(reportStatus([]).label, 'No campaigns');
});
test('portal rows: counts via the metric layer, economics optional, missing stays null', () => {
  const c = portalCampaignFromRow({ id: 'x', name: 'X', status: 'weird', emails_sent: 10, new_leads_contacted: null, economics: { currency: 'GBP', cost: '900.00', value_per_positive: null } });
  assert.equal(c.status, 'unknown');
  assert.equal(c.counts.emailsSent, 10);
  assert.equal(c.counts.prospectsContacted, null);
  assert.deepEqual(c.economics, { currency: 'GBP', cost: 900, valuePerPositive: null });
  assert.equal(portalCampaignFromRow({ id: 'y', economics: null }).economics, null);
});

// ── economics ───────────────────────────────────────────────────────────────
test('economics: cost per positive response and return, only from entered figures', () => {
  const list = [camp('a', { prospectsContacted: 1000, positive: 10 }, { economics: { currency: 'USD', cost: 1500, valuePerPositive: 500 } })];
  const [g] = economicsSummary(list).groups;
  assert.equal(g.cost, 1500);
  assert.equal(g.costPerPositive, 150);
  assert.equal(g.costPerProspect, 1.5);
  assert.equal(g.estimatedValue, 5000);
  assert.ok(Math.abs(g.returnPct! - 233.33) < 0.01);
});
test('economics: no value per positive → no value or return; no cost → nothing at all', () => {
  const list = [camp('a', { positive: 4 }, { economics: { currency: 'USD', cost: 1000, valuePerPositive: null } }), camp('b', { positive: 9 })];
  const e = economicsSummary(list);
  assert.equal(e.groups.length, 1);
  assert.equal(e.groups[0].estimatedValue, null);
  assert.equal(e.groups[0].returnPct, null);
  assert.equal(e.groups[0].positive, 4, 'positives of campaigns without a cost are not counted against the cost');
  assert.equal(e.uncovered, 1);
  assert.deepEqual(economicsSummary([camp('a', { positive: 4 })]).groups, []);
});
test('economics: different currencies are never added together or converted', () => {
  const list = [
    camp('a', { positive: 5 }, { economics: { currency: 'USD', cost: 1000, valuePerPositive: null } }),
    camp('b', { positive: 5 }, { economics: { currency: 'EUR', cost: 2000, valuePerPositive: null } }),
    camp('c', { positive: 5 }, { economics: { currency: 'USD', cost: 500, valuePerPositive: null } }),
  ];
  const groups = economicsSummary(list).groups;
  assert.deepEqual(groups.map((g) => [g.currency, g.cost, g.costPerPositive]), [['EUR', 2000, 400], ['USD', 1500, 150]]);
});
test('economics: zero positives → no cost per positive (never infinite)', () => {
  const [g] = economicsSummary([camp('a', { positive: 0, prospectsContacted: 0 }, { economics: { currency: 'USD', cost: 100, valuePerPositive: 50 } })]).groups;
  assert.equal(g.costPerPositive, null);
  assert.equal(g.costPerProspect, null);
  assert.equal(g.estimatedValue, 0);
});
test('currency formatting uses the stored currency', () => {
  assert.equal(fmtCurrency(1500, 'USD'), '$1,500');
  assert.equal(fmtCurrency(1500, 'EUR'), '€1,500');
  assert.equal(fmtCurrency(1500, 'GBP'), '£1,500');
  assert.equal(fmtCurrency(12.5, 'INR'), '₹12.50');
  assert.equal(fmtCurrency(null, 'USD'), '—');
});

// ── infrastructure ──────────────────────────────────────────────────────────
const acct = (n: number, a: Partial<PortalAccountRow> = {}): PortalAccountRow => ({
  account: n, domain: 1, status: 'active', warmup_status: 'active', warmup_score: 98, daily_limit: 30, last_synced_at: '2026-10-08T10:00:00Z',
  spf: true, dkim: true, dmarc: true, mx: true, checked_at: '2026-10-08T10:00:00Z', ...a,
});
test('infrastructure: healthy only when every account passes the checks', () => {
  const r = portalInfrastructure([1, 2, 3, 4, 5, 6].map((n) => acct(n)), '2026-10-08');
  assert.equal(r.state, 'good');
  assert.equal(r.label, 'Operating normally');
  assert.equal(r.detail, '6 sending accounts active');
});
test('infrastructure: errors, poor warmup or failing DNS are not called healthy', () => {
  assert.equal(portalInfrastructure([acct(1), acct(2, { status: 'error' })], '2026-10-08').state, 'attention');
  assert.equal(portalInfrastructure([acct(1), acct(2, { warmup_score: 40 })], '2026-10-08').state, 'attention');
  const dns = portalInfrastructure([acct(1, { dmarc: false })], '2026-10-08');
  assert.equal(dns.state, 'attention');
  assert.equal(dns.detail, '1 of 1 sending account active · 1 needs attention');
});
test('infrastructure: nothing reported → no claim; nothing active → not sending', () => {
  assert.equal(portalInfrastructure([], '2026-10-08').state, 'unknown');
  assert.equal(portalInfrastructure(null, '2026-10-08').label, 'Not reported yet');
  assert.equal(portalInfrastructure([acct(1, { status: 'paused' })], '2026-10-08').state, 'down');
});

// ── history ─────────────────────────────────────────────────────────────────
test('history: running totals as recorded, carried forward, starting when every campaign is recorded', () => {
  const rows = [
    { campaign_id: 'a', stat_date: '2026-10-01', emails_sent: 100, new_leads_contacted: 50 },
    { campaign_id: 'a', stat_date: '2026-10-02', emails_sent: 200, new_leads_contacted: 90 },
    { campaign_id: 'b', stat_date: '2026-10-02', emails_sent: 10, new_leads_contacted: 10 },
    { campaign_id: 'a', stat_date: '2026-10-04', emails_sent: 400, new_leads_contacted: 150 },
    { campaign_id: 'c', stat_date: '2026-10-04', emails_sent: 999 },
  ];
  const h = snapshotHistory(rows, ['a', 'b']);
  assert.deepEqual(h.map((p) => [p.date, p.set.counts.emailsSent, p.set.counts.prospectsContacted]), [
    ['2026-10-02', 210, 100],
    ['2026-10-04', 410, 160],
  ]);
  assert.equal(hasHistory(h, 'emailsSent'), false, 'two recorded days are not a trend');
  assert.equal(hasHistory(h, 'humanReplies'), false, 'never reported → no chart, not a flat 0 line');
});
test('history: one day or none is not enough for a chart', () => {
  assert.deepEqual(snapshotHistory([]), []);
  const one = snapshotHistory([{ campaign_id: 'a', stat_date: '2026-10-01', emails_sent: 5 }]);
  assert.equal(hasHistory(one, 'emailsSent'), false);
});
test('history: the last point equals the latest totals', () => {
  const rows = [
    { campaign_id: 'a', stat_date: '2026-10-01', opportunities: 1 },
    { campaign_id: 'a', stat_date: '2026-10-03', opportunities: 4 },
    { campaign_id: 'b', stat_date: '2026-10-01', opportunities: 2 },
  ];
  assert.equal(snapshotHistory(rows).at(-1)!.set.counts.positive, 6);
});
test('history: a campaign recorded from the day it started counts as zero before it, keeping earlier history', () => {
  const rows = [
    { campaign_id: 'a', stat_date: '2026-10-01', emails_sent: 100 },
    { campaign_id: 'a', stat_date: '2026-10-03', emails_sent: 300 },
    { campaign_id: 'b', stat_date: '2026-10-03', emails_sent: 0 },
    { campaign_id: 'b', stat_date: '2026-10-04', emails_sent: 20 },
  ];
  const h = snapshotHistory(rows, undefined, { a: '2026-09-01', b: '2026-10-03' });
  assert.deepEqual(h.map((p) => [p.date, p.set.counts.emailsSent]), [['2026-10-01', 100], ['2026-10-03', 300], ['2026-10-04', 320]]);
  // started long before its first snapshot: its earlier totals are unknown, so history starts with it
  const late = snapshotHistory(rows, undefined, { a: '2026-09-01', b: '2026-09-01' });
  assert.equal(late[0].date, '2026-10-03');
});

test('history readiness: a trend needs enough recorded days over a long enough span', () => {
  assert.equal(MIN_HISTORY_POINTS, 5);
  assert.equal(MIN_HISTORY_SPAN_DAYS, 14);
  const pts = (days: string[]) => days.map((date, i) => ({ date, value: i * 10 }));
  // production today: at most 3 snapshot days per campaign
  assert.deepEqual(historyReadiness(pts(['2026-10-07', '2026-10-08', '2026-10-09'])), {
    ready: false, recordedDays: 3, firstDay: '2026-10-07', lastDay: '2026-10-09', spanDays: 3,
  });
  // enough points, but all within ten days
  assert.equal(historyReadiness(pts(['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-07', '2026-10-10'])).ready, false);
  // five points spanning exactly fourteen days
  const ok = historyReadiness(pts(['2026-10-01', '2026-10-04', '2026-10-07', '2026-10-10', '2026-10-14']));
  assert.equal(ok.ready, true);
  assert.equal(ok.spanDays, 14);
  // a long span with too few points
  assert.equal(historyReadiness(pts(['2026-09-01', '2026-09-20', '2026-10-10'])).ready, false);
});

test('history readiness: unreported days do not count, and nothing recorded is not ready', () => {
  assert.deepEqual(historyReadiness([]), { ready: false, recordedDays: 0, firstDay: null, lastDay: null, spanDays: 0 });
  const withGaps = [
    { date: '2026-10-01', value: 1 }, { date: '2026-10-05', value: null }, { date: '2026-10-08', value: 2 },
    { date: '2026-10-11', value: null }, { date: '2026-10-14', value: 3 }, { date: '2026-10-20', value: null },
  ];
  const r = historyReadiness(withGaps);
  assert.equal(r.recordedDays, 3);
  assert.equal(r.lastDay, '2026-10-14');
  assert.equal(r.ready, false);
});

test('history: a positive count that goes down is shown as recorded, never forced upwards', () => {
  const rows = [
    { campaign_id: 'a', stat_date: '2026-10-01', opportunities: 5 },
    { campaign_id: 'a', stat_date: '2026-10-02', opportunities: 3 }, // a lead reclassified as not interested
    { campaign_id: 'a', stat_date: '2026-10-04', opportunities: 4 },
  ];
  assert.deepEqual(snapshotHistory(rows).map((p) => p.set.counts.positive), [5, 3, 4]);
});

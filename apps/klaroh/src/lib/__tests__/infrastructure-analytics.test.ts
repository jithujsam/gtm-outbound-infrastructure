import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dailySeries,
  hasMailboxSending,
  domainHealth,
  domainViews,
  infraSummary,
  MAILBOX_BOUNCE_VERIFIED,
  MAILBOX_WINDOW_DAYS,
  mailboxSeverity,
  mailboxWindowStart,
  mailboxViews,
  sortDomainsByRisk,
  type DomainView,
  sendingImbalance,
  warmupHealth,
  warmupTotals,
  type AccountDayInput,
  type AccountInput,
  type DomainInput,
} from '../analytics/infrastructure.ts';

const TODAY = '2026-10-07';

const acct = (id: string, email: string, over: Partial<AccountInput> = {}): AccountInput => ({
  id, email, status: 'active', providerStatus: '1', warmupStatus: 'active', warmupScore: 100, dailyLimit: 30,
  sendingGapMinutes: 10, trackingDomain: null, trackingDomainStatus: null, lastUsedAt: null, unavailableSince: null, ...over,
});

const day = (account_id: string, stat_date: string, over: Partial<AccountDayInput> = {}): AccountDayInput => ({
  account_id, stat_date, sent: null, bounced: null, replies: null,
  warmup_sent: null, warmup_landed_inbox: null, warmup_landed_spam: null, warmup_received: null, ...over,
});

const dns = (domain: string, ok: boolean | null): DomainInput => ({ domain, spf: ok, dkim: ok, dmarc: ok, mx: ok, checked_at: '2026-10-06T00:00:00Z' });

const everyDay = (id: string, sent: number, from = '2026-10-01', to = '2026-10-07') => {
  const out: AccountDayInput[] = [];
  for (let d = from; d <= to; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) out.push(day(id, d, { sent }));
  return out;
};

test('warmup health and DNS health are separate scales', () => {
  assert.equal(warmupHealth({ warmupStatus: 'active', warmupScore: 98 }), 'good');
  assert.equal(warmupHealth({ warmupStatus: 'active', warmupScore: 80 }), 'fair');
  assert.equal(warmupHealth({ warmupStatus: 'active', warmupScore: 50 }), 'poor');
  assert.equal(warmupHealth({ warmupStatus: 'paused', warmupScore: 98 }), 'off');
  assert.equal(warmupHealth({ warmupStatus: 'error', warmupScore: 98 }), 'error');
  assert.equal(warmupHealth({ warmupStatus: 'active', warmupScore: null }), 'unknown');
  assert.equal(domainHealth(dns('a.example', true)), 'pass');
  assert.equal(domainHealth({ ...dns('a.example', true), dmarc: false }), 'fail');
  assert.equal(domainHealth({ ...dns('a.example', true), dkim: null }), 'unknown');
  assert.equal(domainHealth(undefined), 'unknown');
});

test('the 6-mailbox example: 6 email IDs, 6 active, 6 warming, 6 healthy, 0 issues', () => {
  const accounts = Array.from({ length: 6 }, (_, i) => acct(`m${i}`, `m${i}@send.example`));
  const days = accounts.flatMap((a) => everyDay(a.id, 25));
  const views = mailboxViews(accounts, days, [dns('send.example', true)], [], TODAY);
  assert.deepEqual(infraSummary(views), { total: 6, active: 6, warming: 6, healthy: 6, issues: 0, paused: 0, errors: 0, dailyCapacity: 180 });
});

test('an active mailbox is not automatically healthy', () => {
  const accounts = [
    acct('ok', 'ok@good.example'),
    acct('dns', 'x@bad.example'),
    acct('warm', 'w@good.example', { warmupScore: 40 }),
    acct('err', 'e@good.example', { status: 'error', providerStatus: '-3' }),
    acct('bounce', 'b@good.example'),
    acct('stop', 's@good.example'),
  ];
  const days = [
    ...everyDay('ok', 25), ...everyDay('dns', 25), ...everyDay('warm', 25), ...everyDay('err', 25),
    ...everyDay('bounce', 25).map((d) => ({ ...d, bounced: 2 })),
    ...everyDay('stop', 25, '2026-10-01', '2026-10-04'), ...everyDay('stop', 0, '2026-10-05', '2026-10-07'),
  ];
  const views = mailboxViews(accounts, days, [dns('good.example', true), { ...dns('bad.example', true), spf: false }], [], TODAY);
  const by = Object.fromEntries(views.map((v) => [v.id, v]));
  assert.equal(by.ok.healthy, true);
  assert.deepEqual([by.dns.status, by.dns.deliverability, by.dns.healthy, by.dns.flags], ['active', 'fail', false, ['dns']]);
  assert.deepEqual([by.warm.warmup, by.warm.healthy, by.warm.flags], ['poor', false, ['warmup']]);
  assert.deepEqual([by.err.healthy, by.err.flags], [false, ['error']]);
  // 14 bounces on 175 sends: the count is reported, the rate is withheld until its unit is verified
  assert.equal(MAILBOX_BOUNCE_VERIFIED, false);
  assert.deepEqual([by.bounce.bounced, by.bounce.bounceRate, by.bounce.deliverability, by.bounce.flags, by.bounce.healthy], [14, null, 'pass', [], true]);
  assert.deepEqual([by.stop.flags, by.stop.healthy], [['stopped'], false]);
  const s = infraSummary(views);
  assert.deepEqual([s.total, s.active, s.healthy, s.issues, s.errors], [6, 5, 2, 4, 1]);
});

test('mailbox performance: totals, daily average, utilisation, underuse, overload, campaigns, last activity', () => {
  const accounts = [acct('a', 'a@x.example', { lastUsedAt: '2026-10-07T09:00:00Z' }), acct('b', 'b@x.example')];
  const days = [...everyDay('a', 30), day('b', '2026-10-02', { sent: 35 }), day('b', '2026-10-03', { sent: 0 })];
  const campaigns = [{ id: 'c1', name: 'Pharma', senderEmails: ['a@x.example', 'b@x.example'] }, { id: 'c2', name: 'D2C', senderEmails: ['a@x.example'] }];
  const [a, b] = mailboxViews(accounts, days, [], campaigns, TODAY);
  assert.deepEqual([a.sent, a.dailyAverage, a.utilisation, a.peakDay], [210, 30, 100, 30]);
  assert.deepEqual(a.campaigns.map((c) => c.name), ['Pharma', 'D2C']);
  assert.equal(a.lastActivity, '2026-10-07');
  assert.equal(b.dailyAverage, 35 / 6, 'sends ÷ days from its first reported day to today');
  assert.ok(b.flags.includes('underused'));
  assert.ok(b.flags.includes('overloaded'), '35 on one day over a limit of 30');
  assert.equal(b.lastActivity, '2026-10-02');
  assert.equal(sendingImbalance([a, b]), 210 / 122.5);
});

test('mailboxes without any reported sending stay unknown (no 0% utilisation, no NaN)', () => {
  const [v] = mailboxViews([acct('a', 'a@x.example')], [], [], [], TODAY);
  assert.deepEqual([v.sent, v.dailyAverage, v.utilisation, v.bounceRate, v.peakDay], [null, null, null, null, null]);
  assert.equal(v.flags.length, 0);
  assert.equal(sendingImbalance([v]), null);
  assert.equal(JSON.stringify(v).includes('NaN'), false);
});

test('warmup is reported apart from campaign sends, over the mailbox window', () => {
  const accounts = [acct('a', 'a@x.example', { warmupScore: 98 }), acct('b', 'b@x.example', { warmupStatus: 'paused', warmupScore: null })];
  const days = [
    day('a', '2026-10-03', { warmup_sent: 20 }),
    day('a', '2026-10-05', { sent: 25, warmup_sent: 40, warmup_landed_inbox: 38, warmup_landed_spam: 2, warmup_received: 37 }),
    day('a', '2026-10-06', { sent: 25, warmup_sent: 40, warmup_landed_inbox: 40, warmup_landed_spam: 0, warmup_received: 39 }),
  ];
  const views = mailboxViews(accounts, days, [], [], TODAY);
  const w = warmupTotals(views, days, TODAY);
  assert.deepEqual(w, { sent: 100, landedInbox: 78, landedSpam: 2, received: 76, inboxRate: 97.5, enabled: 1, averageScore: 98 });
  assert.equal(views[0].sent, 50, 'campaign sends exclude warmup');
  const ws = dailySeries(days, ['a'], 'warmup_sent');
  assert.deepEqual(ws.map((p) => p.date), ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06'], 'first to last stored day');
  assert.equal(ws.find((p) => p.date === '2026-10-05')!.value, 40);
  assert.equal(ws.find((p) => p.date === '2026-10-04')!.value, null, 'a day without data is null, not 0');
  assert.deepEqual(dailySeries([], ['a'], 'sent'), []);
});

test('warmup inbox rate is unavailable when Instantly reports no spam placement', () => {
  const views = mailboxViews([acct('a', 'a@x.example')], [day('a', '2026-10-05', { warmup_sent: 10, warmup_landed_inbox: 10 })], [], [], TODAY);
  const w = warmupTotals(views, [day('a', '2026-10-05', { warmup_sent: 10, warmup_landed_inbox: 10 })], TODAY);
  assert.equal(w.landedSpam, null);
  assert.equal(w.inboxRate, null, 'never a fabricated 100%');
  assert.equal(views[0].warmupInboxRate, null);
});

test('mailbox sending availability: only when the provider reported campaign sends', () => {
  assert.equal(hasMailboxSending([day('a', '2026-10-05', { warmup_sent: 10 })]), false);
  assert.equal(hasMailboxSending([day('a', '2026-10-05', { sent: 0 })]), true, 'a reported 0 is data');
  assert.equal(hasMailboxSending([]), false);
});

test('domains list every sending domain, checked or not, with the campaigns that send from it', () => {
  const campaigns = [{ id: 'c1', name: 'Pharma', senderEmails: ['a@x.example', 'c@x.example'] }, { id: 'c2', name: 'D2C', senderEmails: ['a@x.example'] }];
  const views = mailboxViews([acct('a', 'a@x.example'), acct('b', 'b@y.example'), acct('c', 'c@x.example')], [], [], campaigns, TODAY);
  const d = domainViews([dns('x.example', true)], views);
  assert.deepEqual(d.map((x) => [x.domain, x.health, x.mailboxes]), [['x.example', 'pass', 2], ['y.example', 'unknown', 1]]);
  assert.deepEqual(d[0].campaigns.map((c) => c.name), ['Pharma', 'D2C'], 'each campaign once');
  assert.deepEqual(d[1].campaigns, []);
});

test('mailboxes no longer used are excluded from current totals', () => {
  const views = mailboxViews([acct('a', 'a@x.example'), acct('gone', 'g@x.example', { unavailableSince: '2026-10-06T00:00:00Z' })], [], [], [], TODAY);
  assert.equal(infraSummary(views).total, 1);
});

import { capacityUse, healthDistributions } from '../analytics/infrastructure.ts';

test('health distributions keep status, warmup and deliverability apart; capacity use', () => {
  const accounts = [
    acct('a', 'a@x.example'),
    acct('b', 'b@x.example', { warmupScore: 50 }),
    acct('c', 'c@y.example', { status: 'error', warmupStatus: 'paused' }),
  ];
  const days = [...everyDay('a', 15), ...everyDay('b', 30)];
  const views = mailboxViews(accounts, days, [dns('x.example', true), { ...dns('y.example', true), dmarc: false }], [], TODAY);
  const d = healthDistributions(views);
  assert.deepEqual(d.status.map((s) => [s.key, s.count]), [['active', 2], ['error', 1]]);
  assert.deepEqual(d.warmup.map((s) => [s.key, s.count]), [['good', 1], ['poor', 1], ['off', 1]]);
  assert.deepEqual(d.deliverability.map((s) => [s.key, s.count]), [['pass', 2], ['fail', 1]]);
  assert.equal(capacityUse(views), 75, '(15 + 30) / (30 + 30)');
  assert.equal(capacityUse([]), null);
  const warm = mailboxViews([acct('a', 'a@x.example')], [day('a', '2026-10-05', { warmup_sent: 40, warmup_landed_inbox: 36, warmup_landed_spam: 4 })], [], [], TODAY)[0];
  assert.deepEqual([warm.warmupSent, warm.warmupInboxRate], [40, 90]);
});

test('domains sort riskiest first, then by name', () => {
  const d = (domain: string, health: DomainView['health']): DomainView => ({ domain, spf: null, dkim: null, dmarc: null, mx: null, checked_at: null, health, mailboxes: 1, campaigns: [] });
  const sorted = sortDomainsByRisk([d('z.example', 'pass'), d('b.example', 'unknown'), d('y.example', 'fail'), d('a.example', 'fail'), d('m.example', 'warning')]);
  assert.deepEqual(sorted.map((x) => x.domain), ['a.example', 'y.example', 'm.example', 'b.example', 'z.example']);
});

test('mailbox severity: a sending error outranks any combination of lesser flags', () => {
  assert.ok(mailboxSeverity(['error']) > mailboxSeverity(['warmup', 'dns', 'bounces', 'stopped', 'overloaded']));
  assert.ok(mailboxSeverity(['warmup']) > mailboxSeverity(['stopped']));
  assert.equal(mailboxSeverity(['underused']), 0);
  assert.equal(mailboxSeverity([]), 0);
});

test('mailbox figures cover one fixed window: older stored days are left out of every figure', () => {
  assert.equal(MAILBOX_WINDOW_DAYS, 30);
  assert.equal(mailboxWindowStart(TODAY), '2026-09-08');
  const accounts = [acct('a', 'a@x.example', { dailyLimit: 30 })];
  const old = [
    day('a', '2026-08-01', { sent: 500, bounced: 50, warmup_sent: 900, warmup_landed_inbox: 10, warmup_landed_spam: 90 }), // outside the window
    day('a', '2026-09-07', { sent: 60 }), // the day before the window
  ];
  const recent = everyDay('a', 10, '2026-09-08', '2026-10-07').map((d) => ({ ...d, bounced: 1, warmup_sent: 2, warmup_landed_inbox: 2, warmup_landed_spam: 0 }));
  const days = [...old, ...recent];
  const [v] = mailboxViews(accounts, days, [], [], TODAY);
  assert.equal(v.sent, 300, '30 days x 10, the August spike excluded');
  assert.equal(v.bounced, 30);
  assert.equal(v.peakDay, 10, 'the old 500 and 60 are not peaks of this window');
  assert.equal(v.dailyAverage, 10);
  assert.equal(v.utilisation, 10 / 30 * 100);
  assert.deepEqual(v.flags, [], 'no "over daily limit" flag from a day outside the window (33% use is not underused)');
  assert.equal(v.warmupSent, 60);
  assert.equal(v.warmupInboxRate, 100);
  const w = warmupTotals([v], days, TODAY);
  assert.deepEqual([w.sent, w.landedInbox, w.landedSpam, w.inboxRate], [60, 60, 0, 100]);
  const series = dailySeries(days, ['a'], 'sent', TODAY);
  assert.equal(series[0].date, '2026-09-08');
  assert.equal(series.at(-1)!.date, TODAY);
  assert.equal(series.length, 30);
});

test('a mailbox shared with campaigns outside the filter names them; its sends are not split', () => {
  const accounts = [acct('a', 'shared@x.example'), acct('b', 'own@x.example')];
  const all = [
    { id: 'c1', name: 'Pharma', senderEmails: ['shared@x.example', 'own@x.example'] },
    { id: 'c2', name: 'Northwind D2C', senderEmails: ['shared@x.example'] },
  ];
  const days = [day('a', '2026-10-06', { sent: 40 }), day('b', '2026-10-06', { sent: 15 })];
  const [a, b] = mailboxViews(accounts, days, [], [all[0]], TODAY, all);
  assert.deepEqual(a.campaigns.map((c) => c.name), ['Pharma']);
  assert.deepEqual(a.otherCampaigns.map((c) => c.name), ['Northwind D2C']);
  assert.equal(a.sent, 40, 'the whole mailbox, not a share of it');
  assert.deepEqual(b.otherCampaigns, []);
  // without a filter every campaign is in view
  const [u] = mailboxViews(accounts, days, [], all, TODAY);
  assert.deepEqual([u.campaigns.length, u.otherCampaigns.length], [2, 0]);
});

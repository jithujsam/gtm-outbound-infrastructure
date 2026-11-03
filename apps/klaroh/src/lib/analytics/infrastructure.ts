// Sending-infrastructure analytics on Klaroh's normalized data. Pure and
// client-safe. Three concepts are kept apart on purpose:
//
//   account status       is the mailbox connected and allowed to send?
//   warmup health        how the provider scores the mailbox's warmup
//   deliverability       DNS of the sending domain + bounce behaviour
//
// An "active" mailbox is not automatically "healthy".
// Warmup emails are never added to campaign sending totals.

import { pct, ratio } from './format.ts';

// Calendar-day helpers (UTC YYYY-MM-DD, matching email_account_stats.stat_date).
const DAY_MS = 86_400_000;
export const toDay = (d: Date): string => d.toISOString().slice(0, 10);
export const addDays = (day: string, n: number): string => toDay(new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS));
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length <= 3700; d = addDays(d, 1)) out.push(d);
  return out;
}

export type AccountStatus = 'active' | 'paused' | 'error' | 'unknown';
export type WarmupState = 'active' | 'paused' | 'error' | 'unknown';

export interface AccountInput {
  id: string;
  email: string;
  status: AccountStatus;
  providerStatus: string | null;
  warmupStatus: WarmupState;
  warmupScore: number | null;
  dailyLimit: number | null;
  sendingGapMinutes: number | null;
  trackingDomain: string | null;
  trackingDomainStatus: string | null;
  lastUsedAt: string | null;
  unavailableSince: string | null;
}

export interface AccountDayInput {
  account_id: string;
  stat_date: string;
  sent: number | null;
  bounced: number | null;
  replies: number | null;
  warmup_sent: number | null;
  warmup_landed_inbox: number | null;
  warmup_landed_spam: number | null;
  warmup_received: number | null;
}

export interface DomainInput {
  domain: string;
  spf: boolean | null;
  dkim: boolean | null;
  dmarc: boolean | null;
  mx: boolean | null;
  checked_at: string | null;
}

/** Klaroh thresholds (documented in the UI). */
export const WARMUP_GOOD = 90;
export const WARMUP_FAIR = 75;
export const BOUNCE_WARNING_PCT = 3;

/**
 * Mailbox sending and warmup figures cover this many days, including today.
 * Every figure that is compared with another (sends, bounces, daily average,
 * capacity in use, peak day, warmup) uses the same window.
 */
export const MAILBOX_WINDOW_DAYS = 30;
export const MAILBOX_WINDOW_LABEL = `last ${MAILBOX_WINDOW_DAYS} days`;

/** The first day (YYYY-MM-DD) of the mailbox window ending on `today`. */
export const mailboxWindowStart = (today: string): string => addDays(today, -(MAILBOX_WINDOW_DAYS - 1));

/**
 * Whether the unit of the provider's per-mailbox bounce count has been
 * verified against the per-mailbox sent count (Instantly /accounts/analytics/daily).
 * Until it is, the mailbox bounce RATE is withheld: no percentage, no bounce
 * flag, no effect on "healthy". The bounce COUNT is still reported.
 */
export const MAILBOX_BOUNCE_VERIFIED = false;
/** Under this share of its daily limit (on average) an active mailbox is underused. */
export const UNDERUSED_PCT = 25;
/** An active mailbox that sent before but nothing in this many recent days has stopped. */
export const STOPPED_DAYS = 3;

export type WarmupHealth = 'good' | 'fair' | 'poor' | 'off' | 'error' | 'unknown';
export type DeliverabilityHealth = 'pass' | 'warning' | 'fail' | 'unknown';

export function warmupHealth(a: Pick<AccountInput, 'warmupStatus' | 'warmupScore'>): WarmupHealth {
  if (a.warmupStatus === 'error') return 'error';
  if (a.warmupStatus === 'paused') return 'off';
  if (a.warmupScore === null) return 'unknown';
  if (a.warmupScore >= WARMUP_GOOD) return 'good';
  if (a.warmupScore >= WARMUP_FAIR) return 'fair';
  return 'poor';
}

export function domainHealth(d: DomainInput | undefined): DeliverabilityHealth {
  if (!d) return 'unknown';
  const checks = [d.spf, d.dkim, d.dmarc, d.mx];
  if (checks.some((c) => c === false)) return 'fail';
  if (checks.every((c) => c === true)) return 'pass';
  return 'unknown';
}

export type MailboxFlag = 'error' | 'warmup' | 'dns' | 'bounces' | 'stopped' | 'underused' | 'overloaded';

export interface MailboxView {
  id: string;
  email: string;
  domain: string;
  status: AccountStatus;
  providerStatus: string | null;
  warmup: WarmupHealth;
  warmupStatus: WarmupState;
  warmupScore: number | null;
  deliverability: DeliverabilityHealth;
  dailyLimit: number | null;
  /** Campaign emails sent in the mailbox window (never warmup). */
  sent: number | null;
  /** Bounces reported in the mailbox window. */
  bounced: number | null;
  /** Bounced ÷ sent, %. Null while MAILBOX_BOUNCE_VERIFIED is false. */
  bounceRate: number | null;
  /** Campaign emails per day in the mailbox window. */
  dailyAverage: number | null;
  /** dailyAverage as % of the daily limit. */
  utilisation: number | null;
  /** Most sent on one day in the mailbox window. */
  peakDay: number | null;
  /** The campaigns in view that send from this mailbox. */
  campaigns: { id: string; name: string }[];
  /**
   * Client campaigns outside the current filter that also send from this
   * mailbox. Its sending figures cover them too: a mailbox's sends are not
   * split between campaigns or clients.
   */
  otherCampaigns: { id: string; name: string }[];
  lastActivity: string | null;
  trackingDomain: string | null;
  trackingDomainStatus: string | null;
  unavailable: boolean;
  flags: MailboxFlag[];
  healthy: boolean;
  /** Warmup emails in the mailbox window (never campaign sends). */
  warmupSent: number | null;
  /** Warmup landed in inbox ÷ (inbox + spam), % */
  warmupInboxRate: number | null;
}

export interface CampaignSenders {
  id: string;
  name: string;
  senderEmails: string[];
}

const sum = (vals: (number | null)[]): number | null =>
  vals.some((v) => v !== null) ? vals.reduce<number>((s, v) => s + (v ?? 0), 0) : null;

export function mailboxViews(
  accounts: AccountInput[],
  days: AccountDayInput[],
  domains: DomainInput[],
  campaigns: CampaignSenders[],
  /** Today (YYYY-MM-DD): the end of the mailbox window. */
  today: string,
  /** Every client campaign of the workspace (to name the ones outside the filter); defaults to `campaigns`. */
  allCampaigns: CampaignSenders[] = campaigns
): MailboxView[] {
  const domainBy = new Map(domains.map((d) => [d.domain, d]));
  const from = mailboxWindowStart(today);
  const daysBy = new Map<string, AccountDayInput[]>();
  for (const d of days) if (d.stat_date >= from && d.stat_date <= today) daysBy.set(d.account_id, [...(daysBy.get(d.account_id) ?? []), d]);
  const inView = new Set(campaigns.map((c) => c.id));

  return accounts.map((a) => {
    const domain = a.email.split('@')[1] ?? '';
    const list = (daysBy.get(a.id) ?? []).sort((x, y) => x.stat_date.localeCompare(y.stat_date));
    const sent = sum(list.map((d) => d.sent));
    const bounced = sum(list.map((d) => d.bounced));
    const reported = list.filter((d) => d.sent !== null);
    const spanDays = reported.length ? daysBetween(reported[0].stat_date, today) + 1 : null;
    const dailyAverage = sent !== null && spanDays ? sent / spanDays : null;
    const peakDay = reported.length ? Math.max(...reported.map((d) => d.sent ?? 0)) : null;
    const lastSent = [...reported].reverse().find((d) => (d.sent ?? 0) > 0)?.stat_date ?? null;
    const recentFrom = addDays(today, -(STOPPED_DAYS - 1));
    const recent = reported.filter((d) => d.stat_date >= recentFrom);
    const stopped =
      a.status === 'active' && lastSent !== null && recent.length > 0 && recent.every((d) => (d.sent ?? 0) === 0);

    const warmup = warmupHealth(a);
    const dns = domainHealth(domainBy.get(domain));
    const bounceRate = MAILBOX_BOUNCE_VERIFIED ? pct(bounced, sent) : null;
    const deliverability: DeliverabilityHealth =
      dns === 'fail' ? 'fail' : bounceRate !== null && bounceRate > BOUNCE_WARNING_PCT ? 'warning' : dns;
    const utilisation = a.dailyLimit ? pct(dailyAverage, a.dailyLimit) : null;

    const flags: MailboxFlag[] = [];
    if (a.status === 'error') flags.push('error');
    if (warmup === 'error' || warmup === 'poor') flags.push('warmup');
    if (dns === 'fail') flags.push('dns');
    if (bounceRate !== null && bounceRate > BOUNCE_WARNING_PCT) flags.push('bounces');
    if (stopped) flags.push('stopped');
    if (a.status === 'active' && utilisation !== null && utilisation < UNDERUSED_PCT && !stopped) flags.push('underused');
    if (a.dailyLimit && peakDay !== null && peakDay > a.dailyLimit) flags.push('overloaded');

    const lastActivity = [a.lastUsedAt?.slice(0, 10) ?? null, lastSent].filter(Boolean).sort().at(-1) ?? null;
    const inbox = sum(list.map((d) => d.warmup_landed_inbox));
    const spam = sum(list.map((d) => d.warmup_landed_spam));
    return {
      id: a.id,
      email: a.email,
      domain,
      status: a.status,
      providerStatus: a.providerStatus,
      warmup,
      warmupStatus: a.warmupStatus,
      warmupScore: a.warmupScore,
      deliverability,
      dailyLimit: a.dailyLimit,
      sent,
      bounced,
      bounceRate,
      dailyAverage,
      utilisation,
      peakDay,
      campaigns: campaigns.filter((c) => c.senderEmails.includes(a.email)).map((c) => ({ id: c.id, name: c.name })),
      otherCampaigns: allCampaigns
        .filter((c) => !inView.has(c.id) && c.senderEmails.includes(a.email))
        .map((c) => ({ id: c.id, name: c.name })),
      lastActivity,
      trackingDomain: a.trackingDomain,
      trackingDomainStatus: a.trackingDomainStatus,
      unavailable: a.unavailableSince !== null,
      flags,
      healthy:
        a.status === 'active' &&
        !a.unavailableSince &&
        !['error', 'poor'].includes(warmup) &&
        deliverability !== 'fail' &&
        !flags.some((f) => f === 'error' || f === 'stopped' || f === 'bounces'),
      warmupSent: sum(list.map((d) => d.warmup_sent)),
      warmupInboxRate: inbox !== null && spam !== null ? pct(inbox, inbox + spam) : null,
    };
  });
}

export interface InfraSummary {
  total: number;
  active: number;
  warming: number;
  healthy: number;
  issues: number;
  paused: number;
  errors: number;
  /** Sum of daily limits of active mailboxes. */
  dailyCapacity: number | null;
}

export function infraSummary(views: MailboxView[]): InfraSummary {
  const current = views.filter((v) => !v.unavailable);
  const active = current.filter((v) => v.status === 'active');
  return {
    total: current.length,
    active: active.length,
    warming: current.filter((v) => v.warmupStatus === 'active').length,
    healthy: current.filter((v) => v.healthy).length,
    issues: current.filter((v) => v.flags.some((f) => f !== 'underused')).length,
    paused: current.filter((v) => v.status === 'paused').length,
    errors: current.filter((v) => v.status === 'error').length,
    dailyCapacity: sum(active.map((v) => v.dailyLimit)),
  };
}

// ── warmup ─────────────────────────────────────────────────────────────────

export interface WarmupTotals {
  sent: number | null;
  landedInbox: number | null;
  landedSpam: number | null;
  received: number | null;
  /** landed inbox ÷ (inbox + spam), % */
  inboxRate: number | null;
  /** accounts with warmup on */
  enabled: number;
  /** mean provider warmup score of accounts that have one */
  averageScore: number | null;
}

/** Warmup over the mailbox window ending on `today` (the same window as mailboxViews). */
export function warmupTotals(views: MailboxView[], days: AccountDayInput[], today: string): WarmupTotals {
  const ids = new Set(views.map((v) => v.id));
  const from = mailboxWindowStart(today);
  const scoped = days.filter((d) => ids.has(d.account_id) && d.stat_date >= from && d.stat_date <= today);
  const landedInbox = sum(scoped.map((d) => d.warmup_landed_inbox));
  const landedSpam = sum(scoped.map((d) => d.warmup_landed_spam));
  const scores = views.map((v) => v.warmupScore).filter((s): s is number => s !== null);
  return {
    sent: sum(scoped.map((d) => d.warmup_sent)),
    landedInbox,
    landedSpam,
    received: sum(scoped.map((d) => d.warmup_received)),
    inboxRate: landedInbox !== null && landedSpam !== null ? pct(landedInbox, landedInbox + landedSpam) : null,
    enabled: views.filter((v) => v.warmupStatus === 'active').length,
    averageScore: scores.length ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10 : null,
  };
}

export interface DailyPoint {
  date: string;
  /** null = nothing reported that day */
  value: number | null;
}

/**
 * Whether the provider reported any campaign sending per mailbox. When it did
 * not, sending-based signals (capacity in use, balance, bounces per mailbox,
 * stopped/underused) are unavailable — not zero.
 */
export function hasMailboxSending(days: AccountDayInput[]): boolean {
  return days.some((d) => d.sent !== null);
}

/**
 * One value per stored day (campaign sends or warmup), summed over accounts.
 * With `today`, only the mailbox window ending on that day.
 */
export function dailySeries(
  days: AccountDayInput[],
  accountIds: string[],
  key: 'sent' | 'warmup_sent' | 'warmup_landed_inbox' | 'warmup_landed_spam',
  today?: string
): DailyPoint[] {
  const ids = new Set(accountIds);
  const start = today ? mailboxWindowStart(today) : null;
  const scoped = days.filter((d) => ids.has(d.account_id) && (!today || (d.stat_date >= start! && d.stat_date <= today)));
  if (!scoped.length) return [];
  const sorted = scoped.map((d) => d.stat_date).sort();
  const from = sorted[0];
  const to = sorted[sorted.length - 1];
  const by = new Map<string, number | null>();
  for (const d of scoped) {
    const v = d[key];
    if (v === null) continue;
    by.set(d.stat_date, (by.get(d.stat_date) ?? 0) + v);
  }
  return eachDay(from, to).map((date) => ({ date, value: by.has(date) ? by.get(date)! : null }));
}

/** Largest mailbox share ÷ even share (1 = perfectly balanced); null without sends. */
export function sendingImbalance(views: MailboxView[]): number | null {
  const sending = views.filter((v) => v.status === 'active' && v.sent !== null);
  const total = sum(sending.map((v) => v.sent));
  if (!total || sending.length < 2) return null;
  const max = Math.max(...sending.map((v) => v.sent ?? 0));
  return ratio(max, total / sending.length);
}

export interface DomainView extends DomainInput {
  health: DeliverabilityHealth;
  mailboxes: number;
  /** Client campaigns sending from this domain's mailboxes. */
  campaigns: { id: string; name: string }[];
}

export function domainViews(domains: DomainInput[], views: MailboxView[]): DomainView[] {
  const used = new Map<string, number>();
  const campaignsBy = new Map<string, Map<string, string>>();
  for (const v of views) {
    used.set(v.domain, (used.get(v.domain) ?? 0) + 1);
    const m = campaignsBy.get(v.domain) ?? new Map<string, string>();
    for (const c of v.campaigns) m.set(c.id, c.name);
    campaignsBy.set(v.domain, m);
  }
  const known = new Map(domains.map((d) => [d.domain, d]));
  const all = new Set([...used.keys(), ...known.keys()]);
  return [...all]
    .filter(Boolean)
    .sort()
    .map((domain) => {
      const d = known.get(domain) ?? { domain, spf: null, dkim: null, dmarc: null, mx: null, checked_at: null };
      return {
        ...d,
        health: domainHealth(known.get(domain)),
        mailboxes: used.get(domain) ?? 0,
        campaigns: [...(campaignsBy.get(domain) ?? new Map<string, string>()).entries()].map(([id, name]) => ({ id, name })),
      };
    });
}

const DOMAIN_RISK: Record<DeliverabilityHealth, number> = { fail: 0, warning: 1, unknown: 2, pass: 3 };

/** Riskiest first (failing, warning, not checked, passing), then by domain name. */
export function sortDomainsByRisk(domains: DomainView[]): DomainView[] {
  return [...domains].sort((a, b) => DOMAIN_RISK[a.health] - DOMAIN_RISK[b.health] || a.domain.localeCompare(b.domain));
}

/** How serious a mailbox's problems are: sending errors first, then the other critical flags, then warnings. */
export function mailboxSeverity(flags: MailboxFlag[]): number {
  const weight: Record<MailboxFlag, number> = { error: 100, warmup: 10, dns: 10, bounces: 10, stopped: 3, overloaded: 3, underused: 0 };
  return flags.reduce((n, f) => n + weight[f], 0);
}

// ── distributions (for the health bars) ────────────────────────────────────

export interface Segment {
  key: string;
  label: string;
  tone: 'good' | 'warning' | 'critical' | 'neutral' | 'unknown';
  count: number;
}

const segs = (views: MailboxView[], defs: Omit<Segment, 'count'>[], pick: (v: MailboxView) => string): Segment[] =>
  defs.map((d) => ({ ...d, count: views.filter((v) => pick(v) === d.key).length })).filter((s) => s.count > 0);

/** Current mailboxes by account status, warmup health and deliverability — three separate scales. */
export function healthDistributions(views: MailboxView[]): { status: Segment[]; warmup: Segment[]; deliverability: Segment[] } {
  const current = views.filter((v) => !v.unavailable);
  return {
    status: segs(current, [
      { key: 'active', label: 'Active', tone: 'good' },
      { key: 'paused', label: 'Paused', tone: 'neutral' },
      { key: 'error', label: 'Error', tone: 'critical' },
      { key: 'unknown', label: 'Unknown', tone: 'unknown' },
    ], (v) => v.status),
    warmup: segs(current, [
      { key: 'good', label: 'Good', tone: 'good' },
      { key: 'fair', label: 'Fair', tone: 'warning' },
      { key: 'poor', label: 'Poor', tone: 'critical' },
      { key: 'error', label: 'Error', tone: 'critical' },
      { key: 'off', label: 'Off', tone: 'neutral' },
      { key: 'unknown', label: 'Unknown', tone: 'unknown' },
    ], (v) => v.warmup),
    deliverability: segs(current, [
      { key: 'pass', label: 'DNS pass', tone: 'good' },
      { key: 'warning', label: 'High bounces', tone: 'warning' },
      { key: 'fail', label: 'DNS fail', tone: 'critical' },
      { key: 'unknown', label: 'Not checked', tone: 'unknown' },
    ], (v) => v.deliverability),
  };
}

/** Average daily campaign sends of active mailboxes ÷ their combined daily limit, %. */
export function capacityUse(views: MailboxView[]): number | null {
  const active = views.filter((v) => v.status === 'active' && !v.unavailable && v.dailyLimit && v.dailyAverage !== null);
  return pct(sum(active.map((v) => v.dailyAverage)), sum(active.map((v) => v.dailyLimit)));
}

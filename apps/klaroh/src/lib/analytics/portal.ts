// The client portal's reading of Klaroh's analytics: what a business owner
// sees, in plain words. Pure and client-safe.
//
// Every number comes from the shared metric layer (metrics.ts) and the
// infrastructure layer (infrastructure.ts); this module only chooses, words
// and combines them. It never calculates a metric of its own, never shows a
// metric the metric layer withholds (meetings, open rate, revenue…), and never
// turns a missing value into 0.
//
// Commercial figures (cost, value per positive response) are entered by the
// agency in Klaroh — they never come from the sending platform — and are
// never converted between currencies.

import type { CampaignStatus } from '../types.ts';
import { fmtCount } from './format.ts';
import {
  countsFromRow,
  isShown,
  LOW_VOLUME_PROSPECTS,
  type CountKey,
  type Counts,
  type MetricKey,
  type MetricSet,
} from './metrics.ts';
import {
  infraSummary,
  mailboxViews,
  type AccountInput,
  type DomainInput,
} from './infrastructure.ts';

// ── what the client may see ─────────────────────────────────────────────────

export const PORTAL_METRIC_KEYS = [
  'emailsSent',
  'prospectsContacted',
  'humanReplies',
  'positive',
  'replyRate',
  'positiveRate',
  'bounces',
] as const satisfies readonly MetricKey[];
export type PortalMetricKey = (typeof PORTAL_METRIC_KEYS)[number];

/** The cards a new portal shows, in order. */
export const DEFAULT_PORTAL_METRICS: PortalMetricKey[] = ['emailsSent', 'prospectsContacted', 'humanReplies', 'positive', 'replyRate'];

/** Client-facing name and meaning of each metric (the calculation is the metric layer's). */
export const PORTAL_METRICS: Record<PortalMetricKey, { label: string; definition: string }> = {
  emailsSent: { label: 'Emails sent', definition: 'Outreach emails sent to prospects, including follow-ups.' },
  prospectsContacted: {
    label: 'Prospects reached',
    definition: 'People who received at least the first email. Someone included in two campaigns is counted in each.',
  },
  humanReplies: {
    label: 'Replies',
    definition: 'Prospects who replied. Automatic replies, such as out-of-office messages, are not counted.',
  },
  positive: {
    label: 'Positive responses',
    definition:
      'Prospects who showed real interest — for example asking for more information or agreeing to a meeting — as recorded by the team running your campaigns.',
  },
  replyRate: { label: 'Reply rate', definition: 'The share of prospects reached who replied.' },
  positiveRate: { label: 'Positive response rate', definition: 'The share of prospects reached who responded positively.' },
  bounces: { label: 'Bounces', definition: 'Emails that could not be delivered, as reported by the sending platform.' },
};

/** Asked for, but not offered: the data cannot support them yet. */
export const UNAVAILABLE_PORTAL_METRICS: { label: string; reason: string }[] = [
  { label: 'Meetings', reason: 'Not reliably reported by the sending platform yet' },
  { label: 'Open rate', reason: 'Open tracking is not reliable enough to report' },
  { label: 'Revenue', reason: 'Klaroh has no verified revenue data' },
];

/** The headline numbers of the "at a glance" view, when visible. */
export const SIMPLE_METRICS: PortalMetricKey[] = ['prospectsContacted', 'humanReplies', 'positive'];

export const isPortalMetric = (v: unknown): v is PortalMetricKey =>
  typeof v === 'string' && (PORTAL_METRIC_KEYS as readonly string[]).includes(v) && isShown(v as MetricKey);

// ── settings ────────────────────────────────────────────────────────────────

export type PortalMode = 'simple' | 'advanced';

export interface PortalSettings {
  mode: PortalMode;
  metrics: PortalMetricKey[];
  /** null = every campaign of the client, including ones added later. */
  campaignIds: string[] | null;
  showInfrastructure: boolean;
  showEconomics: boolean;
  /** Conversations with interested prospects (positive replies). */
  showConversations: boolean;
}

export const DEFAULT_PORTAL_SETTINGS: PortalSettings = {
  mode: 'advanced',
  metrics: DEFAULT_PORTAL_METRICS,
  campaignIds: null,
  showInfrastructure: true,
  showEconomics: true,
  showConversations: true,
};

export interface Economics {
  /** ISO 4217, always explicit. */
  currency: string;
  /** Total the client pays for the campaign. */
  cost: number | null;
  /** The agency's estimate of what one positive response is worth. */
  valuePerPositive: number | null;
}

export interface EconomicsInput extends Economics {
  campaignId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AMOUNT = 1_000_000_000_000;

let currencies: Set<string> | null = null;
/** A real ISO 4217 code (as known to the runtime). */
export function isCurrencyCode(v: unknown): v is string {
  if (typeof v !== 'string' || !/^[A-Z]{3}$/.test(v)) return false;
  if (!currencies) {
    try {
      currencies = new Set((Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('currency'));
    } catch {
      currencies = new Set();
    }
  }
  return currencies.size === 0 || currencies.has(v);
}

/** Offered first in the currency picker; every ISO code is accepted. */
export const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD', 'AED', 'SGD', 'CHF', 'NZD', 'ZAR', 'SEK', 'NOK', 'DKK', 'JPY'];

/** '', null, undefined → null; a non-negative amount (2 decimals) → number; anything else → undefined (invalid). */
export function parseAmount(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[,\s]/g, '')) : NaN;
  if (!Number.isFinite(n) || n < 0 || n >= MAX_AMOUNT) return undefined;
  return Math.round(n * 100) / 100;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Validates portal settings sent by the agency. Unknown metrics (or duplicates) are rejected, not dropped. */
export function parsePortalSettings(input: unknown): Parsed<PortalSettings> {
  const b = (input ?? {}) as Record<string, unknown>;
  if (b.mode !== 'simple' && b.mode !== 'advanced') return { ok: false, error: 'Choose a view' };
  if (!Array.isArray(b.metrics) || !b.metrics.every(isPortalMetric)) return { ok: false, error: 'Unknown metric' };
  if (new Set(b.metrics).size !== b.metrics.length) return { ok: false, error: 'A metric is listed twice' };
  let campaignIds: string[] | null = null;
  if (b.campaignIds !== null && b.campaignIds !== undefined) {
    if (!Array.isArray(b.campaignIds) || !b.campaignIds.every((id) => typeof id === 'string' && UUID.test(id))) {
      return { ok: false, error: 'Invalid campaign' };
    }
    if (b.campaignIds.length === 0) return { ok: false, error: 'Choose at least one campaign' };
    campaignIds = [...new Set(b.campaignIds as string[])];
  }
  if (typeof b.showInfrastructure !== 'boolean' || typeof b.showEconomics !== 'boolean') return { ok: false, error: 'Invalid section setting' };
  // optional for older clients of this API: unchanged meaning "shown"
  if (b.showConversations !== undefined && typeof b.showConversations !== 'boolean') return { ok: false, error: 'Invalid section setting' };
  return {
    ok: true,
    value: {
      mode: b.mode,
      metrics: b.metrics as PortalMetricKey[],
      campaignIds,
      showInfrastructure: b.showInfrastructure,
      showEconomics: b.showEconomics,
      showConversations: b.showConversations !== false,
    },
  };
}

export function parseEconomics(input: unknown): Parsed<EconomicsInput[]> {
  if (input === undefined || input === null) return { ok: true, value: [] };
  if (!Array.isArray(input) || input.length > 500) return { ok: false, error: 'Invalid campaign economics' };
  const out: EconomicsInput[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const r = (raw ?? {}) as Record<string, unknown>;
    if (typeof r.campaignId !== 'string' || !UUID.test(r.campaignId) || seen.has(r.campaignId)) return { ok: false, error: 'Invalid campaign' };
    seen.add(r.campaignId);
    if (!isCurrencyCode(r.currency)) return { ok: false, error: 'Choose a valid currency' };
    const cost = parseAmount(r.cost);
    const valuePerPositive = parseAmount(r.valuePerPositive);
    if (cost === undefined) return { ok: false, error: 'Campaign cost must be a positive amount' };
    if (valuePerPositive === undefined) return { ok: false, error: 'Value per positive response must be a positive amount' };
    out.push({ campaignId: r.campaignId, currency: r.currency, cost, valuePerPositive });
  }
  return { ok: true, value: out };
}

// ── the report's campaigns ──────────────────────────────────────────────────

export interface PortalCampaign {
  id: string;
  name: string;
  status: CampaignStatus;
  counts: Counts;
  capturedAt: string | null;
  startDate: string | null;
  /** No longer returned by the sending platform (history kept, no longer updated). */
  ended: boolean;
  economics: Economics | null;
}

const STATUSES: CampaignStatus[] = ['draft', 'active', 'paused', 'completed', 'error', 'suspended', 'unknown'];
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** A campaign of get_client_portal(). */
export function portalCampaignFromRow(row: Record<string, unknown>): PortalCampaign {
  const e = row.economics as Record<string, unknown> | null | undefined;
  const status = STATUSES.includes(row.status as CampaignStatus) ? (row.status as CampaignStatus) : 'unknown';
  return {
    id: String(row.id),
    name: typeof row.name === 'string' && row.name ? row.name : 'Campaign',
    status,
    counts: countsFromRow(row),
    capturedAt: (row.captured_at as string | null) ?? null,
    startDate: (row.start_date as string | null) ?? ((row.external_created_at as string | null)?.slice(0, 10) ?? null),
    ended: !!row.unavailable_since,
    economics:
      e && typeof e.currency === 'string'
        ? { currency: e.currency, cost: num(e.cost), valuePerPositive: num(e.value_per_positive) }
        : null,
  };
}

export type Tone = 'good' | 'neutral' | 'warning' | 'critical' | 'info';

/** A campaign's state in business words. */
export function campaignPhase(c: Pick<PortalCampaign, 'status' | 'ended'>): { label: string; tone: Tone } {
  if (c.ended) return { label: 'Ended', tone: 'neutral' };
  switch (c.status) {
    case 'active':
      return { label: 'Running', tone: 'good' };
    case 'paused':
      return { label: 'Paused', tone: 'neutral' };
    case 'completed':
      return { label: 'Completed', tone: 'neutral' };
    case 'draft':
      return { label: 'Not started', tone: 'neutral' };
    case 'error':
    case 'suspended':
      return { label: 'Needs attention', tone: 'warning' };
    default:
      return { label: 'Status unavailable', tone: 'neutral' };
  }
}

const plural = (n: number, one: string, many = `${one}s`) => `${fmtCount(n)} ${n === 1 ? one : many}`;

/** The report as a whole: is outreach running? */
export function reportStatus(campaigns: PortalCampaign[]): { label: string; tone: Tone; detail: string } {
  const n = campaigns.length;
  if (n === 0) return { label: 'No campaigns', tone: 'neutral', detail: 'No campaigns are included yet' };
  const running = campaigns.filter((c) => !c.ended && c.status === 'active').length;
  if (running > 0) {
    return { label: 'Live', tone: 'good', detail: n === 1 ? 'Campaign running' : `${running} of ${plural(n, 'campaign')} running` };
  }
  if (campaigns.some((c) => !c.ended && (c.status === 'error' || c.status === 'suspended'))) {
    return { label: 'Needs attention', tone: 'warning', detail: 'Sending is interrupted' };
  }
  if (campaigns.every((c) => c.ended || c.status === 'completed')) return { label: 'Completed', tone: 'neutral', detail: n === 1 ? 'Campaign completed' : 'All campaigns completed' };
  if (campaigns.some((c) => c.status === 'paused')) return { label: 'Paused', tone: 'neutral', detail: 'Not sending right now' };
  return { label: 'Not started', tone: 'neutral', detail: 'Not sending yet' };
}

// ── business summary (deterministic rules) ──────────────────────────────────

export type Verdict = 'strong' | 'moderate' | 'weak' | 'insufficient';

/** Below this many prospects reached, no judgement is made. */
export const MIN_PROSPECTS_FOR_VERDICT = LOW_VOLUME_PROSPECTS;
/** Strong: at least this many positive responses… */
export const STRONG_MIN_POSITIVE = 5;
/** …at this positive response rate (% of prospects reached) or better. */
export const STRONG_POSITIVE_RATE = 0.75;
/** Weak: reply rate under this %… */
export const WEAK_REPLY_RATE = 0.5;
/** …and positive response rate under this % (or none reported). */
export const WEAK_POSITIVE_RATE = 0.2;

export const VERDICT_INFO: Record<Verdict, { label: string; tone: Tone }> = {
  strong: { label: 'Producing results', tone: 'good' },
  moderate: { label: 'Early results', tone: 'info' },
  weak: { label: 'Low response so far', tone: 'warning' },
  insufficient: { label: 'Gathering data', tone: 'neutral' },
};

export function verdictFor(set: MetricSet): Verdict {
  const prospects = set.counts.prospectsContacted;
  if (set.campaigns === 0 || prospects === null || prospects < MIN_PROSPECTS_FOR_VERDICT) return 'insufficient';
  const { positive } = set.counts;
  const { replyRate, positiveRate } = set.rates;
  if (positive !== null && positive >= STRONG_MIN_POSITIVE && positiveRate !== null && positiveRate >= STRONG_POSITIVE_RATE) return 'strong';
  if (replyRate !== null && replyRate < WEAK_REPLY_RATE && (positiveRate === null || positiveRate < WEAK_POSITIVE_RATE)) return 'weak';
  return 'moderate';
}

export interface PortalSummary {
  verdict: Verdict;
  label: string;
  tone: Tone;
  sentences: string[];
}

/**
 * Plain-language summary of the report. Only counts the client is allowed to
 * see are quoted; the judgement follows the rules above and nothing else.
 */
export function portalSummary(set: MetricSet, campaigns: PortalCampaign[], visible: PortalMetricKey[]): PortalSummary {
  const verdict = verdictFor(set);
  const n = campaigns.length;
  const one = n === 1;
  const scope = one ? 'Your campaign' : `Your ${n} campaigns`;
  const has = one ? 'has' : 'have';
  const show = (k: CountKey) => visible.includes(k as PortalMetricKey) && set.counts[k] !== null;
  const sentences: string[] = [];

  if (n === 0) {
    return { verdict, ...VERDICT_INFO[verdict], sentences: ['No campaigns are included in this report yet.'] };
  }
  if (set.counts.prospectsContacted === null && set.counts.emailsSent === null) {
    return {
      verdict,
      ...VERDICT_INFO[verdict],
      sentences: [`Results haven’t been reported yet. They’ll appear here after the first update.`],
    };
  }

  const outcomes = [
    show('humanReplies') ? plural(set.counts.humanReplies!, 'reply', 'replies') : null,
    show('positive') ? plural(set.counts.positive!, 'positive response') : null,
  ].filter(Boolean) as string[];
  const generated = outcomes.length ? outcomes.join(' and ') : null;
  if (show('prospectsContacted')) {
    const reached = `${scope} ${has} reached ${plural(set.counts.prospectsContacted!, 'prospect')}`;
    if (verdict === 'weak') sentences.push(`${reached}, but response volume is currently low.`);
    else sentences.push(generated ? `${reached} and generated ${generated}.` : `${reached}.`);
  } else if (generated) {
    sentences.push(`${scope} ${has} generated ${generated}.`);
  }

  switch (verdict) {
    case 'strong':
      sentences.push('Outbound is generating positive engagement and the campaigns are actively producing opportunities.');
      break;
    case 'moderate':
      sentences.push('Prospects are engaging. It is still early to judge the results, and the picture will sharpen as more prospects are contacted.');
      break;
    case 'weak':
      if (!show('prospectsContacted')) sentences.push('Response volume is currently low.');
      sentences.push('More data is needed before drawing a strong conclusion.');
      break;
    case 'insufficient':
      sentences.push(
        `${one ? 'The campaign is' : 'The campaigns are'} still gathering data. We’ll have a clearer picture as more prospects are contacted.`
      );
      break;
  }

  const running = campaigns.filter((c) => !c.ended && c.status === 'active').length;
  if (one) {
    const phase = campaignPhase(campaigns[0]);
    if (phase.label === 'Paused') sentences.push('The campaign is currently paused.');
    else if (phase.label === 'Completed' || phase.label === 'Ended') sentences.push('The campaign has finished sending.');
  } else if (running === 0) {
    sentences.push('No campaigns are sending right now.');
  } else if (running < n) {
    sentences.push(`${running} of the ${n} campaigns ${running === 1 ? 'is' : 'are'} currently running.`);
  }

  return { verdict, ...VERDICT_INFO[verdict], sentences };
}

// ── campaign economics ─────────────────────────────────────────────────────

export interface EconomicsGroup {
  currency: string;
  /** Campaigns with a cost in this currency (the figures below cover exactly these). */
  campaigns: number;
  cost: number;
  positive: number | null;
  prospects: number | null;
  costPerPositive: number | null;
  costPerProspect: number | null;
  /** positive × value per positive, only when every campaign in the group has a value. */
  estimatedValue: number | null;
  /** (estimated value − cost) ÷ cost, %. */
  returnPct: number | null;
  /** The value per positive response when it is the same for every campaign in the group. */
  valuePerPositive: number | null;
}

export interface EconomicsSummary {
  groups: EconomicsGroup[];
  /** Campaigns in the report without a cost. */
  uncovered: number;
  total: number;
}

const sumAll = (vals: (number | null)[]): number | null => (vals.every((v) => v !== null) ? vals.reduce<number>((s, v) => s + (v as number), 0) : null);

/**
 * Investment and return per currency. Only campaigns with a cost count; costs
 * in different currencies are never added together. Positive responses come
 * from the same campaigns as the cost, so the ratio is like for like.
 */
export function economicsSummary(campaigns: PortalCampaign[]): EconomicsSummary {
  const byCurrency = new Map<string, PortalCampaign[]>();
  for (const c of campaigns) {
    if (!c.economics || c.economics.cost === null) continue;
    byCurrency.set(c.economics.currency, [...(byCurrency.get(c.economics.currency) ?? []), c]);
  }
  const groups = [...byCurrency.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, list]): EconomicsGroup => {
      const cost = list.reduce((s, c) => s + (c.economics!.cost ?? 0), 0);
      const positive = sumAll(list.map((c) => c.counts.positive));
      const prospects = sumAll(list.map((c) => c.counts.prospectsContacted));
      const values = list.map((c) => c.economics!.valuePerPositive);
      const estimatedValue =
        values.every((v) => v !== null) && list.every((c) => c.counts.positive !== null)
          ? list.reduce((s, c) => s + c.economics!.valuePerPositive! * c.counts.positive!, 0)
          : null;
      const distinct = new Set(values);
      return {
        currency,
        campaigns: list.length,
        cost,
        positive,
        prospects,
        costPerPositive: positive !== null && positive > 0 ? cost / positive : null,
        costPerProspect: prospects !== null && prospects > 0 ? cost / prospects : null,
        estimatedValue,
        returnPct: estimatedValue !== null && cost > 0 ? ((estimatedValue - cost) / cost) * 100 : null,
        valuePerPositive: distinct.size === 1 ? values[0] : null,
      };
    });
  const covered = groups.reduce((s, g) => s + g.campaigns, 0);
  return { groups, uncovered: campaigns.length - covered, total: campaigns.length };
}

// ── sending infrastructure, in business words ──────────────────────────────

export interface PortalAccountRow {
  account: number;
  domain: number;
  status: string | null;
  warmup_status: string | null;
  warmup_score: number | string | null;
  daily_limit: number | null;
  last_synced_at: string | null;
  spf: boolean | null;
  dkim: boolean | null;
  dmarc: boolean | null;
  mx: boolean | null;
  checked_at: string | null;
}

export interface PortalInfrastructure {
  state: 'good' | 'attention' | 'down' | 'unknown';
  label: string;
  detail: string;
  total: number;
  active: number;
  attention: number;
  checkedAt: string | null;
}

const ACCOUNT_STATES = ['active', 'paused', 'error'];

/**
 * One health line for the client, from the sending accounts the report's
 * campaigns use. "Operating normally" only when every current account passes
 * the infrastructure layer's health checks; no accounts → no claim at all.
 */
export function portalInfrastructure(rows: PortalAccountRow[] | null | undefined, today: string): PortalInfrastructure {
  const list = rows ?? [];
  const checkedAt = list.reduce<string | null>((m, r) => (r.last_synced_at && (!m || r.last_synced_at > m) ? r.last_synced_at : m), null);
  if (list.length === 0) {
    return { state: 'unknown', label: 'Not reported yet', detail: 'The status of the sending accounts has not been reported yet.', total: 0, active: 0, attention: 0, checkedAt };
  }
  const accounts: AccountInput[] = list.map((r) => ({
    id: `a${r.account}`,
    email: `account-${r.account}@domain-${r.domain}`,
    status: (ACCOUNT_STATES.includes(r.status ?? '') ? r.status : 'unknown') as AccountInput['status'],
    providerStatus: null,
    warmupStatus: (ACCOUNT_STATES.includes(r.warmup_status ?? '') ? r.warmup_status : 'unknown') as AccountInput['warmupStatus'],
    warmupScore: num(r.warmup_score),
    dailyLimit: num(r.daily_limit),
    sendingGapMinutes: null,
    trackingDomain: null,
    trackingDomainStatus: null,
    lastUsedAt: null,
    unavailableSince: null,
  }));
  const domains = new Map<string, DomainInput>();
  for (const r of list) {
    if (!r.checked_at) continue;
    domains.set(`domain-${r.domain}`, { domain: `domain-${r.domain}`, spf: r.spf, dkim: r.dkim, dmarc: r.dmarc, mx: r.mx, checked_at: r.checked_at });
  }
  // No per-day sending is passed: sending-volume checks are not claimed either way.
  const views = mailboxViews(accounts, [], [...domains.values()], [], today);
  const s = infraSummary(views);
  const attention = views.filter((v) => !v.healthy && v.status !== 'paused').length;
  const paused = s.paused ? ` · ${fmtCount(s.paused)} paused` : '';
  const active = `${plural(s.active, 'sending account')} active`;
  if (s.active === 0) {
    return { state: 'down', label: 'Not sending', detail: `No sending accounts are active right now${paused}.`, total: s.total, active: 0, attention, checkedAt };
  }
  if (attention > 0) {
    return {
      state: 'attention',
      label: 'Needs attention',
      detail: `${fmtCount(s.active)} of ${plural(s.total, 'sending account')} active · ${fmtCount(attention)} need${attention === 1 ? 's' : ''} attention${paused}`,
      total: s.total,
      active: s.active,
      attention,
      checkedAt,
    };
  }
  return { state: 'good', label: 'Operating normally', detail: `${active}${paused}`, total: s.total, active: s.active, attention: 0, checkedAt };
}

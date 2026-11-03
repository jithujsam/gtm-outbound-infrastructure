// Klaroh's analytics metrics: ONE place that defines every number Klaroh shows
// about campaign performance, where it comes from and how it is calculated.
// Overview, Campaigns, a campaign page, the client dashboard and the public
// client portal all read their numbers through this module. Pure and
// client-safe: no I/O, no provider field names outside the definitions.
//
// Principle: Instantly is the source of raw data; Klaroh defines the business
// metrics. A metric the data cannot support is never shown, never inferred and
// never turned into 0.
//
//   FACT     reported by Instantly and stored as-is (campaign_stats)
//   DERIVED  calculated by Klaroh from FACT values
//
// Period: every value is lifetime-to-date — the latest stored snapshot of each
// campaign ("All time"). Klaroh does not compute date ranges from snapshots.
// A future per-day source only has to produce the same `Counts` per campaign.

import type { CampaignStatus } from '../types.ts';
import { DASH, fmtCompact, fmtCount, fmtPct, ratio } from './format.ts';

// ── definitions ─────────────────────────────────────────────────────────────

export const COUNT_KEYS = ['emailsSent', 'prospectsContacted', 'humanReplies', 'positive', 'bounces'] as const;
export type CountKey = (typeof COUNT_KEYS)[number];
export const RATE_KEYS = ['replyRate', 'positiveRate', 'bounceRate', 'emailsPerPositive'] as const;
export type RateKey = (typeof RATE_KEYS)[number];
export type MetricKey = CountKey | RateKey;

export type MetricKind = 'fact' | 'derived';
/** reliable: shown. unverified: defined but withheld until its meaning is confirmed. */
export type Reliability = 'reliable' | 'unverified';

export interface MetricDefinition {
  key: MetricKey;
  label: string;
  kind: MetricKind;
  format: 'count' | 'pct' | 'emailsPer';
  /** What the number means, in plain words (tooltips / help text). */
  definition: string;
  /** Where the value comes from: provider field → Klaroh column. */
  source: string;
  /** How Klaroh calculates a derived metric. */
  calculation?: string;
  reliability: Reliability;
}

/**
 * Whether Instantly's `bounced_count` counts bounced prospects (one per lead)
 * or bounced emails has not been confirmed against Instantly. Until it is,
 * the bounce COUNT is shown and the bounce RATE is withheld.
 */
export const BOUNCE_UNIT_VERIFIED = false;

/** Emails per positive is only shown from this many positive prospects (smaller samples swing wildly). */
export const MIN_POSITIVE_FOR_EMAILS_PER_POSITIVE = 5;

/** Below this many prospects contacted a campaign's rates are flagged as low volume. */
export const LOW_VOLUME_PROSPECTS = 100;

export const PERIOD_LABEL = 'All time';

/** The stored campaign_stats column behind each count. */
export const STAT_COLUMN: Record<CountKey, string> = {
  emailsSent: 'emails_sent',
  prospectsContacted: 'new_leads_contacted',
  humanReplies: 'replies_unique',
  positive: 'opportunities',
  bounces: 'bounces',
};

export const METRICS: Record<MetricKey, MetricDefinition> = {
  emailsSent: {
    key: 'emailsSent',
    label: 'Emails sent',
    kind: 'fact',
    format: 'count',
    definition: 'Campaign emails sent, including follow-ups. Warmup emails are not included.',
    source: 'Instantly emails_sent_count → campaign_stats.emails_sent',
    reliability: 'reliable',
  },
  prospectsContacted: {
    key: 'prospectsContacted',
    label: 'Prospects contacted',
    kind: 'fact',
    format: 'count',
    definition:
      'Prospects who received the first email of the sequence. Across several campaigns this is a sum per campaign — a person in two campaigns counts twice.',
    source: 'Instantly new_leads_contacted_count → campaign_stats.new_leads_contacted',
    reliability: 'reliable',
  },
  humanReplies: {
    key: 'humanReplies',
    label: 'Human replies',
    kind: 'fact',
    format: 'count',
    definition: 'Prospects who replied. Automatic replies (out-of-office and similar, as classified by Instantly) are excluded.',
    source: 'Instantly reply_count_unique → campaign_stats.replies_unique',
    reliability: 'reliable',
  },
  positive: {
    key: 'positive',
    label: 'Positive (as marked in Instantly)',
    kind: 'fact',
    format: 'count',
    definition:
      'Prospects currently marked with a positive status in Instantly (interested, meeting booked, meeting completed or won). Set by your team or Instantly’s AI; a lead can be marked positive without an email reply.',
    source: 'Instantly total_opportunities → campaign_stats.opportunities',
    reliability: 'reliable',
  },
  bounces: {
    key: 'bounces',
    label: 'Bounces',
    kind: 'fact',
    format: 'count',
    definition: 'Bounces reported by Instantly.',
    source: 'Instantly bounced_count → campaign_stats.bounces',
    reliability: 'reliable',
  },
  replyRate: {
    key: 'replyRate',
    label: 'Reply rate',
    kind: 'derived',
    format: 'pct',
    definition: 'Share of prospects contacted who replied (human replies only).',
    source: 'Human replies, Prospects contacted',
    calculation: 'Human replies ÷ Prospects contacted',
    reliability: 'reliable',
  },
  positiveRate: {
    key: 'positiveRate',
    label: 'Positive rate',
    kind: 'derived',
    format: 'pct',
    definition: 'Share of prospects contacted who are marked positive in Instantly.',
    source: 'Positive, Prospects contacted',
    calculation: 'Positive ÷ Prospects contacted',
    reliability: 'reliable',
  },
  bounceRate: {
    key: 'bounceRate',
    label: 'Bounce rate',
    kind: 'derived',
    format: 'pct',
    definition: 'Share of prospects contacted whose email bounced.',
    source: 'Bounces, Prospects contacted',
    calculation: 'Bounces ÷ Prospects contacted',
    reliability: BOUNCE_UNIT_VERIFIED ? 'reliable' : 'unverified',
  },
  emailsPerPositive: {
    key: 'emailsPerPositive',
    label: 'Emails per positive',
    kind: 'derived',
    format: 'emailsPer',
    definition: `How many emails were sent for each positive prospect. Shown from ${MIN_POSITIVE_FOR_EMAILS_PER_POSITIVE} positive prospects.`,
    source: 'Emails sent, Positive',
    calculation: 'Emails sent ÷ Positive',
    reliability: 'reliable',
  },
};

/** The metrics Klaroh shows (unverified ones are withheld everywhere). */
export const isShown = (key: MetricKey): boolean => METRICS[key].reliability === 'reliable';

// ── values ──────────────────────────────────────────────────────────────────

/** One campaign's counts. null = Instantly did not report the value (never 0). */
export type Counts = Record<CountKey, number | null>;

function count(v: unknown): number | null {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Counts from a stored snapshot row (campaign_stats, a read-model row or a
 * CampaignView — they share the column names). Missing stays null.
 */
export function countsFromRow(row: object | null | undefined): Counts {
  const r = (row ?? null) as Record<string, unknown> | null;
  const out = {} as Counts;
  for (const k of COUNT_KEYS) out[k] = r ? count(r[STAT_COLUMN[k]]) : null;
  return out;
}

export const emptyCounts = (): Counts => countsFromRow(null);

export interface MetricSet {
  /** Sum over campaigns that report each count; null when none does. */
  counts: Counts;
  /** Derived values; null when they cannot be calculated (see readMetric for why). */
  rates: Record<RateKey, number | null>;
  /** How many campaigns report each count. */
  reporting: Record<CountKey, number>;
  /** Positive summed over the campaigns that also report emails sent (emails-per-positive basis). */
  positiveBasis: number | null;
  campaigns: number;
}

/** numerator and denominator summed over the items that report BOTH (no dilution by unreported values). */
function paired(list: Counts[], num: CountKey, den: CountKey): { n: number; d: number } | null {
  let n = 0;
  let d = 0;
  let any = false;
  for (const c of list) {
    const a = c[num];
    const b = c[den];
    if (a === null || b === null) continue;
    n += a;
    d += b;
    any = true;
  }
  return any ? { n, d } : null;
}

const pctOf = (p: { n: number; d: number } | null): number | null => {
  const r = p ? ratio(p.n, p.d) : null;
  return r === null ? null : r * 100;
};

/** Aggregates campaign counts and derives every rate from the aggregate (never an average of rates). */
export function metricSet(list: Counts[]): MetricSet {
  const counts = emptyCounts();
  const reporting = Object.fromEntries(COUNT_KEYS.map((k) => [k, 0])) as Record<CountKey, number>;
  for (const c of list) {
    for (const k of COUNT_KEYS) {
      const v = c[k];
      if (v === null) continue;
      counts[k] = (counts[k] ?? 0) + v;
      reporting[k]++;
    }
  }
  const perPositive = paired(list, 'emailsSent', 'positive');
  const positiveBasis = perPositive ? perPositive.d : null;
  return {
    counts,
    reporting,
    positiveBasis,
    campaigns: list.length,
    rates: {
      replyRate: pctOf(paired(list, 'humanReplies', 'prospectsContacted')),
      positiveRate: pctOf(paired(list, 'positive', 'prospectsContacted')),
      bounceRate: BOUNCE_UNIT_VERIFIED ? pctOf(paired(list, 'bounces', 'prospectsContacted')) : null,
      emailsPerPositive:
        perPositive && perPositive.d >= MIN_POSITIVE_FOR_EMAILS_PER_POSITIVE ? ratio(perPositive.n, perPositive.d) : null,
    },
  };
}

/** Why a value is or is not available. */
export type MetricState = 'ok' | 'not_reported' | 'no_prospects' | 'below_threshold' | 'unverified';

export interface MetricReading {
  key: MetricKey;
  value: number | null;
  state: MetricState;
}

const RATE_INPUTS: Record<RateKey, [CountKey, CountKey]> = {
  replyRate: ['humanReplies', 'prospectsContacted'],
  positiveRate: ['positive', 'prospectsContacted'],
  bounceRate: ['bounces', 'prospectsContacted'],
  emailsPerPositive: ['emailsSent', 'positive'],
};

export function readMetric(set: MetricSet, key: MetricKey): MetricReading {
  if ((COUNT_KEYS as readonly string[]).includes(key)) {
    const value = set.counts[key as CountKey];
    return { key, value, state: value === null ? 'not_reported' : 'ok' };
  }
  const rate = key as RateKey;
  const value = set.rates[rate];
  if (METRICS[rate].reliability === 'unverified') return { key, value: null, state: 'unverified' };
  if (value !== null) return { key, value, state: 'ok' };
  const [num, den] = RATE_INPUTS[rate];
  if (set.counts[num] === null || set.counts[den] === null) return { key, value, state: 'not_reported' };
  if (rate === 'emailsPerPositive') return { key, value, state: 'below_threshold' };
  return { key, value, state: 'no_prospects' };
}

export function formatMetric(key: MetricKey, value: number | null, compact = false): string {
  if (value === null) return DASH;
  switch (METRICS[key].format) {
    case 'pct':
      return fmtPct(value);
    case 'emailsPer':
      return `${fmtCount(value)} : 1`;
    default:
      return compact ? fmtCompact(value) : fmtCount(value);
  }
}

/** A short explanation for a value that is not shown. */
export function stateText(state: MetricState): string {
  switch (state) {
    case 'not_reported':
      return 'Not reported by Instantly';
    case 'no_prospects':
      return 'No prospects contacted yet';
    case 'below_threshold':
      return `Shown from ${MIN_POSITIVE_FOR_EMAILS_PER_POSITIVE} positive`;
    case 'unverified':
      return 'Pending verification';
    default:
      return '';
  }
}

/** Tooltip text: definition, calculation and source. */
export function metricHelp(key: MetricKey): string {
  const d = METRICS[key];
  return [d.definition, d.calculation ? `Calculation: ${d.calculation}.` : null, d.kind === 'fact' ? `Source: ${d.source}.` : null]
    .filter(Boolean)
    .join(' ');
}

// ── campaigns ───────────────────────────────────────────────────────────────

export interface CampaignRecord {
  id: string;
  /** The provider's campaign name (source of truth). */
  name: string;
  provider: string | null;
  status: CampaignStatus;
  clientIds: string[];
  counts: Counts;
  /** When the snapshot behind `counts` was captured; null = no snapshot yet. */
  capturedAt: string | null;
  senderEmails: string[];
  unavailableSince: string | null;
}

export interface CampaignScope {
  clientId: string | null;
  campaignId: string | null;
  provider: string | null;
}

/** The campaigns in scope. A campaign appears once even when several clients use it. */
export function scopeCampaigns(records: CampaignRecord[], scope: CampaignScope): CampaignRecord[] {
  const seen = new Set<string>();
  return records.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return (
      (!scope.clientId || r.clientIds.includes(scope.clientId)) &&
      (!scope.campaignId || r.id === scope.campaignId) &&
      (!scope.provider || r.provider === scope.provider)
    );
  });
}

/** Aggregate metrics over campaigns (de-duplicated by campaign id). */
export function campaignsMetricSet(records: CampaignRecord[]): MetricSet {
  const byId = new Map(records.map((r) => [r.id, r.counts]));
  return metricSet([...byId.values()]);
}

/** Latest capture among the campaigns (the "as of" of an all-time view). */
export function latestCapture(records: CampaignRecord[]): string | null {
  return records.reduce<string | null>((max, r) => (r.capturedAt && (!max || r.capturedAt > max) ? r.capturedAt : max), null);
}

export interface ComparisonRow {
  id: string;
  name: string;
  status: CampaignStatus;
  provider: string | null;
  set: MetricSet;
  lowVolume: boolean;
}

export function comparisonRows(records: CampaignRecord[]): ComparisonRow[] {
  return records.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    provider: r.provider,
    set: metricSet([r.counts]),
    lowVolume: (r.counts.prospectsContacted ?? 0) < LOW_VOLUME_PROSPECTS,
  }));
}

export type ComparisonKey = 'name' | MetricKey;

function sortValue(r: ComparisonRow, key: MetricKey): number | null {
  return (COUNT_KEYS as readonly string[]).includes(key) ? r.set.counts[key as CountKey] : r.set.rates[key as RateKey];
}

/**
 * Sorts comparison rows. For rates, campaigns with enough volume rank first so
 * one lucky reply on a tiny campaign never tops a real one; unknown values last.
 */
export function sortComparison(rows: ComparisonRow[], key: ComparisonKey, dir: 'asc' | 'desc' = 'desc'): ComparisonRow[] {
  const rateLike = key !== 'name' && METRICS[key].format !== 'count';
  return [...rows].sort((a, b) => {
    if (key === 'name') return dir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    if (rateLike && a.lowVolume !== b.lowVolume) return a.lowVolume ? 1 : -1;
    const x = sortValue(a, key);
    const y = sortValue(b, key);
    if (x === null && y === null) return a.name.localeCompare(b.name);
    if (x === null) return 1;
    if (y === null) return -1;
    const d = x - y;
    if (d !== 0) return dir === 'asc' ? d : -d;
    return a.name.localeCompare(b.name);
  });
}

export interface ClientBreakdown {
  id: string;
  label: string;
  campaigns: number;
  set: MetricSet;
}

/**
 * Per-client metrics. A campaign used by several clients counts for each of
 * them, so client rows can add up to more than the workspace total.
 */
export function clientBreakdown(records: CampaignRecord[], clients: { id: string; label: string }[]): ClientBreakdown[] {
  return clients
    .map((c) => {
      const own = scopeCampaigns(records, { clientId: c.id, campaignId: null, provider: null });
      return { id: c.id, label: c.label, campaigns: own.length, set: campaignsMetricSet(own) };
    })
    .filter((c) => c.campaigns > 0);
}

// ── funnel ──────────────────────────────────────────────────────────────────

export interface FunnelStage {
  key: CountKey;
  label: string;
  value: number | null;
  /** % of prospects contacted (the stage's rate); null for the first stage or when unknown. */
  ofProspects: number | null;
  rateKey: RateKey | null;
}

/**
 * Prospects contacted → Human replies → Positive. Each later stage is measured
 * against prospects contacted, never against the previous stage: Instantly can
 * mark a prospect positive without an email reply, so Positive is not a subset
 * of Human replies.
 */
export function funnelStages(set: MetricSet): FunnelStage[] {
  return [
    { key: 'prospectsContacted', label: METRICS.prospectsContacted.label, value: set.counts.prospectsContacted, ofProspects: null, rateKey: null },
    { key: 'humanReplies', label: METRICS.humanReplies.label, value: set.counts.humanReplies, ofProspects: set.rates.replyRate, rateKey: 'replyRate' },
    { key: 'positive', label: 'Positive', value: set.counts.positive, ofProspects: set.rates.positiveRate, rateKey: 'positiveRate' },
  ];
}

// ── observations ────────────────────────────────────────────────────────────

export interface Observation {
  key: string;
  label: string;
  campaign: { id: string; name: string } | null;
  value: string;
  detail: string;
}

/**
 * Plain statements about the campaigns in view, each backed by a trusted
 * metric. Rate leaders only consider campaigns with enough prospects.
 */
export function observations(rows: ComparisonRow[]): Observation[] {
  const out: Observation[] = [];
  const sampled = rows.filter((r) => !r.lowVolume);
  const best = (list: ComparisonRow[], pick: (r: ComparisonRow) => number | null) =>
    list.reduce<ComparisonRow | null>((top, r) => {
      const v = pick(r);
      if (v === null || v <= 0) return top;
      return !top || v > (pick(top) ?? 0) ? r : top;
    }, null);

  const pos = best(sampled, (r) => r.set.rates.positiveRate);
  if (pos) {
    out.push({
      key: 'positiveRate',
      label: 'Highest positive rate',
      campaign: { id: pos.id, name: pos.name },
      value: formatMetric('positiveRate', pos.set.rates.positiveRate),
      detail: `${fmtCount(pos.set.counts.positive)} positive of ${fmtCount(pos.set.counts.prospectsContacted)} prospects`,
    });
  }
  const rep = best(sampled, (r) => r.set.rates.replyRate);
  if (rep) {
    out.push({
      key: 'replyRate',
      label: 'Highest reply rate',
      campaign: { id: rep.id, name: rep.name },
      value: formatMetric('replyRate', rep.set.rates.replyRate),
      detail: `${fmtCount(rep.set.counts.humanReplies)} human replies of ${fmtCount(rep.set.counts.prospectsContacted)} prospects`,
    });
  }
  const most = best(rows, (r) => r.set.counts.positive);
  if (most && most.id !== pos?.id) {
    out.push({
      key: 'mostPositive',
      label: 'Most positive prospects',
      campaign: { id: most.id, name: most.name },
      value: fmtCount(most.set.counts.positive),
      detail: 'As marked in Instantly',
    });
  }
  const low = rows.length - sampled.length;
  if (low > 0) {
    out.push({
      key: 'lowVolume',
      label: 'Low volume',
      campaign: null,
      value: String(low),
      detail: `campaign${low === 1 ? '' : 's'} under ${LOW_VOLUME_PROSPECTS} prospects contacted — not ranked on rates`,
    });
  }
  return out;
}

// Rankings for the bar charts (campaigns or clients side by side on one trusted
// metric). Pure and client-safe: the chart re-ranks in the browser when the
// metric changes, with the same rules as the comparison table
// (metrics.ts → sortComparison): on rates, low-volume rows rank after the rest
// so one lucky reply on a tiny campaign never tops a real one; unknown last.

import { fmtCount, fmtPct } from './format.ts';
import { LOW_VOLUME_PROSPECTS, type MetricSet } from './metrics.ts';

export type RankMetric = 'positive' | 'positiveRate' | 'humanReplies';

export const RANK_METRICS: { key: RankMetric; label: string; format: 'count' | 'pct' }[] = [
  { key: 'positive', label: 'Positive', format: 'count' },
  { key: 'positiveRate', label: 'Positive rate', format: 'pct' },
  { key: 'humanReplies', label: 'Human replies', format: 'count' },
];

export interface RankRow {
  id: string;
  name: string;
  /** Where clicking the bar goes (campaign page, or a client filter). */
  href: string;
  /** Under LOW_VOLUME_PROSPECTS prospects contacted: rates are not ranked with the rest. */
  lowVolume: boolean;
  values: Record<RankMetric, number | null>;
  /** One line of context per metric for the tooltip and table ("7 of 990 prospects"). */
  details: Record<RankMetric, string>;
}

/** A ranking row from a metric set (one campaign or one client). */
export function rankRow(id: string, name: string, href: string, set: MetricSet): RankRow {
  const { counts, rates } = set;
  const prospects = counts.prospectsContacted;
  const of = prospects === null ? 'prospects not reported' : `of ${fmtCount(prospects)} prospects`;
  return {
    id,
    name,
    href,
    lowVolume: (prospects ?? 0) < LOW_VOLUME_PROSPECTS,
    values: { positive: counts.positive, positiveRate: rates.positiveRate, humanReplies: counts.humanReplies },
    details: {
      positive: counts.positive === null ? 'Not reported' : `${fmtPct(rates.positiveRate)} ${of}`,
      positiveRate: counts.positive === null ? 'Not reported' : `${fmtCount(counts.positive)} positive ${of}`,
      humanReplies: counts.humanReplies === null ? 'Not reported' : `${fmtPct(rates.replyRate)} ${of}`,
    },
  };
}

/** Rows ordered for one metric: highest first; on rates low volume after the rest; unknown last. */
export function rankRows(rows: RankRow[], metric: RankMetric): RankRow[] {
  const isRate = RANK_METRICS.find((m) => m.key === metric)?.format === 'pct';
  return [...rows].sort((a, b) => {
    if (isRate && a.lowVolume !== b.lowVolume) return a.lowVolume ? 1 : -1;
    const x = a.values[metric];
    const y = b.values[metric];
    if (x === null && y === null) return a.name.localeCompare(b.name);
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x || a.name.localeCompare(b.name);
  });
}

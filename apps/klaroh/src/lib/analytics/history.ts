// Campaign figures over time, from the stored daily snapshots (campaign_stats:
// one cumulative, lifetime-to-date snapshot per campaign per day). Pure and
// client-safe.
//
// A point is the running total AS RECORDED on that day: never a difference of
// snapshots, never interpolated. A campaign without a snapshot on a day keeps
// its last recorded total until its next snapshot. Most counts only grow, but
// Positive is the number of prospects whose CURRENT status is positive, so it
// can go down when a status changes; a drop is shown as recorded, never
// smoothed away. Days before every campaign
// in view has its first snapshot are left out, so an early point never shows a
// partial total as if it were the whole — except for a campaign recorded from
// the day it started: before that day it had, as a matter of fact, no activity.
//
// A future per-day source only has to produce the same rows.

import { COUNT_KEYS, countsFromRow, metricSet, type Counts, type MetricSet } from './metrics.ts';

export interface SnapshotRow {
  campaign_id: string;
  /** YYYY-MM-DD */
  stat_date: string;
  [column: string]: unknown;
}

export interface HistoryPoint {
  date: string;
  set: MetricSet;
}

/**
 * A progress chart needs at least this many recorded days, spanning at least
 * MIN_HISTORY_SPAN_DAYS calendar days. Fewer points (or a few points close
 * together) would show sync timing, not a trend.
 */
export const MIN_HISTORY_POINTS = 5;
export const MIN_HISTORY_SPAN_DAYS = 14;

export interface HistoryReadiness {
  ready: boolean;
  /** Days with a recorded value. */
  recordedDays: number;
  firstDay: string | null;
  lastDay: string | null;
  /** Calendar days from the first to the last recorded day, inclusive (0 without data). */
  spanDays: number;
}

/** Whether a series has enough recorded history to be drawn as a trend. */
export function historyReadiness(points: { date: string; value: number | null }[]): HistoryReadiness {
  const days = [...new Set(points.filter((p) => p.value !== null && /^\d{4}-\d{2}-\d{2}$/.test(p.date)).map((p) => p.date))].sort();
  const firstDay = days[0] ?? null;
  const lastDay = days.at(-1) ?? null;
  const spanDays = firstDay && lastDay ? Math.round((Date.parse(`${lastDay}T00:00:00Z`) - Date.parse(`${firstDay}T00:00:00Z`)) / 86_400_000) + 1 : 0;
  return {
    ready: days.length >= MIN_HISTORY_POINTS && spanDays >= MIN_HISTORY_SPAN_DAYS,
    recordedDays: days.length,
    firstDay,
    lastDay,
    spanDays,
  };
}

/**
 * Running totals per recorded day for the given campaigns. `campaignIds`
 * fixes the campaigns in view (a campaign without any snapshot has no history
 * and is ignored, as it is in the latest totals).
 */
export function snapshotHistory(
  rows: SnapshotRow[],
  campaignIds?: string[],
  /** Campaign id → the day it started (YYYY-MM-DD), when known. */
  startedOn: Record<string, string | null> = {}
): HistoryPoint[] {
  const allowed = campaignIds ? new Set(campaignIds) : null;
  const byCampaign = new Map<string, Map<string, Counts>>();
  for (const r of rows) {
    if (!r.campaign_id || !/^\d{4}-\d{2}-\d{2}$/.test(String(r.stat_date))) continue;
    if (allowed && !allowed.has(r.campaign_id)) continue;
    const days = byCampaign.get(r.campaign_id) ?? new Map<string, Counts>();
    days.set(String(r.stat_date), countsFromRow(r));
    byCampaign.set(r.campaign_id, days);
  }
  if (byCampaign.size === 0) return [];

  // the first day on which every campaign in view has a known total
  const firstOf = (days: Map<string, Counts>) => [...days.keys()].sort()[0];
  const fromStart = (id: string, first: string) => {
    const started = startedOn[id]?.slice(0, 10);
    return !!started && first <= addDay(started);
  };
  let start = '';
  for (const [id, days] of byCampaign) {
    const first = firstOf(days);
    if (!fromStart(id, first) && first > start) start = first;
  }
  if (!start) start = [...byCampaign.values()].map(firstOf).sort()[0];
  const dates = [...new Set([...byCampaign.values()].flatMap((d) => [...d.keys()]))].filter((d) => d >= start).sort();

  const last = new Map<string, Counts>();
  for (const [id, days] of byCampaign) {
    const before = [...days.keys()].filter((d) => d <= start).sort().at(-1);
    if (before) last.set(id, days.get(before)!);
    // not started yet on `start`: zero for every count its first snapshot reports
    else if (fromStart(id, firstOf(days))) last.set(id, zeroLike(days.get(firstOf(days))!));
  }
  return dates.map((date) => {
    for (const [id, days] of byCampaign) {
      const today = days.get(date);
      if (today) last.set(id, today);
    }
    return { date, set: metricSet([...last.values()]) };
  });
}

/** Whether a count has enough recorded history to draw (see historyReadiness). */
export function hasHistory(points: HistoryPoint[], key: (typeof COUNT_KEYS)[number]): boolean {
  return historyReadiness(points.map((p) => ({ date: p.date, value: p.set.counts[key] }))).ready;
}

const addDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const zeroLike = (c: Counts): Counts => Object.fromEntries(COUNT_KEYS.map((k) => [k, c[k] === null ? null : 0])) as Counts;

// Sequence-step analytics: which step and variant of a campaign gets replies.
// Lifetime-to-date counters per step/variant (campaign_step_stats). Pure and
// client-safe. Rates here are per email sent AT A STEP and are labelled that
// way; they are not the campaign reply rate (see metrics.ts).

import { fmtCount, fmtPct, pct } from './format.ts';
import type { RankRow } from './ranking.ts';

export interface StepStatInput {
  step: number;
  variant: string;
  sent: number | null;
  replies_unique: number | null;
  replies?: number | null;
  opens_unique?: number | null;
  clicks_unique?: number | null;
  opportunities?: number | null;
}

export interface StepVariantView {
  variant: string;
  sent: number | null;
  replies: number | null;
  replyRate: number | null;
  opportunities: number | null;
}

export interface StepView {
  step: number;
  sent: number | null;
  replies: number | null;
  replyRate: number | null;
  opportunities: number | null;
  /** Share of all step replies that came from this step (%). */
  replyShare: number | null;
  variants: StepVariantView[];
  /** The best-replying variant (enough sends), when there is more than one. */
  bestVariant: string | null;
}

/** Below this many sends a step/variant reply rate is not ranked. */
export const MIN_STEP_SAMPLE = 50;

const sumN = (vals: (number | null | undefined)[]): number | null =>
  vals.some((v) => v !== null && v !== undefined) ? vals.reduce<number>((s, v) => s + (v ?? 0), 0) : null;

export function stepViews(rows: StepStatInput[]): StepView[] {
  const bySteps = new Map<number, StepStatInput[]>();
  for (const r of rows) bySteps.set(r.step, [...(bySteps.get(r.step) ?? []), r]);
  const totalReplies = sumN(rows.map((r) => r.replies_unique));
  return [...bySteps.entries()]
    .sort(([a], [b]) => a - b)
    .map(([step, list]) => {
      const variants = list
        .map((r) => ({
          variant: r.variant,
          sent: r.sent,
          replies: r.replies_unique,
          replyRate: pct(r.replies_unique, r.sent),
          opportunities: r.opportunities ?? null,
        }))
        .sort((a, b) => a.variant.localeCompare(b.variant));
      const sent = sumN(list.map((r) => r.sent));
      const replies = sumN(list.map((r) => r.replies_unique));
      const ranked = variants.filter((v) => v.variant !== '' && (v.sent ?? 0) >= MIN_STEP_SAMPLE && v.replyRate !== null);
      const best = ranked.length > 1 ? ranked.reduce((a, b) => ((b.replyRate ?? 0) > (a.replyRate ?? 0) ? b : a)) : null;
      return {
        step,
        sent,
        replies,
        replyRate: pct(replies, sent),
        opportunities: sumN(list.map((r) => r.opportunities)),
        replyShare: pct(replies, totalReplies),
        variants: variants.length > 1 || (variants[0] && variants[0].variant !== '') ? variants : [],
        bestVariant: best?.variant ?? null,
      };
    });
}

/** The step with the best reply rate among steps with enough sends. */
export function bestStep(steps: StepView[]): StepView | null {
  const eligible = steps.filter((s) => (s.sent ?? 0) >= MIN_STEP_SAMPLE && s.replyRate !== null);
  return eligible.length ? eligible.reduce((a, b) => ((b.replyRate ?? 0) > (a.replyRate ?? 0) ? b : a)) : null;
}


/**
 * Steps as rows for the bar chart, in sequence order: unique replies and
 * positive prospects per step. Steps under MIN_STEP_SAMPLE sends are marked
 * low volume. The step reply rate in the context line is per email sent at
 * that step, not the campaign reply rate.
 */
export function stepRankRows(steps: StepView[]): RankRow[] {
  return steps.map((s) => ({
    id: `step-${s.step}`,
    name: `Step ${s.step}`,
    href: '',
    lowVolume: (s.sent ?? 0) < MIN_STEP_SAMPLE,
    values: { humanReplies: s.replies, positive: s.opportunities, positiveRate: null },
    details: {
      humanReplies: s.sent === null ? 'Sends not reported' : `${fmtPct(s.replyRate)} of ${fmtCount(s.sent)} emails at this step got a reply`,
      positive: s.opportunities === null ? 'Not reported' : 'Positive prospects attributed to this step by Instantly',
      positiveRate: '',
    },
  }));
}

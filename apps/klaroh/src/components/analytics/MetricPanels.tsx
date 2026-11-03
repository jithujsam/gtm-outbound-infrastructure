// Shared presentation of Klaroh's analytics metrics (src/lib/analytics/metrics.ts).
// Server-safe (no hooks), so agency pages, the client dashboard and the public
// portal all render the same numbers the same way.
//
// Every tile says whether it is reported by Instantly (FACT) or calculated by
// Klaroh (DERIVED), carries its definition as a tooltip, and shows why a value
// is missing instead of a fabricated 0.

import clsx from 'clsx';
import { Info } from 'lucide-react';
import {
  formatMetric,
  funnelStages,
  isShown,
  metricHelp,
  METRICS,
  PERIOD_LABEL,
  readMetric,
  stateText,
  type MetricKey,
  type MetricSet,
} from '@/lib/analytics/metrics';
import { fmtCount, fmtPct } from '@/lib/analytics/format';
import { relativeTime } from '@/lib/utils/relative-time';

export const FACT_KEYS: MetricKey[] = ['emailsSent', 'prospectsContacted', 'humanReplies', 'positive', 'bounces'];
export const DERIVED_KEYS: MetricKey[] = ['replyRate', 'positiveRate', 'bounceRate', 'emailsPerPositive'];

/** Short tile labels (the full label and definition are in the tooltip). */
const TILE_LABEL: Partial<Record<MetricKey, string>> = { positive: 'Positive' };

function MetricTile({ set, metric, emphasis }: { set: MetricSet; metric: MetricKey; emphasis?: boolean }) {
  const d = METRICS[metric];
  const r = readMetric(set, metric);
  const missing = r.value === null;
  let sub: string | null = missing ? stateText(r.state) : null;
  if (!missing && metric === 'positive') sub = 'As marked in Instantly';
  if (!missing && d.calculation) sub = d.calculation;
  return (
    <div className="flex min-w-0 flex-col bg-surface-container-lowest px-4 py-3" title={metricHelp(metric)}>
      <p className="flex items-center gap-1 truncate text-xs text-on-surface-variant">
        {TILE_LABEL[metric] ?? d.label}
        <Info size={11} className="shrink-0 opacity-60" aria-hidden="true" />
      </p>
      <p
        className={clsx(
          'mt-1 truncate font-semibold leading-tight tabular-nums',
          emphasis ? 'text-2xl md:text-[28px]' : 'text-xl',
          missing ? 'text-on-surface-variant/50' : 'text-on-surface'
        )}
      >
        <span title={d.format === 'count' && r.value !== null ? fmtCount(r.value) : undefined}>{formatMetric(metric, r.value, true)}</span>
      </p>
      {sub && <p className="mt-0.5 truncate text-xs text-on-surface-variant">{sub}</p>}
    </div>
  );
}

const COLS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2',
  4: 'grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2',
};

function TileRow({ set, keys, label, emphasis }: { set: MetricSet; keys: MetricKey[]; label: string; emphasis?: boolean }) {
  const shown = keys.filter(isShown);
  if (!shown.length) return null;
  return (
    <div>
      <p className="border-b border-outline-variant/40 bg-surface-container-low px-4 py-1.5 text-xs font-medium text-on-surface-variant md:px-5">{label}</p>
      <div className={clsx('grid gap-px bg-outline-variant/40', COLS[shown.length] ?? COLS[5])}>
        {shown.map((k) => (
          <MetricTile key={k} set={set} metric={k} emphasis={emphasis} />
        ))}
      </div>
    </div>
  );
}

/**
 * The KPI summary: Instantly-reported counts on one row, Klaroh-calculated
 * rates on the next — so a derived number never looks provider-reported.
 */
export function KpiPanel({
  set,
  title = 'Performance',
  subtitle,
  facts = FACT_KEYS,
  derived = DERIVED_KEYS,
  emphasis = true,
  className,
}: {
  set: MetricSet;
  title?: string;
  subtitle?: React.ReactNode;
  facts?: MetricKey[];
  derived?: MetricKey[];
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <section className={clsx('min-w-0 overflow-hidden rounded-lg border border-outline-variant/60 bg-surface-container-lowest', className)} aria-label={title}>
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-outline-variant/40 px-4 py-3 md:px-5">
        <h2 className="type-section text-on-surface">{title}</h2>
        {subtitle && <p className="text-xs text-on-surface-variant">{subtitle}</p>}
      </header>
      <TileRow set={set} keys={facts} label="Reported by Instantly" emphasis={emphasis} />
      <TileRow set={set} keys={derived} label="Calculated by Klaroh" />
    </section>
  );
}

/**
 * Prospects contacted → Human replies → Positive. Bars are drawn against
 * prospects contacted; Positive is NOT shown as a share of replies, because
 * Instantly can mark a prospect positive without an email reply.
 */
export function FunnelPanel({ set, title = 'Funnel', className }: { set: MetricSet; title?: string; className?: string }) {
  const stages = funnelStages(set);
  const top = stages[0].value;
  const emails = set.counts.emailsSent;
  return (
    <section className={clsx('min-w-0 rounded-lg border border-outline-variant/60 bg-surface-container-lowest', className)} aria-label={title}>
      <header className="border-b border-outline-variant/40 px-4 py-3 md:px-5">
        <h2 className="type-section text-on-surface">{title}</h2>
        <p className="mt-0.5 text-xs text-on-surface-variant">
          {emails === null ? 'Emails sent not reported' : `${fmtCount(emails)} emails sent`} · each stage as a share of prospects contacted
        </p>
      </header>
      <ol className="space-y-3 px-4 py-4 md:px-5">
        {stages.map((s, i) => {
          const width = s.value !== null && top ? Math.min(100, (s.value / top) * 100) : 0;
          return (
            <li key={s.key} title={metricHelp(s.key)}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-on-surface">{s.label}</span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold text-on-surface">{s.value === null ? 'Not reported' : fmtCount(s.value)}</span>
                  {i > 0 && (
                    <span className="ml-2 text-xs text-on-surface-variant">
                      {s.ofProspects === null ? '—' : `${fmtPct(s.ofProspects)} of prospects`}
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full rounded-full bg-surface-container">
                {s.value !== null && top ? (
                  <div className="h-2 rounded-full bg-primary-container" style={{ width: `${Math.max(width, s.value > 0 ? 1 : 0)}%` }} />
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="border-t border-outline-variant/40 px-4 py-2 text-xs text-on-surface-variant md:px-5">
        Positive is marked in Instantly and can include prospects who did not reply by email, so it is compared with prospects contacted, not with replies.
      </p>
    </section>
  );
}

/** States what the figures cover. V1 analytics are lifetime-to-date only. */
export function PeriodNote({ asOf, campaigns, scope, badge = true }: { asOf: string | null; campaigns?: number; scope?: string | null; badge?: boolean }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-on-surface-variant">
      {badge && <span className="rounded bg-surface-container px-1.5 py-0.5 font-medium text-on-surface">{PERIOD_LABEL}</span>}
      {scope && <span>{scope}</span>}
      {campaigns !== undefined && (
        <span>
          {campaigns} campaign{campaigns === 1 ? '' : 's'}
        </span>
      )}
      <span>{asOf ? `Lifetime totals from Instantly, last synced ${relativeTime(asOf)}` : 'Not synced yet'}</span>
    </p>
  );
}

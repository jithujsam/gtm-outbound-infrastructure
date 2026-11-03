'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useSyncExternalStore } from 'react';
import clsx from 'clsx';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtCount, fmtPct } from '@/lib/analytics/format';
import { LOW_VOLUME_PROSPECTS } from '@/lib/analytics/metrics';
import { RANK_METRICS, rankRows, type RankMetric, type RankRow } from '@/lib/analytics/ranking';
import { DataTable, Td, Th, Tr } from '@/components/ui/DataTable';

const MARK = 'var(--color-chart-1)'; // one series: brand green
const ROW = 36; // px per bar row (bar ≤ 24px + air)

type Datum = RankRow & { value: number; shown: string };

const fmt = (metric: RankMetric, v: number | null) =>
  RANK_METRICS.find((m) => m.key === metric)?.format === 'pct' ? fmtPct(v) : fmtCount(v);

function TooltipBody({ active, payload, metric, lowNote }: { active?: boolean; payload?: { payload: Datum }[]; metric: RankMetric; lowNote: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="max-w-xs rounded-md border border-outline-variant/60 bg-surface-container-lowest px-3 py-2 text-xs shadow-modal">
      <p className="font-medium text-on-surface">{d.name}</p>
      <p className="mt-0.5 font-semibold tabular-nums text-on-surface">{fmt(metric, d.values[metric])}</p>
      <p className="text-on-surface-variant">{d.details[metric]}</p>
      {d.lowVolume && <p className="mt-1 text-on-surface-variant">Low volume: {lowNote}</p>}
    </div>
  );
}

const shorten = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Narrow screens get a shorter name column so the bars keep room (server render: wide). */
const NARROW = '(max-width: 639px)';
function useNarrow(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(NARROW);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(NARROW).matches,
    () => false
  );
}

/**
 * Horizontal bars ranking campaigns (or clients) on one trusted metric, with
 * the metric switchable. Click a bar to open its page. Low-volume rows are
 * drawn lighter and, on rates, rank after the rest. A table view lists every
 * row with links.
 */
export default function RankingChart({
  rows,
  label,
  limit = 10,
  initial = 'positive',
  sorted = true,
  metrics = RANK_METRICS.map((m) => m.key),
  emptyText = 'Nothing to rank yet.',
  lowNote = `under ${LOW_VOLUME_PROSPECTS} prospects contacted`,
}: {
  rows: RankRow[];
  /** What a row is, for the accessible name and table header ("Campaign", "Client"). */
  label: string;
  limit?: number;
  initial?: RankMetric;
  /** false keeps the given order (e.g. sequence steps). */
  sorted?: boolean;
  metrics?: RankMetric[];
  emptyText?: string;
  /** What "low volume" means for these rows (tooltip and footnote). */
  lowNote?: string;
}) {
  const router = useRouter();
  const narrow = useNarrow();
  const [metric, setMetric] = useState<RankMetric>(initial);
  const [asTable, setAsTable] = useState(false);
  const ordered = useMemo(() => (sorted ? rankRows(rows, metric) : rows), [rows, metric, sorted]);
  const shown = ordered.slice(0, limit);
  const data: Datum[] = shown
    .filter((r) => r.values[metric] !== null)
    .map((r) => ({ ...r, value: r.values[metric] as number, shown: fmt(metric, r.values[metric]) }));
  const hasData = data.some((d) => d.value > 0);
  const hidden = ordered.length - shown.length;
  const notReported = shown.length - data.length;
  const anyLow = data.some((d) => d.lowVolume);
  const options = metrics.map((k) => RANK_METRICS.find((m) => m.key === k)!).filter(Boolean);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 md:px-5">
        {options.length > 1 ? (
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Rank by">
            {options.map((m) => (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={m.key === metric}
                onClick={() => setMetric(m.key)}
                className={clsx(
                  'whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors',
                  m.key === metric
                    ? 'border-primary/40 bg-primary-fixed/30 font-medium text-on-surface'
                    : 'border-outline-variant/60 text-on-surface-variant hover:text-on-surface'
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <button type="button" onClick={() => setAsTable((v) => !v)} className="text-xs text-on-surface-variant underline-offset-2 hover:underline">
          {asTable ? 'Show chart' : 'Show table'}
        </button>
      </div>

      {asTable ? (
        <div className="px-4 py-3 md:px-5">
          <DataTable label={`${label}s by ${options.find((m) => m.key === metric)?.label}`} maxHeight="360px">
            <thead>
              <tr>
                <Th>{label}</Th>
                <Th align="right">{options.find((m) => m.key === metric)?.label}</Th>
                <Th>Context</Th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((r) => (
                <Tr key={r.id}>
                  <Td className="max-w-[240px]">
                    {r.href ? (
                      <Link href={r.href} className="block truncate font-medium text-on-surface hover:text-primary hover:underline" title={r.name}>
                        {r.name}
                      </Link>
                    ) : (
                      <span className="block truncate font-medium text-on-surface" title={r.name}>{r.name}</span>
                    )}
                  </Td>
                  <Td align="right">{fmt(metric, r.values[metric])}</Td>
                  <Td muted className="text-xs">
                    {r.details[metric]}
                    {r.lowVolume ? ' · low volume' : ''}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      ) : hasData ? (
        <div className="px-2 pb-1 pt-2" style={{ height: data.length * ROW + 16 }} role="img" aria-label={`${label}s ranked by ${options.find((m) => m.key === metric)?.label}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: narrow ? 44 : 56, left: 0, bottom: 0 }} barCategoryGap={6}>
              <CartesianGrid horizontal={false} stroke="var(--color-chart-grid)" />
              <XAxis type="number" hide domain={[0, (max: number) => (max > 0 ? max * 1.12 : 1)]} />
              <YAxis
                type="category"
                dataKey="name"
                width={narrow ? 104 : 168}
                tickLine={false}
                axisLine={false}
                interval={0}
                tick={{ fontSize: 12, fill: 'var(--color-chart-axis)' }}
                tickFormatter={(n: string) => shorten(n, narrow ? 12 : 24)}
              />
              <Tooltip content={<TooltipBody metric={metric} lowNote={lowNote} />} cursor={{ fill: 'var(--color-chart-cursor)' }} />
              <Bar
                dataKey="value"
                fill={MARK}
                radius={[0, 4, 4, 0]}
                maxBarSize={24}
                minPointSize={2}
                isAnimationActive={false}
                cursor={data.some((d) => d.href) ? 'pointer' : 'default'}
                onClick={(d: unknown) => {
                  const href = (d as { payload?: Datum })?.payload?.href;
                  if (href) router.push(href);
                }}
              >
                {data.map((d) => (
                  <Cell key={d.id} fill={MARK} fillOpacity={d.lowVolume ? 0.35 : 1} />
                ))}
                <LabelList dataKey="shown" position="right" style={{ fontSize: 12, fill: 'var(--color-on-surface)' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="px-4 py-10 text-center text-sm text-on-surface-variant md:px-5">{emptyText}</p>
      )}

      {!asTable && (hidden > 0 || notReported > 0 || (anyLow && hasData)) && (
        <p className="px-4 pb-3 text-xs text-on-surface-variant md:px-5">
          {[
            hidden > 0 ? `Top ${shown.length} of ${ordered.length}; the table lists all.` : null,
            notReported > 0 ? `${notReported} not reported, not drawn.` : null,
            anyLow && hasData ? `Lighter bars: ${lowNote}${RANK_METRICS.find((m) => m.key === metric)?.format === 'pct' ? ', ranked after the rest' : ''}.` : null,
          ]
            .filter(Boolean)
            .join(' ')}
        </p>
      )}
    </div>
  );
}

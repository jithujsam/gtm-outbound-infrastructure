'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtCount, fmtDay } from '@/lib/analytics/format';
import { historyReadiness, MIN_HISTORY_POINTS, MIN_HISTORY_SPAN_DAYS } from '@/lib/analytics/history';
import { DataTable, Td, Th, Tr } from '@/components/ui/DataTable';

export interface ProgressSeries {
  key: string;
  label: string;
  /** Total as recorded on each day; null = not reported that day. */
  points: { date: string; value: number | null }[];
  /**
   * The figure counts a current status (Positive), not a running total: it can
   * go down when a status changes, so it is never described as "so far".
   */
  currentStatus?: boolean;
}

const MARK = 'var(--color-chart-1)';

/** "so far" for running totals; "on this day" for a current-status count (it can go down). */
const suffix = (s: ProgressSeries) => (s.currentStatus ? 'on this day' : 'so far');

function TooltipBody({ active, payload, label, series }: { active?: boolean; payload?: { value: number }[]; label?: string; series: ProgressSeries }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-outline-variant/60 bg-surface-container-lowest px-3 py-2 text-xs shadow-modal">
      <p className="text-on-surface-variant">{fmtDay(label)}</p>
      <p className="mt-0.5 font-semibold text-on-surface">
        {fmtCount(payload[0].value)} <span className="font-normal text-on-surface-variant">{series.label.toLowerCase()} {suffix(series)}</span>
      </p>
    </div>
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * "What happened over time": one figure at a time, from the recorded daily
 * snapshots only. Until there is enough history (historyReadiness) it explains
 * what has been recorded so far instead of drawing a few points as a trend.
 */
export default function ProgressChart({ series, height = 220 }: { series: ProgressSeries[]; height?: number }) {
  const [active, setActive] = useState(series[0]?.key);
  const [asTable, setAsTable] = useState(false);
  const current = series.find((s) => s.key === active) ?? series[0];
  if (!current) return null;
  const data = current.points.filter((p) => p.value !== null) as { date: string; value: number }[];
  const readiness = historyReadiness(data);
  const enough = readiness.ready;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 md:px-5">
        {series.length > 1 ? (
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Figure shown">
            {series.map((s) => (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={s.key === current.key}
                onClick={() => setActive(s.key)}
                className={clsx(
                  'whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors',
                  s.key === current.key
                    ? 'border-primary/40 bg-primary-fixed/30 font-medium text-on-surface'
                    : 'border-outline-variant/60 text-on-surface-variant hover:text-on-surface'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        {enough && (
          <button type="button" onClick={() => setAsTable((v) => !v)} className="text-xs text-on-surface-variant underline-offset-2 hover:underline">
            {asTable ? 'Show chart' : 'Show table'}
          </button>
        )}
      </div>

      {!enough ? (
        <div className="px-4 py-12 text-center text-sm text-on-surface-variant md:px-5">
          {readiness.firstDay ? (
            <p>
              Results have been recorded since {fmtDay(readiness.firstDay)} ({plural(readiness.recordedDays, 'update')} so far).
            </p>
          ) : (
            <p>No results have been recorded yet.</p>
          )}
          <p className="mt-1">
            Progress over time appears after {MIN_HISTORY_POINTS} updates spread over at least {MIN_HISTORY_SPAN_DAYS} days.
          </p>
        </div>
      ) : asTable ? (
        <div className="px-4 py-3 md:px-5">
          <DataTable label={`${current.label} over time`} maxHeight="300px">
            <thead>
              <tr>
                <Th>Day</Th>
                <Th align="right">{current.label} {suffix(current)}</Th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((p) => (
                <Tr key={p.date}>
                  <Td>{fmtDay(p.date)}</Td>
                  <Td align="right">{fmtCount(p.value)}</Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      ) : (
        <div className="w-full px-2 pb-2 pt-3" style={{ height }} role="img" aria-label={`${current.label} ${suffix(current)}, by day`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="portal-progress" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={MARK} stopOpacity={0.16} />
                  <stop offset="100%" stopColor={MARK} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => fmtDay(d)}
                tick={{ fontSize: 12, fill: 'var(--color-chart-axis)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-chart-axis-line)' }}
                minTickGap={28}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12, fill: 'var(--color-chart-axis)' }}
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))}
              />
              <Tooltip content={<TooltipBody series={current} />} cursor={{ stroke: 'var(--color-chart-reference)', strokeDasharray: '3 3' }} />
              <Area
                type="monotone"
                dataKey="value"
                name={current.label}
                stroke={MARK}
                strokeWidth={2}
                fill="url(#portal-progress)"
                dot={data.length <= 14 ? { r: 3, fill: MARK, stroke: 'var(--color-surface-container-lowest)', strokeWidth: 2 } : false}
                activeDot={{ r: 5, fill: MARK, stroke: 'var(--color-surface-container-lowest)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

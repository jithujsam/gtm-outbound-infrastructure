'use client';

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import clsx from 'clsx';
import { fmtCount, fmtDay } from '@/lib/analytics/format';
import { DataTable, Td, Th, Tr } from '@/components/ui/DataTable';

export interface TrendPoint {
  date: string;
  value: number | null;
  /** Days of activity the value covers (> 1 when history has a gap). */
  spanDays?: number | null;
}

export interface TrendSeries {
  key: string;
  label: string;
  points: TrendPoint[];
}

const MARK = 'var(--color-chart-1)'; // the only series colour (one series per chart)

function TooltipBody({ active, payload, label }: { active?: boolean; payload?: { payload: TrendPoint }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-outline-variant/60 bg-surface-container-lowest px-3 py-2 text-xs shadow-modal">
      <p className="font-mono text-on-surface-variant">{fmtDay(label)}</p>
      <p className="mt-0.5 font-semibold text-on-surface">{p.value === null ? 'No snapshot' : fmtCount(p.value)}</p>
      {p.spanDays && p.spanDays > 1 && <p className="mt-0.5 text-on-surface-variant">Covers {p.spanDays} days since the previous snapshot</p>}
    </div>
  );
}

export default function TrendChart({
  series,
  emptyText = 'No history in this range yet.',
  height = 240,
}: {
  series: TrendSeries[];
  emptyText?: string;
  height?: number;
}) {
  const [active, setActive] = useState(series[0]?.key);
  const [asTable, setAsTable] = useState(false);
  const current = series.find((s) => s.key === active) ?? series[0];
  if (!current) return null;
  const hasData = current.points.some((p) => p.value !== null && p.value > 0);
  const data = current.points.map((p) => ({ ...p, bar: p.value ?? 0 }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 md:px-5">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Metric">
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
        <button type="button" onClick={() => setAsTable((v) => !v)} className="text-xs text-on-surface-variant underline-offset-2 hover:underline">
          {asTable ? 'Show chart' : 'Show table'}
        </button>
      </div>

      {asTable ? (
        <DataTable label={`${current.label} by day`} maxHeight="320px">
          <thead>
            <tr>
              <Th>Day</Th>
              <Th align="right">{current.label}</Th>
              <Th align="right">Covers</Th>
            </tr>
          </thead>
          <tbody>
            {current.points.filter((p) => p.value !== null).map((p) => (
              <Tr key={p.date}>
                <Td>{fmtDay(p.date)}</Td>
                <Td align="right">{fmtCount(p.value)}</Td>
                <Td align="right" muted>{p.spanDays && p.spanDays > 1 ? `${p.spanDays} days` : '1 day'}</Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      ) : hasData ? (
        <div className="w-full px-2 pb-2 pt-3" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => fmtDay(d)}
                tick={{ fontSize: 12, fill: 'var(--color-chart-axis)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-chart-axis-line)' }}
                minTickGap={24}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12, fill: 'var(--color-chart-axis)' }}
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))}
              />
              <Tooltip content={<TooltipBody />} cursor={{ fill: 'var(--color-chart-cursor)' }} />
              <Bar dataKey="bar" name={current.label} fill={MARK} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
                {data.map((p) => (
                  <Cell key={p.date} fill={MARK} fillOpacity={p.spanDays && p.spanDays > 1 ? 0.4 : 1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="px-4 py-10 text-center text-sm text-on-surface-variant md:px-5">{emptyText}</p>
      )}
      {!asTable && hasData && current.points.some((p) => p.spanDays && p.spanDays > 1 && p.value) && (
        <p className="px-4 pb-3 text-xs text-on-surface-variant md:px-5">
          Lighter bars cover several days: history had a gap, so that bar holds all activity since the previous snapshot.
        </p>
      )}
    </div>
  );
}

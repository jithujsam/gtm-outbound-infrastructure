'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  formatMetric,
  LOW_VOLUME_PROSPECTS,
  metricHelp,
  METRICS,
  sortComparison,
  type ComparisonKey,
  type ComparisonRow,
  type MetricKey,
} from '@/lib/analytics/metrics';
import { fmtCount } from '@/lib/analytics/format';
import { providerLabel } from '@/lib/campaign-view';
import { StatusBadge } from './ui';
import { DataTable, EmptyRow, Td, Th, Tr, type SortDirection } from '@/components/ui/DataTable';

/** The metrics campaigns are compared on (all trusted; rates are Klaroh-calculated). */
const COLUMNS: { key: MetricKey; label: string }[] = [
  { key: 'emailsSent', label: 'Emails sent' },
  { key: 'prospectsContacted', label: 'Prospects' },
  { key: 'replyRate', label: 'Reply rate' },
  { key: 'positiveRate', label: 'Positive rate' },
  { key: 'bounces', label: 'Bounces' },
];

function value(r: ComparisonRow, key: MetricKey): number | null {
  return key in r.set.counts ? r.set.counts[key as keyof typeof r.set.counts] : r.set.rates[key as keyof typeof r.set.rates];
}

/**
 * Campaigns side by side on the trusted metrics. Defaults to positive rate;
 * low-volume campaigns rank after the rest on rates.
 */
export default function ComparisonTable({
  rows,
  query,
  initialSort = 'positiveRate',
  filters = true,
  label = 'Campaign comparison',
  highlightId,
}: {
  rows: ComparisonRow[];
  query: string;
  initialSort?: ComparisonKey;
  filters?: boolean;
  label?: string;
  highlightId?: string;
}) {
  const [sort, setSort] = useState<{ key: ComparisonKey; dir: 'asc' | 'desc' }>({ key: initialSort, dir: initialSort === 'name' ? 'asc' : 'desc' });
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');

  const statuses = useMemo(() => [...new Set(rows.map((r) => r.status))].sort(), [rows]);
  const visible = useMemo(() => {
    const q = text.trim().toLowerCase();
    return sortComparison(
      rows.filter((r) => (!q || r.name.toLowerCase().includes(q)) && (!status || r.status === status)),
      sort.key,
      sort.dir
    );
  }, [rows, text, status, sort]);

  const toggle = (key: ComparisonKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  const dirOf = (k: ComparisonKey): SortDirection | 'none' => (sort.key === k ? sort.dir : 'none');
  const max = (key: MetricKey) => Math.max(0, ...visible.map((r) => value(r, key) ?? 0));

  return (
    <div>
      {filters && rows.length > 5 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant/40 px-4 py-3 md:px-5">
          <label className="relative flex min-w-0 flex-1 items-center sm:max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-2.5 text-on-surface-variant" aria-hidden="true" />
            <span className="sr-only">Filter campaigns</span>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Filter campaigns" className="input !h-9 !pl-8 text-sm" />
          </label>
          <label>
            <span className="sr-only">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input !h-9 !w-auto !pr-8 text-sm">
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <span className="text-xs text-on-surface-variant">
            {visible.length} of {rows.length}
          </span>
        </div>
      )}
      <DataTable label={label} minWidth={760}>
        <thead>
          <tr>
            <Th sticky sort={dirOf('name')} onSort={() => toggle('name')}>
              Campaign
            </Th>
            {COLUMNS.map((c) => (
              <Th key={c.key} align="right" title={metricHelp(c.key)} sort={dirOf(c.key)} onSort={() => toggle(c.key)}>
                {c.label}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <Tr key={r.id} className={r.id === highlightId ? 'bg-primary-fixed/15' : undefined}>
              <Td sticky className="max-w-[280px]">
                <Link href={`/campaigns/${r.id}${query ? `?${query}` : ''}`} className="block truncate font-medium text-on-surface hover:text-primary hover:underline" title={r.name}>
                  {r.name}
                </Link>
                <span className="mt-0.5 flex items-center gap-2 text-xs text-on-surface-variant">
                  <StatusBadge status={r.status} />
                  <span className="truncate">{providerLabel(r.provider)}</span>
                  {r.lowVolume && <span title={`Under ${LOW_VOLUME_PROSPECTS} prospects contacted: rates are not reliable for ranking`}>Low volume</span>}
                </span>
              </Td>
              {COLUMNS.map((c) => {
                const v = value(r, c.key);
                const isRate = METRICS[c.key].format === 'pct';
                const m = isRate ? max(c.key) : 0;
                return (
                  <Td key={c.key} align="right" emphasis={c.key === sort.key}>
                    <span className="tabular-nums">{formatMetric(c.key, v)}</span>
                    {c.key === 'positiveRate' && r.set.counts.positive !== null && (
                      <span className="block text-xs text-on-surface-variant">{fmtCount(r.set.counts.positive)} positive</span>
                    )}
                    {c.key === 'replyRate' && r.set.counts.humanReplies !== null && (
                      <span className="block text-xs text-on-surface-variant">{fmtCount(r.set.counts.humanReplies)} replies</span>
                    )}
                    {isRate && v !== null && m > 0 && (
                      <span className="ml-auto mt-1 block h-1 w-16 rounded-full bg-surface-container" aria-hidden="true">
                        <span className="block h-1 rounded-full bg-primary-container" style={{ width: `${Math.max(3, (v / m) * 100)}%` }} />
                      </span>
                    )}
                  </Td>
                );
              })}
            </Tr>
          ))}
          {visible.length === 0 && <EmptyRow colSpan={COLUMNS.length + 1}>No campaigns match.</EmptyRow>}
        </tbody>
      </DataTable>
      <p className="px-4 py-2 text-xs text-on-surface-variant md:px-5">
        Rates are calculated by Klaroh from Instantly’s counts. Campaigns under {LOW_VOLUME_PROSPECTS} prospects contacted are marked low volume and rank last on rates.
      </p>
    </div>
  );
}

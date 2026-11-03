export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { dailySeries, MAILBOX_WINDOW_LABEL, WARMUP_FAIR, WARMUP_GOOD, warmupTotals, type WarmupHealth } from '@/lib/analytics/infrastructure';
import { DASH, fmtCompact, fmtCount, fmtDecimal, fmtPct } from '@/lib/analytics/format';
import TrendChart from '@/components/analytics/TrendChart';
import { Cell, CellGrid, Meter, Panel, ToneLabel, type Tone } from '@/components/analytics/ui';
import { DataTable, Td, Th, Tr } from '@/components/ui/DataTable';
import { InfraPage, type SearchParams } from '../frame';
import { InfrastructureSkeleton } from '@/components/ui/PageSkeletons';

const HEALTH: Record<WarmupHealth, { tone: Tone; label: string }> = {
  good: { tone: 'good', label: 'Good' },
  fair: { tone: 'warning', label: 'Fair' },
  poor: { tone: 'critical', label: 'Poor' },
  off: { tone: 'neutral', label: 'Warmup off' },
  error: { tone: 'critical', label: 'Error' },
  unknown: { tone: 'unknown', label: 'No score yet' },
};

export default function WarmupPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<InfrastructureSkeleton />}>
      <InfraPage searchParams={searchParams} title="Warmup" subtitle="Warmup activity and health — kept apart from campaign sending." parts={['accounts', 'warmup']}>
        {({ data, current, today }) => {
          const w = warmupTotals(current, data.days, today);
          const ids = current.map((v) => v.id);
          const rows = [...current].sort((a, b) => (a.warmupScore ?? -1) - (b.warmupScore ?? -1));
          // Only series Instantly actually reported (spam placement is often missing).
          const warmupSeries = [
            { key: 'warmup_sent', label: 'Warmup sent', points: dailySeries(data.days, ids, 'warmup_sent', today) },
            { key: 'inbox', label: 'Landed inbox', points: dailySeries(data.days, ids, 'warmup_landed_inbox', today) },
            { key: 'spam', label: 'Landed spam', points: dailySeries(data.days, ids, 'warmup_landed_spam', today) },
          ].filter((series) => series.points.some((p) => p.value !== null));
          return (
            <div className="space-y-4">
              <Panel title="Warmup summary" subtitle={`Warmup emails only, ${MAILBOX_WINDOW_LABEL}. Never counted as campaign sending.`} bodyClassName="overflow-hidden rounded-b-lg">
                <CellGrid className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                  <Cell emphasis label="Warmup enabled" value={`${w.enabled} / ${current.length}`} sub="Mailboxes">
                    <div className="mt-2"><Meter value={w.enabled} max={current.length} label="Warmup enabled" /></div>
                  </Cell>
                  <Cell emphasis label="Avg health score" value={w.averageScore === null ? DASH : fmtDecimal(w.averageScore, 1)} sub={w.averageScore === null ? 'Not reported by Instantly' : `Mean of Instantly scores · good ≥ ${WARMUP_GOOD}`} title={`Average of the warmup health scores Instantly reports per mailbox. Klaroh labels ≥ ${WARMUP_GOOD} good and ≥ ${WARMUP_FAIR} fair.`}>
                    <div className="mt-2">
                      <Meter value={w.averageScore} max={100} tone={w.averageScore === null ? 'unknown' : w.averageScore >= WARMUP_GOOD ? 'good' : w.averageScore >= WARMUP_FAIR ? 'warning' : 'critical'} label="Average warmup score" />
                    </div>
                  </Cell>
                  <Cell emphasis label="Warmup sent" value={fmtCompact(w.sent)} sub={w.sent === null ? 'Not reported by Instantly' : 'Warmup emails, not campaign'} muted={w.sent === null} />
                  <Cell emphasis label="Landed in inbox" value={fmtCompact(w.landedInbox)} sub={w.inboxRate === null ? 'Inbox rate needs spam placement, not reported' : `${fmtPct(w.inboxRate)} inbox rate`} muted={w.landedInbox === null}>
                    <div className="mt-2"><Meter value={w.inboxRate} max={100} tone={w.inboxRate !== null && w.inboxRate < 90 ? 'warning' : 'good'} label="Inbox rate" /></div>
                  </Cell>
                  <Cell emphasis label="Landed in spam" value={fmtCompact(w.landedSpam)} sub={w.landedSpam === null ? 'Not reported by Instantly' : w.inboxRate === null ? DASH : `${fmtPct(100 - w.inboxRate)} of placed`} muted={w.landedSpam === null} />
                  <Cell emphasis label="Received" value={fmtCompact(w.received)} sub="From the warmup pool" muted={w.received === null} />
                </CellGrid>
              </Panel>

              <Panel title="Warmup over time" subtitle={`All selected mailboxes, ${MAILBOX_WINDOW_LABEL}`}>
                <TrendChart series={warmupSeries} emptyText="No warmup history yet." />
              </Panel>

              <Panel title="Warmup per mailbox" subtitle="Lowest health first" bodyClassName="overflow-hidden rounded-b-lg">
                <DataTable label="Warmup per mailbox" minWidth={720}>
                  <thead>
                    <tr>
                      <Th sticky>Email</Th>
                      <Th>Warmup health</Th>
                      <Th className="w-48" title="Warmup health score reported by Instantly (0–100)">Health score</Th>
                      <Th align="right">Warmup sent</Th>
                      <Th className="w-48">Inbox rate</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((v) => (
                      <Tr key={v.id}>
                        <Td sticky className="max-w-[260px] truncate font-medium">
                          <span title={v.email}>{v.email}</span>
                        </Td>
                        <Td><ToneLabel tone={HEALTH[v.warmup].tone}>{HEALTH[v.warmup].label}</ToneLabel></Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <span className="w-8 text-right">{v.warmupScore === null ? DASH : fmtDecimal(v.warmupScore, 0)}</span>
                            <Meter value={v.warmupScore} max={100} tone={HEALTH[v.warmup].tone} label={`Warmup score of ${v.email}`} />
                          </div>
                        </Td>
                        <Td align="right">{fmtCount(v.warmupSent)}</Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <span className="w-12 text-right">{fmtPct(v.warmupInboxRate)}</span>
                            <Meter value={v.warmupInboxRate} max={100} tone={v.warmupInboxRate !== null && v.warmupInboxRate < 90 ? 'warning' : 'good'} label={`Inbox rate of ${v.email}`} />
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </DataTable>
              </Panel>
            </div>
          );
        }}
      </InfraPage>
    </Suspense>
  );
}

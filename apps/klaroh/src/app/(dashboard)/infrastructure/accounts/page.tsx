export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { dailySeries, MAILBOX_WINDOW_LABEL, UNDERUSED_PCT } from '@/lib/analytics/infrastructure';
import { fmtCount, fmtPct } from '@/lib/analytics/format';
import MailboxTable from '@/components/analytics/MailboxTable';
import TrendChart from '@/components/analytics/TrendChart';
import { DataBar, Panel } from '@/components/analytics/ui';
import { InfraPage, type SearchParams } from '../frame';
import { InfrastructureSkeleton } from '@/components/ui/PageSkeletons';

export default function EmailAccountsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<InfrastructureSkeleton />}>
      <InfraPage searchParams={searchParams} title="Email accounts" subtitle="Every mailbox your client campaigns send from, with its status and warmup." parts={['accounts']}>
        {({ data, views, current, sending, today }) => {
          const balance = current.filter((v) => (v.sent ?? 0) > 0).sort((a, b) => (b.sent ?? 0) - (a.sent ?? 0));
          const total = balance.reduce((s, v) => s + (v.sent ?? 0), 0);
          const max = Math.max(0, ...balance.map((v) => v.sent ?? 0));
          return (
            <div className="space-y-4">
              <Panel
                title="Email accounts"
                subtitle={
                  sending
                    ? `Status and warmup from Instantly. Campaign sending covers the ${MAILBOX_WINDOW_LABEL} (warmup excluded). Underused = below ${UNDERUSED_PCT}% of the daily limit.`
                    : 'Status, warmup and limits from Instantly. Campaign sending per mailbox is not available for this account.'
                }
                bodyClassName="overflow-hidden rounded-b-lg"
              >
                <MailboxTable views={views} sending={sending} />
              </Panel>
              {sending && (
                <div className="grid gap-4 lg:grid-cols-12">
                  <Panel title="Campaign sending per day" subtitle={`All selected mailboxes, ${MAILBOX_WINDOW_LABEL}. Warmup excluded.`} className="lg:col-span-7">
                    <TrendChart
                      series={[{ key: 'sent', label: 'Campaign emails', points: dailySeries(data.days, current.map((v) => v.id), 'sent', today) }]}
                      emptyText="No mailbox sending history yet."
                    />
                  </Panel>
                  <Panel title="Sending balance" subtitle={`Share of campaign emails per mailbox, ${MAILBOX_WINDOW_LABEL}`} className="lg:col-span-5">
                    {balance.length ? (
                      <ul className="space-y-3 px-4 py-4 md:px-5">
                        {balance.map((v) => (
                          <li key={v.id} className="text-sm">
                            <span className="flex items-baseline justify-between gap-3">
                              <span className="truncate" title={v.email}>{v.email}</span>
                              <span className="shrink-0 text-xs tabular-nums text-on-surface-variant">
                                {fmtCount(v.sent)} · {fmtPct(((v.sent ?? 0) / total) * 100)}
                              </span>
                            </span>
                            <DataBar value={v.sent} max={max} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="px-4 py-10 text-center text-sm text-on-surface-variant md:px-5">No campaign sends recorded yet.</p>
                    )}
                  </Panel>
                </div>
              )}
            </div>
          );
        }}
      </InfraPage>
    </Suspense>
  );
}

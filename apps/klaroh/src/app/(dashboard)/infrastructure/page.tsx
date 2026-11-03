export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import {
  BOUNCE_WARNING_PCT,
  capacityUse,
  dailySeries,
  healthDistributions,
  infraSummary,
  MAILBOX_BOUNCE_VERIFIED,
  MAILBOX_WINDOW_LABEL,
  sendingImbalance,
  STOPPED_DAYS,
  mailboxSeverity,
  UNDERUSED_PCT,
  type MailboxFlag,
} from '@/lib/analytics/infrastructure';
import { DASH, fmtCount, fmtDecimal, fmtPct } from '@/lib/analytics/format';
import TrendChart from '@/components/analytics/TrendChart';
import { Cell, CellGrid, DistributionBar, Meter, Panel, ToneLabel, type Tone } from '@/components/analytics/ui';
import { InfraPage, type SearchParams } from './frame';
import { InfrastructureSkeleton } from '@/components/ui/PageSkeletons';

const ISSUE: Record<Exclude<MailboxFlag, 'underused'>, { label: string; tone: Tone }> = {
  error: { label: 'Sending error', tone: 'critical' },
  warmup: { label: 'Warmup unhealthy', tone: 'critical' },
  dns: { label: 'DNS failing', tone: 'critical' },
  bounces: { label: `Bounces > ${BOUNCE_WARNING_PCT}%`, tone: 'critical' },
  stopped: { label: `No sends in ${STOPPED_DAYS} days`, tone: 'warning' },
  overloaded: { label: 'Over daily limit', tone: 'warning' },
};

export default function InfrastructureHealthPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<InfrastructureSkeleton />}>
      <InfraPage searchParams={searchParams} title="Infrastructure" subtitle="Is the outbound infrastructure healthy?" parts={['accounts', 'warmup', 'domains']}>
        {({ data, views, current, sending, today }) => {
          const s = infraSummary(views);
          const dist = healthDistributions(views);
          const use = capacityUse(current);
          const imbalance = sendingImbalance(current);
          const issues = current
            .filter((v) => v.flags.some((f) => f !== 'underused'))
            .sort((a, b) => mailboxSeverity(b.flags) - mailboxSeverity(a.flags) || a.email.localeCompare(b.email));
          const SHOWN = 8;
          const share = (n: number) => (s.total ? (n / s.total) * 100 : null);
          return (
            <div className="space-y-4">
              <Panel title="Email IDs" subtitle="Sending mailboxes used by the selected client campaigns" bodyClassName="overflow-hidden rounded-b-lg">
                <CellGrid className="grid-cols-2 lg:grid-cols-5 max-lg:[&>*:last-child:nth-child(odd)]:col-span-2">
                  <Cell emphasis label="Email IDs" value={fmtCount(s.total)} sub={`${new Set(current.map((v) => v.domain)).size} sending domains`} />
                  <Cell emphasis label="Active" value={fmtCount(s.active)} sub={`${fmtPct(share(s.active))} of mailboxes`} />
                  <Cell emphasis label="Warming" value={fmtCount(s.warming)} sub="Warmup enabled" />
                  <Cell emphasis label="Healthy" value={fmtCount(s.healthy)} sub="Active, warmup and DNS OK" title="Active in Instantly, warmup not poor or in error, and no failing DNS check" />
                  <Cell emphasis label="Issues" value={fmtCount(s.issues)} sub={s.errors ? `${s.errors} sending error${s.errors === 1 ? '' : 's'}` : 'Needing attention'} />
                </CellGrid>
              </Panel>

              <Panel
                title="Needs attention"
                subtitle={issues.length ? `${issues.length} mailbox${issues.length === 1 ? '' : 'es'}, most serious first${issues.length > SHOWN ? ` — showing ${SHOWN}` : ''}` : 'Nothing needs attention'}
                action={
                  <Link href="/infrastructure/accounts" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    All email accounts <ArrowRight size={13} aria-hidden="true" />
                  </Link>
                }
              >
                {issues.length ? (
                  <ul className="divide-y divide-outline-variant/30">
                    {issues.slice(0, SHOWN).map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm md:px-5">
                        <span className="min-w-0 truncate font-medium">{v.email}</span>
                        <span className="flex flex-wrap gap-x-3 gap-y-1">
                          {v.flags.filter((f): f is Exclude<MailboxFlag, 'underused'> => f !== 'underused').map((f) => (
                            <ToneLabel key={f} tone={ISSUE[f].tone}>{ISSUE[f].label}</ToneLabel>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-6 text-sm md:px-5">
                    <ToneLabel tone="good">No mailbox has a sending error, unhealthy warmup or failing DNS{sending ? `${MAILBOX_BOUNCE_VERIFIED ? ', high bounces' : ''} or stopped sending` : ''}</ToneLabel>
                  </p>
                )}
              </Panel>

              <div className="grid gap-4 lg:grid-cols-12">
                <Panel title="Health at a glance" subtitle="Three separate questions — an active mailbox can still have poor warmup or failing DNS" className="lg:col-span-7">
                  <div className="grid gap-6 px-4 py-4 md:px-5 lg:grid-cols-3">
                    <DistributionBar title="Account status" segments={dist.status} total={s.total} />
                    <DistributionBar title="Warmup health" segments={dist.warmup} total={s.total} />
                    <DistributionBar title="Domain DNS" segments={dist.deliverability} total={s.total} />
                  </div>
                </Panel>
                <Panel title="Sending capacity" subtitle="Daily limits set in Instantly" className="lg:col-span-5" bodyClassName="space-y-4 px-4 py-4 md:px-5">
                  <div>
                    <p className="text-xs text-on-surface-variant">Combined daily limit of active mailboxes</p>
                    <p className="text-2xl font-semibold">{s.dailyCapacity === null ? DASH : `${fmtCount(s.dailyCapacity)} / day`}</p>
                  </div>
                  {sending ? (
                    <>
                      <div>
                        <div className="flex items-baseline justify-between">
                          <p className="text-xs text-on-surface-variant">Daily capacity in use</p>
                          <p className="text-lg font-semibold">{fmtPct(use)}</p>
                        </div>
                        <div className="mt-2"><Meter value={use} max={100} tone={use !== null && use > 95 ? 'warning' : 'good'} label="Capacity in use" /></div>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          Average daily campaign sends ({MAILBOX_WINDOW_LABEL}) ÷ combined daily limit of active mailboxes
                          {use !== null && use < UNDERUSED_PCT ? ` — under ${UNDERUSED_PCT}%: most of your sending capacity is unused` : ''}
                        </p>
                      </div>
                      <div title="1× = perfectly even. Higher means one mailbox carries more than its share.">
                        <p className="text-xs text-on-surface-variant">Sending imbalance</p>
                        <p className="text-lg font-semibold">{imbalance === null ? DASH : `${fmtDecimal(imbalance, 1)}×`}</p>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-on-surface-variant">
                      Capacity in use is not available: Instantly has not returned campaign sending per mailbox for this account.
                    </p>
                  )}
                </Panel>
              </div>

              {sending && (
                <Panel title="Campaign sending per day" subtitle={`All selected mailboxes, ${MAILBOX_WINDOW_LABEL}. Warmup excluded.`}>
                  <TrendChart
                    series={[{ key: 'sent', label: 'Campaign emails', points: dailySeries(data.days, current.map((v) => v.id), 'sent', today) }]}
                    emptyText="No mailbox sending history yet."
                  />
                </Panel>
              )}
            </div>
          );
        }}
      </InfraPage>
    </Suspense>
  );
}

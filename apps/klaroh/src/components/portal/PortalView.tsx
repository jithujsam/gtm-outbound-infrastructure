// The client portal: a business-facing report of the agency's outbound work.
// Server component — every number comes from the shared analytics layer
// (metrics.ts via portal.ts); this file only lays it out.
//
// Two views of the same data:
//   simple    "at a glance": status, three headline numbers, the summary, health
//   advanced  the detailed report: summary, the agency's chosen KPI cards,
//             progress over time, investment, campaigns, infrastructure

import Link from 'next/link';
import clsx from 'clsx';
import { ArrowRight, Wallet, Info, Server, TrendingUp } from 'lucide-react';
import { StatusChip } from '@/components/ui/StatusChip';
import { formatMetric, metricSet, readMetric, type CountKey, type MetricSet } from '@/lib/analytics/metrics';
import { fmtCount, fmtCurrency, fmtDay, fmtPct } from '@/lib/analytics/format';
import { snapshotHistory } from '@/lib/analytics/history';
import {
  campaignPhase,
  economicsSummary,
  PORTAL_METRICS,
  portalInfrastructure,
  portalSummary,
  reportStatus,
  SIMPLE_METRICS,
  type EconomicsSummary,
  type PortalInfrastructure,
  type PortalMetricKey,
  type PortalSummary,
} from '@/lib/analytics/portal';
import type { PortalConversations, PortalReport } from '@/lib/data/portal';
import { ConversationsGlance, ConversationsSection } from './PortalConversations';
import { relativeTime } from '@/lib/utils/relative-time';
import ProgressChart, { type ProgressSeries } from './ProgressChart';
import PreviewBanner from './PreviewBanner';

type View = 'simple' | 'advanced';

const CHART_KEYS: CountKey[] = ['prospectsContacted', 'humanReplies', 'positive', 'emailsSent'];
const COLS: Record<number, string> = {
  1: 'grid-cols-1 sm:grid-cols-2',
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2',
  4: 'grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2',
  6: 'grid-cols-2 sm:grid-cols-3',
  7: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2',
};

interface Model {
  set: MetricSet;
  summary: PortalSummary;
  status: ReturnType<typeof reportStatus>;
  economics: EconomicsSummary | null;
  infra: PortalInfrastructure | null;
  asOf: string | null;
  visible: PortalMetricKey[];
}

function buildModel(r: PortalReport): Model {
  const set = metricSet(r.campaigns.map((c) => c.counts));
  const visible = r.settings.metrics;
  const asOf = r.campaigns.reduce<string | null>((m, c) => (c.capturedAt && (!m || c.capturedAt > m) ? c.capturedAt : m), null);
  const economics = r.settings.showEconomics ? economicsSummary(r.campaigns) : null;
  return {
    set,
    visible,
    summary: portalSummary(set, r.campaigns, visible),
    status: reportStatus(r.campaigns),
    economics: economics && economics.groups.length ? economics : null,
    infra: r.infrastructure ? portalInfrastructure(r.infrastructure, new Date().toISOString().slice(0, 10)) : null,
    asOf,
  };
}

function scopeText(r: PortalReport): string {
  const n = r.campaigns.length;
  if (n === 0) return 'No campaigns included yet';
  if (!r.settings.allCampaigns && r.totalCampaigns > n) return `${n} of ${r.totalCampaigns} campaigns`;
  return n === 1 ? '1 campaign' : `All ${n} campaigns combined`;
}

export default function PortalView({
  report,
  conversations = null,
  view,
  preview,
  basePath,
}: {
  report: PortalReport;
  /** null when the agency hides conversations. */
  conversations?: PortalConversations | null;
  view: View;
  preview: boolean;
  basePath: string;
}) {
  const m = buildModel(report);
  const href = (v: View) => `${basePath}?view=${v === 'simple' ? 'simple' : 'detailed'}${preview ? '&preview=true' : ''}`;

  return (
    <div className="min-h-screen bg-background">
      {preview && <PreviewBanner />}
      <PortalHeader report={report} view={view} href={href} />

      <main className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 md:px-6 md:pt-8 lg:px-8">
        <div className="mb-6">
          <h1 className="type-page-title text-on-surface">{report.clientName}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-on-surface-variant">
            <span>Outbound report</span>
            <span aria-hidden="true">·</span>
            <span>{scopeText(report)}</span>
            <span aria-hidden="true">·</span>
            <span>All-time results</span>
            {m.asOf && (
              <>
                <span aria-hidden="true">·</span>
                <span title={new Date(m.asOf).toUTCString()}>Updated {relativeTime(m.asOf)}</span>
              </>
            )}
          </p>
        </div>

        {view === 'simple' ? (
          <SimpleView report={report} m={m} detailedHref={href('advanced')} conversations={conversations} />
        ) : (
          <DetailedView report={report} m={m} conversations={conversations} />
        )}
      </main>

      <footer className="border-t border-outline-variant/40 bg-surface-container-lowest">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-on-surface-variant md:px-6 lg:px-8">
          <p>{report.agencyName ? `Prepared by ${report.agencyName}` : 'Prepared by your agency'}</p>
          <p>Reporting by Klaroh</p>
        </div>
      </footer>
    </div>
  );
}

// ── header ──────────────────────────────────────────────────────────────────

function PortalHeader({ report, view, href }: { report: PortalReport; view: View; href: (v: View) => string }) {
  const initials = (report.agencyName || 'K').slice(0, 2).toUpperCase();
  return (
    <header className="border-b border-outline-variant/40 bg-surface-container-lowest">
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary text-xs font-semibold text-on-primary">
            {report.agencyLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={report.agencyLogoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <span className="truncate text-sm font-semibold text-on-surface">{report.agencyName || 'Your agency'}</span>
        </div>
        <nav aria-label="Report view" className="flex rounded-lg border border-outline-variant/60 bg-surface-container-low p-0.5 text-sm">
          {(['simple', 'advanced'] as View[]).map((v) => (
            <Link
              key={v}
              href={href(v)}
              aria-current={v === view ? 'page' : undefined}
              scroll={false}
              className={clsx(
                'rounded-md px-3 py-1.5 transition-colors',
                v === view ? 'bg-surface-container-lowest font-medium text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
              )}
            >
              {v === 'simple' ? 'At a glance' : 'Detailed report'}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

// ── shared pieces ───────────────────────────────────────────────────────────

function SummaryCard({ m, large }: { m: Model; large?: boolean }) {
  return (
    <section aria-label="Summary" className="rounded-lg border border-outline-variant/60 border-l-4 border-l-primary-container bg-surface-container-lowest px-5 py-5 md:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={m.summary.tone} icon={TrendingUp}>
          {m.summary.label}
        </StatusChip>
        <StatusChip tone={m.status.tone}>{m.status.label}</StatusChip>
      </div>
      <div className={clsx('mt-3 space-y-1.5 text-on-surface', large ? 'text-lg leading-relaxed md:text-xl' : 'text-base leading-relaxed')}>
        {m.summary.sentences.map((s) => (
          <p key={s}>{s}</p>
        ))}
      </div>
    </section>
  );
}

function metricCaption(m: Model, key: PortalMetricKey): string | null {
  const r = readMetric(m.set, key);
  if (r.value === null) return r.state === 'no_prospects' ? 'No prospects reached yet' : 'Not reported yet';
  if (key === 'replyRate' || key === 'positiveRate') return 'of prospects reached';
  if (key === 'humanReplies' && m.set.rates.replyRate !== null && !m.visible.includes('replyRate')) return `${fmtPct(m.set.rates.replyRate)} of prospects reached`;
  if (key === 'positive' && m.set.rates.positiveRate !== null && !m.visible.includes('positiveRate')) return `${fmtPct(m.set.rates.positiveRate)} of prospects reached`;
  return null;
}

function KpiCard({ m, k, large }: { m: Model; k: PortalMetricKey; large?: boolean }) {
  const r = readMetric(m.set, k);
  const caption = metricCaption(m, k);
  return (
    <div className="min-w-0 rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-4 py-4" title={PORTAL_METRICS[k].definition}>
      <p className="truncate text-sm text-on-surface-variant">{PORTAL_METRICS[k].label}</p>
      <p
        className={clsx(
          'mt-1 truncate font-semibold leading-tight tabular-nums',
          large ? 'text-[32px] md:text-[40px]' : 'text-[28px]',
          r.value === null ? 'text-on-surface-variant/50' : 'text-on-surface'
        )}
      >
        {formatMetric(k, r.value)}
      </p>
      {caption && <p className="mt-1 text-xs text-on-surface-variant">{caption}</p>}
    </div>
  );
}

const INFRA_TONE = { good: 'good', attention: 'warning', down: 'critical', unknown: 'neutral' } as const;

function InfrastructureCard({ infra }: { infra: PortalInfrastructure }) {
  return (
    <section aria-label="Sending infrastructure" className="rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-5 py-4">
      <div className="flex items-center gap-2">
        <Server size={16} className="text-on-surface-variant" aria-hidden="true" />
        <h2 className="type-section text-on-surface">Sending infrastructure</h2>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusChip tone={INFRA_TONE[infra.state]}>{infra.label}</StatusChip>
      </div>
      <p className="mt-2 text-sm text-on-surface">{infra.detail}</p>
      <p className="mt-1 text-xs text-on-surface-variant">
        The email accounts your campaigns send from{infra.checkedAt ? ` · checked ${relativeTime(infra.checkedAt)}` : ''}
      </p>
    </section>
  );
}

function EconomicsCard({ economics, m, agencyName }: { economics: EconomicsSummary; m: Model; agencyName: string | null }) {
  const showPositive = m.visible.includes('positive');
  return (
    <section aria-label="Investment" className="rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-5 py-4">
      <div className="flex items-center gap-2">
        <Wallet size={16} className="text-on-surface-variant" aria-hidden="true" />
        <h2 className="type-section text-on-surface">Investment</h2>
      </div>
      <div className="mt-3 space-y-4">
        {economics.groups.map((g) => (
          <div key={g.currency}>
            <p className="text-xs text-on-surface-variant">Campaign investment{economics.groups.length > 1 ? ` (${g.currency})` : ''}</p>
            <p className="mt-0.5 text-[28px] font-semibold leading-tight tabular-nums text-on-surface">{fmtCurrency(g.cost, g.currency)}</p>
            <dl className="mt-3 space-y-2 text-sm">
              {showPositive && g.positive !== null && (
                <Row label={economics.uncovered > 0 || economics.groups.length > 1 ? 'Positive responses from these campaigns' : 'Positive responses'} value={fmtCount(g.positive)} />
              )}
              <Row
                label="Cost per positive response"
                value={g.costPerPositive !== null ? fmtCurrency(g.costPerPositive, g.currency) : g.positive === 0 ? 'No positive responses yet' : 'Not available'}
                strong
              />
              {g.costPerProspect !== null && <Row label="Cost per prospect reached" value={fmtCurrency(g.costPerProspect, g.currency)} />}
              {g.estimatedValue !== null && (
                <>
                  <Row label="Estimated value of positive responses" value={fmtCurrency(g.estimatedValue, g.currency)} />
                  {g.returnPct !== null && <Row label="Estimated return on investment" value={`${g.returnPct >= 0 ? '+' : ''}${fmtPct(g.returnPct)}`} strong />}
                </>
              )}
            </dl>
            {g.estimatedValue !== null && (
              <p className="mt-2 text-xs text-on-surface-variant">
                Estimate based on {g.valuePerPositive !== null ? `${fmtCurrency(g.valuePerPositive, g.currency)} per positive response` : 'a value per positive response'}, set by{' '}
                {agencyName || 'your agency'}. Not actual revenue.
              </p>
            )}
          </div>
        ))}
      </div>
      {(economics.uncovered > 0 || economics.groups.length > 1) && (
        <p className="mt-3 border-t border-outline-variant/40 pt-2 text-xs text-on-surface-variant">
          {economics.uncovered > 0 &&
            `Covers ${economics.total - economics.uncovered} of ${economics.total} campaigns — the others have no cost recorded. `}
          {economics.groups.length > 1 && 'Amounts in different currencies are shown separately and are not converted.'}
        </p>
      )}
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-on-surface-variant">{label}</dt>
      <dd className={clsx('text-right tabular-nums', strong ? 'font-semibold text-on-surface' : 'text-on-surface')}>{value}</dd>
    </div>
  );
}

function EmptyCampaigns() {
  return (
    <div className="rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-6 py-12 text-center">
      <p className="text-base font-semibold text-on-surface">No campaigns in this report yet</p>
      <p className="mt-1 text-sm text-on-surface-variant">Results will appear here as soon as your first campaign is added.</p>
    </div>
  );
}

// ── at a glance ─────────────────────────────────────────────────────────────

function SimpleView({ report, m, detailedHref, conversations }: { report: PortalReport; m: Model; detailedHref: string; conversations: PortalConversations | null }) {
  const headline = SIMPLE_METRICS.filter((k) => m.visible.includes(k));
  const g = m.economics?.groups.length === 1 ? m.economics.groups[0] : null;
  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-outline-variant/60 bg-surface-container-lowest">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/40 px-5 py-3 md:px-6">
          <h2 className="type-section text-on-surface">Your outbound campaign at a glance</h2>
          <div className="flex items-center gap-2">
            <StatusChip tone={m.status.tone}>{m.status.label}</StatusChip>
            <span className="text-xs text-on-surface-variant">{m.status.detail}</span>
          </div>
        </div>
        {report.campaigns.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-on-surface-variant">No campaigns are included in this report yet.</p>
        ) : (
          <>
            {headline.length > 0 && (
              <div className={clsx('grid gap-px bg-outline-variant/40', headline.length === 1 ? 'grid-cols-1' : headline.length === 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-3')}>
                {headline.map((k) => {
                  const r = readMetric(m.set, k);
                  return (
                    <div key={k} className="bg-surface-container-lowest px-5 py-5 md:px-6" title={PORTAL_METRICS[k].definition}>
                      <p className="text-sm text-on-surface-variant">{PORTAL_METRICS[k].label}</p>
                      <p className={clsx('mt-1 text-[40px] font-semibold leading-none tabular-nums md:text-[48px]', r.value === null ? 'text-on-surface-variant/50' : 'text-on-surface')}>
                        {formatMetric(k, r.value)}
                      </p>
                      {metricCaption(m, k) && <p className="mt-1.5 text-xs text-on-surface-variant">{metricCaption(m, k)}</p>}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="space-y-1.5 border-t border-outline-variant/40 px-5 py-5 text-lg leading-relaxed text-on-surface md:px-6 md:text-xl">
              {m.summary.sentences.map((s) => (
                <p key={s}>{s}</p>
              ))}
            </div>
          </>
        )}
      </section>

      {report.campaigns.length > 0 && (
        <section aria-label="Health" className="rounded-lg border border-outline-variant/60 bg-surface-container-lowest">
          <dl className="divide-y divide-outline-variant/40">
            <HealthRow label="Campaign health" chip={<StatusChip tone={m.summary.tone} icon={TrendingUp}>{m.summary.label}</StatusChip>} />
            {m.infra && (
              <HealthRow label="Sending infrastructure" chip={<StatusChip tone={INFRA_TONE[m.infra.state]}>{m.infra.label}</StatusChip>} detail={m.infra.detail} />
            )}
            {g && (
              <HealthRow
                label="Investment"
                chip={<span className="text-sm font-semibold tabular-nums text-on-surface">{fmtCurrency(g.cost, g.currency)}</span>}
                detail={g.costPerPositive !== null ? `${fmtCurrency(g.costPerPositive, g.currency)} per positive response` : undefined}
              />
            )}
          </dl>
        </section>
      )}

      {conversations && <ConversationsGlance data={conversations} href={`${detailedHref}#conversations`} />}

      <Link href={detailedHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        See the detailed report <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </div>
  );
}

function HealthRow({ label, chip, detail }: { label: string; chip: React.ReactNode; detail?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3.5 md:px-6">
      <dt className="text-sm text-on-surface-variant">{label}</dt>
      <dd className="flex flex-wrap items-center justify-end gap-2">
        {detail && <span className="text-sm text-on-surface-variant">{detail}</span>}
        {chip}
      </dd>
    </div>
  );
}

// ── detailed report ─────────────────────────────────────────────────────────

function DetailedView({ report, m, conversations }: { report: PortalReport; m: Model; conversations: PortalConversations | null }) {
  if (report.campaigns.length === 0) {
    return (
      <div className="space-y-4">
        <SummaryCard m={m} />
        <EmptyCampaigns />
      </div>
    );
  }
  const history = snapshotHistory(
    report.history,
    report.campaigns.map((c) => c.id),
    Object.fromEntries(report.campaigns.map((c) => [c.id, c.startDate]))
  );
  const series: ProgressSeries[] = CHART_KEYS.filter((k) => m.visible.includes(k as PortalMetricKey)).map((k) => ({
    key: k,
    label: PORTAL_METRICS[k as PortalMetricKey].label,
    points: history.map((p) => ({ date: p.date, value: p.set.counts[k] })),
    currentStatus: k === 'positive',
  }));
  const side = m.economics || m.infra;

  return (
    <div className="space-y-4 lg:space-y-6">
      <SummaryCard m={m} large />

      {m.visible.length > 0 && (
        <section aria-label="Key figures">
          <div className={clsx('grid gap-3', COLS[m.visible.length] ?? COLS[5])}>
            {m.visible.map((k) => (
              <KpiCard key={k} m={m} k={k} />
            ))}
          </div>
        </section>
      )}

      <div className={clsx('grid grid-cols-1 items-start gap-4 lg:gap-6', side && 'lg:grid-cols-3')}>
        {series.length > 0 && (
          <section aria-label="Progress over time" className={clsx('min-w-0 rounded-lg border border-outline-variant/60 bg-surface-container-lowest', side && 'lg:col-span-2')}>
            <header className="border-b border-outline-variant/40 px-4 py-3 md:px-5">
              <h2 className="type-section text-on-surface">Progress over time</h2>
              <p className="mt-0.5 text-xs text-on-surface-variant">
                Totals as recorded on each update{report.campaigns.length > 1 ? ', all campaigns combined' : ''}.
                {series.some((s) => s.currentStatus) && ' Positive responses reflect each prospect’s status on that day, so they can go down if a status changes.'}
              </p>
            </header>
            <ProgressChart series={series} />
          </section>
        )}
        {side && (
          <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
            {m.economics && <EconomicsCard economics={m.economics} m={m} agencyName={report.agencyName} />}
            {m.infra && <InfrastructureCard infra={m.infra} />}
          </div>
        )}
      </div>

      {conversations && <ConversationsSection data={conversations} />}

      <CampaignList report={report} m={m} />
      <AboutNumbers m={m} multi={report.campaigns.length > 1} />
    </div>
  );
}

function CampaignList({ report, m }: { report: PortalReport; m: Model }) {
  const cols = (['prospectsContacted', 'humanReplies', 'positive'] as PortalMetricKey[]).filter((k) => m.visible.includes(k));
  return (
    <section aria-label="Campaigns" className="rounded-lg border border-outline-variant/60 bg-surface-container-lowest">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-outline-variant/40 px-4 py-3 md:px-5">
        <h2 className="type-section text-on-surface">{report.campaigns.length === 1 ? 'Campaign' : 'Campaigns'}</h2>
        {report.campaigns.length > 1 && <p className="text-xs text-on-surface-variant">The totals above combine these {report.campaigns.length} campaigns</p>}
      </header>
      <ul className="divide-y divide-outline-variant/40">
        {report.campaigns.map((c) => {
          const phase = campaignPhase(c);
          const set = metricSet([c.counts]);
          return (
            <li key={c.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-on-surface">{c.name}</span>
                  <StatusChip tone={phase.tone}>{phase.label}</StatusChip>
                </div>
                {c.startDate && <p className="mt-0.5 text-xs text-on-surface-variant">Started {fmtDay(c.startDate)}</p>}
              </div>
              {cols.length > 0 && (
                <dl className="flex gap-5 text-sm md:gap-8">
                  {cols.map((k) => (
                    <div key={k} className="md:text-right">
                      <dt className="text-xs text-on-surface-variant">{PORTAL_METRICS[k].label}</dt>
                      <dd className="font-semibold tabular-nums text-on-surface">{formatMetric(k, set.counts[k as CountKey])}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AboutNumbers({ m, multi }: { m: Model; multi: boolean }) {
  return (
    <details className="group rounded-lg border border-outline-variant/60 bg-surface-container-lowest">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-on-surface md:px-5">
        <Info size={15} className="text-on-surface-variant" aria-hidden="true" />
        About these numbers
      </summary>
      <div className="space-y-2 border-t border-outline-variant/40 px-4 py-3 text-sm text-on-surface-variant md:px-5">
        {m.visible.map((k) => (
          <p key={k}>
            <span className="font-medium text-on-surface">{PORTAL_METRICS[k].label}:</span> {PORTAL_METRICS[k].definition}
          </p>
        ))}
        <p>All figures are totals since each campaign started{multi ? ', added up across campaigns' : ''}. A figure that has not been reported is shown as “—”, never as zero.</p>
      </div>
    </details>
  );
}

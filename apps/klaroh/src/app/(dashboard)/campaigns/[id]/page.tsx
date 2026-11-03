export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { getSessionWorkspace } from '@/lib/data/workspace';
import { loadCampaignData, loadCampaignDetail, type CampaignDetailData } from '@/lib/data/analytics';
import {
  campaignsMetricSet,
  comparisonRows,
  formatMetric,
  LOW_VOLUME_PROSPECTS,
  metricHelp,
  metricSet,
  type MetricSet,
  type RateKey,
} from '@/lib/analytics/metrics';
import { MIN_STEP_SAMPLE, stepRankRows, stepViews } from '@/lib/analytics/steps';
import { warmupHealth, WARMUP_FAIR, WARMUP_GOOD, type WarmupHealth } from '@/lib/analytics/infrastructure';
import { DASH, fmtDay, fmtDecimal } from '@/lib/analytics/format';
import { providerLabel } from '@/lib/campaign-view';
import { relativeTime } from '@/lib/utils/relative-time';
import ComparisonTable from '@/components/analytics/ComparisonTable';
import { FunnelPanel, KpiPanel, PeriodNote } from '@/components/analytics/MetricPanels';
import StepTable from '@/components/analytics/StepTable';
import RankingChart from '@/components/analytics/RankingChart';
import { Panel, StatusBadge, ToneLabel, type Tone } from '@/components/analytics/ui';
import { DataTable, Td, Th, Tr } from '@/components/ui/DataTable';
import { PageContainer } from '@/components/ui/PageContainer';
import SyncStatus from '@/components/sync/SyncStatus';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ACCOUNT: Record<'active' | 'paused' | 'error' | 'unknown', { tone: Tone; label: string }> = {
  active: { tone: 'good', label: 'Active' },
  paused: { tone: 'neutral', label: 'Paused' },
  error: { tone: 'critical', label: 'Error' },
  unknown: { tone: 'unknown', label: 'Unknown' },
};

const WARMUP: Record<WarmupHealth, { tone: Tone; label: string }> = {
  good: { tone: 'good', label: 'Good' },
  fair: { tone: 'warning', label: 'Fair' },
  poor: { tone: 'critical', label: 'Poor' },
  off: { tone: 'neutral', label: 'Off' },
  error: { tone: 'critical', label: 'Error' },
  unknown: { tone: 'unknown', label: 'No score' },
};

/** This campaign's rates next to every other client campaign of the workspace. */
function Benchmark({ own, others, otherCount }: { own: MetricSet; others: MetricSet; otherCount: number }) {
  const keys: RateKey[] = ['replyRate', 'positiveRate'];
  return (
    <dl className="grid grid-cols-2 gap-px bg-outline-variant/40">
      {keys.map((k) => (
        <div key={k} className="bg-surface-container-lowest px-4 py-3" title={metricHelp(k)}>
          <dt className="text-xs text-on-surface-variant">{k === 'replyRate' ? 'Reply rate' : 'Positive rate'}</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-on-surface">{formatMetric(k, own.rates[k])}</dd>
          <dd className="text-xs text-on-surface-variant">
            {otherCount ? `${formatMetric(k, others.rates[k])} across the other ${otherCount} campaign${otherCount === 1 ? '' : 's'}` : 'No other campaigns to compare'}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Mailboxes({ data }: { data: CampaignDetailData }) {
  const c = data.campaign;
  if (!c.senderEmails.length) {
    return <p className="px-4 py-6 text-sm text-on-surface-variant md:px-5">Instantly has not reported which mailboxes this campaign sends from.</p>;
  }
  if (!data.mailboxes.length) {
    return (
      <p className="px-4 py-6 text-sm text-on-surface-variant md:px-5">
        This campaign sends from {c.senderEmails.length} mailbox{c.senderEmails.length === 1 ? '' : 'es'}. Their status and warmup appear after the next infrastructure sync.
      </p>
    );
  }
  return (
    <DataTable label="Sending mailboxes" minWidth={560} maxHeight="none">
      <thead>
        <tr>
          <Th sticky>Mailbox</Th>
          <Th>Status</Th>
          <Th>Warmup</Th>
          <Th align="right" title="Warmup health score reported by Instantly (0–100)">Health score</Th>
          <Th align="right">Daily limit</Th>
        </tr>
      </thead>
      <tbody>
        {data.mailboxes.map((m) => {
          const w = warmupHealth({ warmupStatus: m.warmupStatus, warmupScore: m.warmupScore });
          return (
            <Tr key={m.email}>
              <Td sticky className="max-w-[260px] truncate font-medium">
                <span title={m.email}>{m.email}</span>
              </Td>
              <Td>
                <ToneLabel tone={ACCOUNT[m.status].tone}>{ACCOUNT[m.status].label}</ToneLabel>
              </Td>
              <Td>
                <ToneLabel tone={WARMUP[w].tone} title={`Good ≥ ${WARMUP_GOOD}, fair ≥ ${WARMUP_FAIR} (Instantly score)`}>
                  {WARMUP[w].label}
                </ToneLabel>
              </Td>
              <Td align="right">{m.warmupScore === null ? 'Not reported' : fmtDecimal(m.warmupScore, 0)}</Td>
              <Td align="right">{m.dailyLimit === null ? DASH : m.dailyLimit}</Td>
            </Tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}

export default async function CampaignPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const session = await getSessionWorkspace();
  if (!session) return <p className="py-16 text-center text-on-surface-variant">Please log in.</p>;
  const [{ id }, raw] = await Promise.all([params, searchParams]);
  // Loaded before anything renders, so a campaign outside the caller's
  // workspace (RLS hides it) is a real HTTP 404.
  const [data, all] = await Promise.all([
    loadCampaignDetail(session.supabase, id),
    loadCampaignData(session.supabase, { clientId: null, campaignId: null, provider: null }),
  ]);
  if (!data) notFound();

  const c = data.campaign;
  const back = new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (typeof v === 'string' && k !== 'campaign' ? [[k, v]] : []))).toString();
  const own = metricSet([c.counts]);
  const others = all.all.filter((r) => r.id !== c.id);
  const peers = comparisonRows([...others, { ...c }]);
  const steps = stepViews(data.steps);
  const lowVolume = (c.counts.prospectsContacted ?? 0) < LOW_VOLUME_PROSPECTS;

  const facts: [string, React.ReactNode, string?][] = [
    ['Name', `From ${providerLabel(c.provider)}`, 'The campaign name comes from the provider and cannot be changed in Klaroh'],
    ['Clients', c.clientNames.join(', ') || DASH, c.clientNames.join(', ') || undefined],
    [
      'Sending mailboxes',
      c.senderEmails.length ? (
        <Link href={`/infrastructure/accounts?campaign=${c.id}`} className="inline-flex items-center gap-0.5 text-primary hover:underline">
          {c.senderEmails.length} mailbox{c.senderEmails.length === 1 ? '' : 'es'} <ArrowUpRight size={13} aria-hidden="true" />
        </Link>
      ) : (
        'Not reported'
      ),
    ],
    ['Dates', c.startDate || c.endDate ? `${fmtDay(c.startDate)} – ${c.endDate ? fmtDay(c.endDate) : 'ongoing'}` : c.createdDay ? `Created ${fmtDay(c.createdDay)}` : DASH],
    ['Daily limit', c.dailyLimit === null ? DASH : String(c.dailyLimit)],
    ['Last synced', c.lastSyncedAt ? relativeTime(c.lastSyncedAt) : DASH],
  ];

  return (
    <PageContainer>
      <Link href={`/campaigns${back ? `?${back}` : ''}`} className="mb-3 inline-flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary">
        <ArrowLeft size={13} aria-hidden="true" /> All campaigns
      </Link>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="type-page-title min-w-0 break-words">{c.name}</h1>
          <StatusBadge status={c.status} />
          <span className="rounded-full bg-surface-container px-2 py-0.5 text-xs text-on-surface-variant">{providerLabel(c.provider)}</span>
          {c.unavailableSince && <span className="rounded-full bg-surface-container px-2 py-0.5 text-xs text-on-surface-variant">No longer at provider</span>}
        </div>
        <SyncStatus refreshRoute />
      </div>

      <div className="space-y-4">
        <PeriodNote asOf={c.capturedAt} />

        <Panel title="Campaign details" bodyClassName="px-4 py-3 md:px-5">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {facts.map(([label, value, tip]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-on-surface-variant">{label}</dt>
                <dd className="truncate text-on-surface" title={tip}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>

        <KpiPanel
          set={own}
          title="Campaign performance"
          subtitle={lowVolume ? `Low volume: under ${LOW_VOLUME_PROSPECTS} prospects contacted, so rates can swing a lot` : undefined}
        />

        <div className="grid gap-4 lg:grid-cols-12">
          <FunnelPanel set={own} className="lg:col-span-7" />
          <Panel title="Against other campaigns" subtitle="Workspace client campaigns, all time" className="lg:col-span-5" bodyClassName="overflow-hidden rounded-b-lg">
            <Benchmark own={own} others={campaignsMetricSet(others)} otherCount={others.length} />
          </Panel>
        </div>

        {peers.length > 1 && (
          <Panel title="Campaign comparison" subtitle="This campaign is highlighted" bodyClassName="overflow-hidden rounded-b-lg">
            <ComparisonTable rows={peers} query={back} highlightId={c.id} filters={peers.length > 8} />
          </Panel>
        )}

        <Panel
          title="Sequence steps"
          subtitle={data.stepsAsOf ? `Which step gets replies — lifetime per step and variant, as of ${fmtDay(data.stepsAsOf)}` : 'Which step gets replies'}
          bodyClassName="overflow-hidden rounded-b-lg"
        >
          {steps.length ? (
            <>
              {steps.length > 1 && (
                <RankingChart
                  rows={stepRankRows(steps)}
                  label="Step"
                  sorted={false}
                  initial="humanReplies"
                  metrics={['humanReplies', 'positive']}
                  lowNote={`under ${MIN_STEP_SAMPLE} emails sent at this step`}
                  emptyText="No replies attributed to a step yet."
                />
              )}
              <StepTable steps={steps} />
            </>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-on-surface-variant md:px-5">
              Step analytics are not available yet. They are collected by the scheduled sync (or a refresh more than 15 minutes after the last one) when the provider reports them.
            </p>
          )}
        </Panel>

        <Panel
          title="Sending infrastructure"
          subtitle="Mailboxes this campaign sends from — current state, not campaign performance"
          bodyClassName="overflow-hidden rounded-b-lg"
          action={
            <Link href={`/infrastructure?campaign=${c.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Infrastructure <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          }
        >
          <Mailboxes data={data} />
        </Panel>
      </div>
    </PageContainer>
  );
}

export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSessionWorkspace } from '@/lib/data/workspace';
import { loadCampaignData, loadInfrastructure, loadReplyTimes, parseFilters, type AnalyticsFilters } from '@/lib/data/analytics';
import { campaignsMetricSet, clientBreakdown, comparisonRows, type CampaignRecord } from '@/lib/analytics/metrics';
import { attentionItems } from '@/lib/analytics/attention';
import { infraSummary, mailboxViews, toDay } from '@/lib/analytics/infrastructure';
import { rankRow } from '@/lib/analytics/ranking';
import { repliesByDay, REPLY_ACTIVITY_DAYS } from '@/lib/analytics/activity';
import { fmtCount } from '@/lib/analytics/format';
import { providerLabel } from '@/lib/campaign-view';
import AnalyticsShell from '@/components/analytics/AnalyticsShell';
import { AttentionPanel } from '@/components/analytics/Attention';
import RankingChart from '@/components/analytics/RankingChart';
import TrendChart from '@/components/analytics/TrendChart';
import { FunnelPanel, KpiPanel, PeriodNote } from '@/components/analytics/MetricPanels';
import SyncStatus from '@/components/sync/SyncStatus';
import { EmptyState, PageHeader, Panel } from '@/components/analytics/ui';
import { PageContainer } from '@/components/ui/PageContainer';
import { AttentionSkeleton, OverviewBodySkeleton } from '@/components/ui/PageSkeletons';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Campaigns drawn in the Overview ranking (all of them are on Campaigns and in the table view). */
const TOP_CAMPAIGNS = 8;

/**
 * Streams in on its own: the mailbox check needs the infrastructure load, which must not
 * hold up the rest of the page. If that load fails, mailboxes are simply left out (and the
 * "all clear" text does not claim they were checked).
 */
async function AttentionSection({ supabase, filters, campaigns, query }: { supabase: SupabaseClient; filters: AnalyticsFilters; campaigns: CampaignRecord[]; query: string }) {
  let infra = null;
  try {
    const data = await loadInfrastructure(supabase, filters);
    const views = mailboxViews(data.accounts, data.days, data.domains, data.campaigns, toDay(new Date()), data.allCampaigns);
    infra = views.length ? infraSummary(views) : null;
  } catch {
    infra = null;
  }
  const { items, total } = attentionItems({ campaigns, infra, query });
  return <AttentionPanel items={items} total={total} mailboxesChecked={infra !== null} campaignsHref={`/campaigns${query ? `?${query}` : ''}`} />;
}

/** Replies per day for the campaigns in view (synced, non-automatic). Streams in on its own. */
async function ReplyActivitySection({ supabase, campaignIds }: { supabase: SupabaseClient; campaignIds: string[] }) {
  let points: { date: string; value: number }[] = [];
  try {
    points = repliesByDay(await loadReplyTimes(supabase, campaignIds), toDay(new Date()));
  } catch {
    points = [];
  }
  const total = points.reduce((n, p) => n + p.value, 0);
  return (
    <Panel
      title="Replies per day"
      subtitle={`Human replies Klaroh has synced, last ${REPLY_ACTIVITY_DAYS} days${total ? ` · ${fmtCount(total)} in this period` : ''}. Counted per message, so it can differ from the human-replies metric (prospects per campaign).`}
      action={
        <Link href="/inbox?filter=human" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          Inbox <ArrowRight size={13} aria-hidden="true" />
        </Link>
      }
    >
      <TrendChart series={[{ key: 'replies', label: 'Human replies', points }]} emptyText="No replies synced in this period yet." />
    </Panel>
  );
}

async function Overview({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSessionWorkspace();
  if (!session) return <p className="py-16 text-center text-on-surface-variant">Please log in to view your dashboard.</p>;
  const raw = await searchParams;
  const filters = parseFilters(raw);
  const data = await loadCampaignData(session.supabase, filters);
  const query = new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : []))).toString();

  const shell = (children: React.ReactNode) => (
    <AnalyticsShell
      clients={data.clients}
      campaigns={data.campaignOptions}
      providers={data.providers.map((p) => ({ id: p, label: providerLabel(p) }))}
      selected={{ client: filters.clientId, campaign: filters.campaignId, provider: filters.provider }}
    >
      {children}
    </AnalyticsShell>
  );

  if (data.campaigns.length === 0) {
    return shell(
      <EmptyState
        title="No campaigns to analyse yet"
        body="Connect a sending platform and import campaigns for a client. Analytics appear after the first sync."
        action={{ href: '/clients', label: 'Go to clients' }}
      />
    );
  }

  const set = campaignsMetricSet(data.campaigns);
  const rows = comparisonRows(data.campaigns);
  const suffix = query ? `?${query}` : '';
  const campaignRanks = rows.map((r) => rankRow(r.id, r.name, `/campaigns/${r.id}${suffix}`, r.set));
  const clients = filters.clientId || filters.campaignId ? [] : clientBreakdown(data.campaigns, data.clients);
  const clientRanks = clients.map((c) => {
    const p = new URLSearchParams(query);
    p.delete('campaign');
    p.set('client', c.id);
    return rankRow(c.id, c.label, `/dashboard?${p.toString()}`, c.set);
  });
  const scope = filters.campaignId
    ? data.campaignOptions.find((c) => c.id === filters.campaignId)?.label
    : filters.clientId
      ? data.clients.find((c) => c.id === filters.clientId)?.label
      : 'All clients';

  return shell(
    <div className="space-y-4">
      <PeriodNote badge={false} asOf={data.asOf} campaigns={data.campaigns.length} scope={scope} />

      <Suspense fallback={<AttentionSkeleton />}>
        <AttentionSection supabase={session.supabase} filters={filters} campaigns={data.campaigns} query={query} />
      </Suspense>

      <KpiPanel
        set={set}
        title="Performance"
        subtitle={data.campaigns.length > 1 ? 'Prospects are counted per campaign, not as unique people' : undefined}
      />

      <div className="grid gap-4 lg:grid-cols-12">
        <Panel
          title="Outcomes by campaign"
          subtitle="All time. Click a bar to open the campaign."
          className="lg:col-span-7"
          action={
            <Link href={`/campaigns${suffix}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              All campaigns <ArrowRight size={13} aria-hidden="true" />
            </Link>
          }
        >
          <RankingChart rows={campaignRanks} label="Campaign" limit={TOP_CAMPAIGNS} emptyText="No campaign has reported results yet." />
        </Panel>
        <FunnelPanel set={set} className="lg:col-span-5" />
      </div>

      <Suspense fallback={<div className="h-72 animate-pulse rounded-lg bg-outline-variant/20" />}>
        <ReplyActivitySection supabase={session.supabase} campaignIds={data.campaigns.map((c) => c.id)} />
      </Suspense>

      {clientRanks.length > 1 && (
        <Panel title="By client" subtitle="All time. A campaign used by several clients counts for each of them. Click a bar to filter by that client.">
          <RankingChart rows={clientRanks} label="Client" initial="positiveRate" emptyText="No client has reported results yet." />
        </Panel>
      )}
    </div>
  );
}

export default function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageContainer>
      <PageHeader title="Overview" subtitle="How the whole outbound operation is performing.">
        <SyncStatus refreshRoute />
      </PageHeader>
      <Suspense fallback={<OverviewBodySkeleton />}>
        <Overview searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

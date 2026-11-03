export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { getSessionWorkspace } from '@/lib/data/workspace';
import { loadCampaignData, parseFilters } from '@/lib/data/analytics';
import { comparisonRows } from '@/lib/analytics/metrics';
import { providerLabel } from '@/lib/campaign-view';
import AnalyticsShell from '@/components/analytics/AnalyticsShell';
import ComparisonTable from '@/components/analytics/ComparisonTable';
import RankingChart from '@/components/analytics/RankingChart';
import { rankRow } from '@/lib/analytics/ranking';
import { PeriodNote } from '@/components/analytics/MetricPanels';
import { EmptyState, PageHeader, Panel } from '@/components/analytics/ui';
import { PageContainer } from '@/components/ui/PageContainer';
import SyncStatus from '@/components/sync/SyncStatus';
import { CampaignsBodySkeleton } from '@/components/ui/PageSkeletons';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function Campaigns({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSessionWorkspace();
  if (!session) return <p className="py-16 text-center text-on-surface-variant">Please log in.</p>;
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
    return shell(<EmptyState title="No campaigns yet" body="Import campaigns for a client to compare them here." action={{ href: '/clients', label: 'Go to clients' }} />);
  }

  const rows = comparisonRows(data.campaigns);
  const ranks = rows.map((r) => rankRow(r.id, r.name, `/campaigns/${r.id}${query ? `?${query}` : ''}`, r.set));

  return shell(
    <div className="space-y-4">
      <PeriodNote badge={false} asOf={data.asOf} campaigns={data.campaigns.length} />
      {rows.length > 1 && (
        <Panel title="Outcomes by campaign" subtitle="All time. Switch the measure; click a bar to open the campaign.">
          <RankingChart rows={ranks} label="Campaign" emptyText="No campaign has reported results yet." />
        </Panel>
      )}
      <Panel
        title="Campaign comparison"
        subtitle="Sorted by positive rate. Click a column to re-rank, or a campaign for its analytics."
        bodyClassName="overflow-hidden rounded-b-lg"
      >
        <ComparisonTable rows={rows} query={query} />
      </Panel>
    </div>
  );
}

export default function CampaignsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageContainer>
      <PageHeader title="Campaigns" subtitle="Which campaigns are working — compared on the same trusted metrics.">
        <SyncStatus refreshRoute />
      </PageHeader>
      <Suspense fallback={<CampaignsBodySkeleton />}>
        <Campaigns searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

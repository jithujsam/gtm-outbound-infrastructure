// Page-shaped loading bodies, used by route-level loading.tsx files and by the
// in-page Suspense fallbacks, so the same placeholder shows in both places.

import { PageContainer } from '@/components/ui/PageContainer';
import { LoadingRegion, Skeleton, SkeletonChart, SkeletonKpiPanel, SkeletonPageHeader, SkeletonPanel, SkeletonTable, SkeletonTabs, SkeletonToolbar } from '@/components/ui/Skeleton';

/** Overview: filters, attention, headline KPIs, funnel, trend + best campaigns, "All metrics" bar. */
export function AttentionSkeleton() {
  return (
    <SkeletonPanel>
      <div className="space-y-3 p-4">
        <Skeleton className="h-5 w-full max-w-md" />
        <Skeleton className="h-5 w-full max-w-sm" />
      </div>
    </SkeletonPanel>
  );
}

export function OverviewBodySkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonToolbar />
      <AttentionSkeleton />
      <SkeletonKpiPanel count={5} />
      <SkeletonPanel title={false}>
        <div className="flex gap-3 overflow-hidden p-4">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-14 min-w-24 flex-1" />
          ))}
        </div>
      </SkeletonPanel>
      <div className="grid gap-4 lg:grid-cols-12">
        <SkeletonPanel className="lg:col-span-8">
          <SkeletonChart />
        </SkeletonPanel>
        <SkeletonPanel className="lg:col-span-4">
          <SkeletonTable rows={5} cols={2} />
        </SkeletonPanel>
      </div>
      <SkeletonPanel title={false}>
        <div className="px-4 py-4 md:px-5">
          <Skeleton className="h-5 w-32" />
        </div>
      </SkeletonPanel>
    </div>
  );
}

/** Campaigns list: filters, best-campaigns panel, comparison table. */
export function CampaignsBodySkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonToolbar />
      <SkeletonPanel>
        <SkeletonCellsRow />
      </SkeletonPanel>
      <SkeletonPanel>
        <SkeletonTable rows={8} cols={8} />
      </SkeletonPanel>
    </div>
  );
}

function SkeletonCellsRow() {
  return (
    <div className="grid grid-cols-2 gap-px bg-outline-variant/40 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="bg-surface-container-lowest px-4 py-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-5 w-40" />
        </div>
      ))}
    </div>
  );
}

/** Campaign detail below the title: facts, filters, KPIs, trend, steps. */
export function CampaignDetailBodySkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonToolbar />
      <SkeletonPanel>
        <div className="grid grid-cols-2 gap-4 px-4 py-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i}>
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2 h-4 w-24" />
            </div>
          ))}
        </div>
      </SkeletonPanel>
      <SkeletonKpiPanel count={6} />
      <SkeletonPanel>
        <SkeletonChart />
      </SkeletonPanel>
      <SkeletonPanel>
        <SkeletonTable rows={4} cols={6} />
      </SkeletonPanel>
    </div>
  );
}

/** Infrastructure sections: filters, KPI row, panels. Tabs are part of the header. */
export function InfrastructureBodySkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonToolbar />
      <SkeletonKpiPanel count={5} />
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonPanel>
          <SkeletonTable rows={5} cols={3} />
        </SkeletonPanel>
        <SkeletonPanel>
          <SkeletonTable rows={5} cols={3} />
        </SkeletonPanel>
      </div>
    </div>
  );
}

/** Full-page variants, for loading.tsx. */
function Page({ children, subtitle = true, tabs, action }: { children: React.ReactNode; subtitle?: boolean; tabs?: boolean; action?: boolean }) {
  return (
    <PageContainer>
      <LoadingRegion>
        <SkeletonPageHeader subtitle={subtitle} action={action} />
        {tabs && <SkeletonTabs />}
        {children}
      </LoadingRegion>
    </PageContainer>
  );
}

export const OverviewSkeleton = () => <Page action><OverviewBodySkeleton /></Page>;

/** Inbox: header with the reply-sync row, then the conversation list beside the open conversation. */
export const InboxSkeleton = () => (
  <Page action>
    <SkeletonPanel title={false} className="grid min-h-[60vh] grid-cols-1 lg:grid-cols-[380px_1fr]">
      <div className="lg:border-r lg:border-outline-variant/40">
        <div className="space-y-2 border-b border-outline-variant/40 px-4 py-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-8 w-full" />
        </div>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2 border-b border-outline-variant/40 px-4 py-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
      <div className="hidden space-y-3 p-5 lg:block">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-28 w-full" />
      </div>
    </SkeletonPanel>
  </Page>
);
export const CampaignsSkeleton = () => <Page><CampaignsBodySkeleton /></Page>;
export const CampaignDetailSkeleton = () => (
  <PageContainer>
    <LoadingRegion>
      <Skeleton className="mb-3 h-4 w-28" />
      <SkeletonPageHeader subtitle={false} />
      <CampaignDetailBodySkeleton />
    </LoadingRegion>
  </PageContainer>
);
export const InfrastructureSkeleton = () => <Page tabs><InfrastructureBodySkeleton /></Page>;

/** Client list: search + cards. */
export const ClientsSkeleton = () => (
  <PageContainer>
    <LoadingRegion>
      <SkeletonPageHeader />
      <Skeleton className="mb-4 h-10 w-full max-w-md" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonPanel key={i} title={false}>
            <div className="space-y-3 p-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
          </SkeletonPanel>
        ))}
      </div>
    </LoadingRegion>
  </PageContainer>
);

/** Client detail: title, KPI strip, chart, campaign table. */
export const ClientDetailSkeleton = () => (
  <PageContainer>
    <LoadingRegion>
      <SkeletonPageHeader />
      <div className="space-y-4">
        <SkeletonKpiPanel count={4} />
        <SkeletonPanel>
          <SkeletonChart />
        </SkeletonPanel>
        <SkeletonPanel>
          <SkeletonTable rows={5} cols={7} />
        </SkeletonPanel>
      </div>
    </LoadingRegion>
  </PageContainer>
);

/** Fallback for any dashboard route without its own loading.tsx. */
export const GenericSkeleton = () => (
  <Page>
    <div className="space-y-4">
      <SkeletonPanel>
        <SkeletonTable rows={6} cols={4} />
      </SkeletonPanel>
    </div>
  </Page>
);

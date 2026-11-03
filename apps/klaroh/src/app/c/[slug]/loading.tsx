import { LoadingRegion, Skeleton, SkeletonChart, SkeletonKpiPanel, SkeletonPanel } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="min-h-screen bg-background px-4 py-6 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <LoadingRegion label="Loading dashboard">
          <Skeleton className="mb-6 h-9 w-72" />
          <div className="space-y-4">
            <SkeletonKpiPanel count={4} />
            <SkeletonPanel>
              <SkeletonChart />
            </SkeletonPanel>
          </div>
        </LoadingRegion>
      </div>
    </div>
  );
}

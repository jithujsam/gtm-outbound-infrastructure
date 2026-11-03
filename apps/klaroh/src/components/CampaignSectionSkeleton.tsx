export default function CampaignSectionSkeleton() {
  return (
    <>
      {/* Stat cards skeleton */}
      <div className="mb-8 grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 md:p-6"
          >
            <div className="mb-4 h-10 w-10 bg-outline-variant/20 rounded-lg" />
            <div className="h-3 w-16 bg-outline-variant/20 rounded-lg mb-3" />
            <div className="h-8 w-24 bg-outline-variant/30 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-6 lg:col-span-8">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="h-6 w-48 bg-outline-variant/30 rounded-lg mb-2" />
              <div className="h-3 w-40 bg-outline-variant/20 rounded-lg" />
            </div>
            <div className="h-10 w-32 bg-outline-variant/20 rounded-lg" />
          </div>
          <div className="h-64 bg-outline-variant/10 rounded-lg" />
        </div>
      </div>
    </>
  );
}

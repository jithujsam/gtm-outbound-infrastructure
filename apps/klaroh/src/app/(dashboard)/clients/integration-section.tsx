'use client';

import { providerLabel } from '@/lib/campaign-view';

interface IntegrationSectionProps {
  /** Provider of the selected campaign; null for the aggregate "All" view. */
  provider?: string | null;
}

/** Informational badge showing which provider the selected campaign comes from. */
export default function IntegrationSection({ provider }: IntegrationSectionProps) {
  if (!provider) return null;

  return (
    <div
      className="flex items-center gap-2 rounded-full border border-primary/10 bg-primary-fixed/20 px-3 py-1"
      title="Campaign integration"
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
      <span className="font-sans text-xs font-semibold uppercase tracking-wider text-primary">
        Connected - {providerLabel(provider)}
      </span>
    </div>
  );
}

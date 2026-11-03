'use client';

import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';

/** One client or all; keeps the other view settings in the URL. */
export default function ClientFilter({ clients, value, hrefFor }: { clients: { id: string; name: string }[]; value: string | null; hrefFor: Record<string, string> }) {
  const router = useRouter();
  return (
    // Same control as the analytics filters (AnalyticsShell), one step smaller for the list toolbar.
    <label className="relative flex min-w-0 items-center">
      <span className="sr-only">Client</span>
      <select
        id="inbox-client"
        value={value ?? ''}
        onChange={(e) => router.push(hrefFor[e.target.value] ?? hrefFor[''], { scroll: false })}
        className="h-8 w-full min-w-0 appearance-none truncate rounded-md border border-outline-variant/70 bg-surface-container-lowest pl-3 pr-8 text-[13px] text-on-surface outline-none transition-colors hover:border-outline focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <option value="">All clients</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-2.5 text-on-surface-variant" aria-hidden="true" />
    </label>
  );
}

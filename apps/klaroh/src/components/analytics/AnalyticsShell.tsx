'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { PERIOD_LABEL } from '@/lib/analytics/metrics';

export interface ShellOption {
  id: string;
  label: string;
}

interface Props {
  clients?: ShellOption[];
  campaigns?: ShellOption[];
  providers?: ShellOption[];
  selected: { client: string | null; campaign: string | null; provider: string | null };
  /** Section links for pages that belong to a section (Infrastructure). One row, directly under the page title. */
  subnav?: { href: string; label: string }[];
  /** What the figures cover; null for pages that show current state (Infrastructure). */
  period?: string | null;
  children: React.ReactNode;
}

/** Sub-sections of Infrastructure. */
export const INFRA_SECTIONS = [
  { href: '/infrastructure', label: 'Health' },
  { href: '/infrastructure/accounts', label: 'Email accounts' },
  { href: '/infrastructure/warmup', label: 'Warmup' },
  { href: '/infrastructure/domains', label: 'Domains' },
];

function Select({
  label,
  value,
  options,
  allLabel,
  onChange,
}: {
  label: string;
  value: string | null;
  options: ShellOption[];
  allLabel: string;
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="relative flex min-w-0 items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-9 w-full min-w-0 appearance-none truncate rounded-md border border-outline-variant/70 bg-surface-container-lowest pl-3 pr-8 text-sm text-on-surface outline-none transition-colors hover:border-outline focus:border-primary sm:w-auto sm:max-w-[220px]"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-2.5 text-on-surface-variant" aria-hidden="true" />
    </label>
  );
}

export default function AnalyticsShell({ clients, campaigns, providers, selected, subnav, period = PERIOD_LABEL, children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const navigate = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    startTransition(() => router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false }));
  };

  const query = params.toString();

  return (
    <div>
      {subnav && (
        <nav className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-outline-variant/50 px-4 md:mx-0 md:px-0" aria-label="Infrastructure sections">
          {subnav.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={`${t.href}${query ? `?${query}` : ''}`}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'relative whitespace-nowrap px-3 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
                  active ? 'font-semibold text-on-surface' : 'text-on-surface-variant hover:text-on-surface'
                )}
              >
                {t.label}
                {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
              </Link>
            );
          })}
        </nav>
      )}

      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        {period && (
          <span
            className="inline-flex h-9 w-fit items-center rounded-md bg-surface-container-low px-3 text-xs font-semibold text-on-surface"
            title="Lifetime totals from Instantly. Date ranges need per-day history, which Klaroh does not store yet."
          >
            {period}
          </span>
        )}

        {(clients?.length || campaigns?.length || providers?.length) ? (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {clients && clients.length > 0 && (
              <Select label="Client" value={selected.client} options={clients} allLabel="All clients" onChange={(v) => navigate({ client: v, campaign: null })} />
            )}
            {campaigns && campaigns.length > 0 && (
              <Select label="Campaign" value={selected.campaign} options={campaigns} allLabel="All campaigns" onChange={(v) => navigate({ campaign: v })} />
            )}
            {providers && providers.length > 0 && (
              <Select label="Provider" value={selected.provider} options={providers} allLabel="All providers" onChange={(v) => navigate({ provider: v })} />
            )}
          </div>
        ) : null}

        {pending && <span className="text-xs text-on-surface-variant" role="status">Updating…</span>}
      </div>

      <div className={clsx('transition-opacity', pending && 'pointer-events-none opacity-60')} aria-busy={pending}>
        {children}
      </div>
    </div>
  );
}

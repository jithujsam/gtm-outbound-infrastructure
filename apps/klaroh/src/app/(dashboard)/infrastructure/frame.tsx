// Shared by the Infrastructure sub-pages (Health, Email accounts, Warmup,
// Domains): loads the scoped infrastructure once, renders the page header,
// section tabs, sub-navigation, filters and the data-availability notice.

import { AlertTriangle } from 'lucide-react';
import { getSessionWorkspace } from '@/lib/data/workspace';
import { loadInfrastructure, parseFilters, type AnalyticsFilters, type InfraSyncState, type InfrastructureData } from '@/lib/data/analytics';
import { hasMailboxSending, MAILBOX_WINDOW_LABEL, mailboxViews, toDay, type MailboxView } from '@/lib/analytics/infrastructure';
import { fmtDay } from '@/lib/analytics/format';
import { providerLabel } from '@/lib/campaign-view';
import AnalyticsShell, { INFRA_SECTIONS } from '@/components/analytics/AnalyticsShell';
import { EmptyState, PageHeader } from '@/components/analytics/ui';
import { PageContainer } from '@/components/ui/PageContainer';
import SyncStatus from '@/components/sync/SyncStatus';

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export interface InfraContext {
  filters: AnalyticsFilters;
  data: InfrastructureData;
  /** Every mailbox in scope (including ones no longer used). */
  views: MailboxView[];
  /** Mailboxes currently used by a client campaign. */
  current: MailboxView[];
  /** The provider reported campaign sending per mailbox (otherwise sending signals are unavailable). */
  sending: boolean;
  /** Today (YYYY-MM-DD, UTC): the end of the mailbox window. */
  today: string;
}

const PART_LABEL: Record<string, string> = {
  accounts: 'Email accounts',
  warmup: 'Warmup analytics',
  domains: 'Domain DNS checks',
  steps: 'Step analytics',
  outcomes: 'Meetings / interested',
};

/** What the last infrastructure sync could not read (only the parts this page uses). */
function Availability({ sync, parts }: { sync: InfraSyncState; parts: string[] }) {
  if (!sync.at) {
    return (
      <p className="mb-4 rounded-md border border-outline-variant/50 bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
        Infrastructure data is collected by the scheduled sync (and by a manual refresh at most every 15 minutes). Nothing has been collected yet.
      </p>
    );
  }
  const gaps = Object.entries(sync.parts).filter(([k, v]) => parts.includes(k) && (v === 'failed' || v === 'unsupported'));
  if (!gaps.length) return <p className="mb-4 text-xs text-on-surface-variant">Last collected {fmtDay(sync.at)}. Sending and warmup figures cover the {MAILBOX_WINDOW_LABEL}.</p>;
  return (
    <div className="mb-4 rounded-md border border-warning/30 bg-warning-container/40 px-3 py-2 text-xs text-on-surface">
      <p className="flex items-center gap-1.5 font-medium">
        <AlertTriangle size={13} className="text-warning" aria-hidden="true" /> Some data could not be read on {fmtDay(sync.at)}
      </p>
      <ul className="mt-1 list-disc pl-5 text-on-surface-variant">
        {gaps.map(([k, v]) => (
          <li key={k}>
            {PART_LABEL[k] ?? k}: {v === 'unsupported' ? 'not offered by this provider' : sync.errors[k] ?? 'the provider request failed'}
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function InfraPage({
  searchParams,
  title,
  subtitle,
  parts,
  children,
}: {
  searchParams: SearchParams;
  title: string;
  subtitle: string;
  /** Sync parts this page depends on (for the availability notice). */
  parts: string[];
  children: (ctx: InfraContext) => React.ReactNode;
}) {
  const session = await getSessionWorkspace();
  if (!session) return <p className="py-16 text-center text-on-surface-variant">Please log in.</p>;
  const filters = parseFilters(await searchParams);
  const data = await loadInfrastructure(session.supabase, filters);
  const today = toDay(new Date());
  const views = mailboxViews(data.accounts, data.days, data.domains, data.campaigns, today, data.allCampaigns);
  const current = views.filter((v) => !v.unavailable);
  const sending = hasMailboxSending(data.days);
  const scoped = !!(filters.clientId || filters.campaignId);
  const shared = scoped && views.some((v) => v.otherCampaigns.length > 0);

  return (
    <PageContainer>
      <PageHeader title={title} subtitle={subtitle}>
        <SyncStatus refreshRoute />
      </PageHeader>
      <AnalyticsShell
        period={null}
        clients={data.clients}
        campaigns={data.campaigns.map((c) => ({ id: c.id, label: c.name }))}
        providers={data.providers.map((p) => ({ id: p, label: providerLabel(p) }))}
        selected={{ client: filters.clientId, campaign: filters.campaignId, provider: filters.provider }}
        subnav={INFRA_SECTIONS}
      >
        <Availability sync={data.sync} parts={parts} />
        {shared && (
          <p className="mb-4 rounded-md border border-outline-variant/50 bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
            Some of these mailboxes also send for campaigns outside this filter. Their sending and warmup figures cover every campaign each mailbox sends for; Klaroh does not split a mailbox&apos;s sends between campaigns or clients.
          </p>
        )}
        {views.length ? (
          children({ filters, data, views, current, sending, today })
        ) : (
          <EmptyState
            title="No email accounts yet"
            body="Klaroh tracks the mailboxes your client campaigns send from. They appear after the next infrastructure sync, if the connected provider key can read email accounts."
            action={{ href: '/dashboard', label: 'Back to overview' }}
          />
        )}
      </AnalyticsShell>
    </PageContainer>
  );
}

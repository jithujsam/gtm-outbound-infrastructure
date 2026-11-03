import { notFound } from 'next/navigation';
import { getClientBySlug } from '@/lib/data/clients';
import { getSessionWorkspace } from '@/lib/data/workspace';
import { getClientCampaigns } from '@/lib/data/campaigns';
import { getPortalConfig } from '@/lib/data/portal';
import { countsFromRow } from '@/lib/analytics/metrics';
import type { PortalCampaign } from '@/lib/analytics/portal';
import { PageContainer } from '@/components/ui/PageContainer';
import PortalSettingsForm from './portal-settings';

interface Props {
  params: Promise<{ slug: string }>;
}

/** "Choose what my client sees": the client portal's settings and campaign economics. */
export default async function ClientPortalSettingsPage({ params }: Props) {
  const { slug } = await params;
  const [session, client] = await Promise.all([getSessionWorkspace(), getClientBySlug(slug)]);
  if (!session || !client) return notFound();

  const [config, views] = await Promise.all([getPortalConfig(session.supabase, client.id), getClientCampaigns(session.supabase, client.id)]);
  if (!config) return notFound();

  const campaigns: PortalCampaign[] = views.map((v) => ({
    id: v.id,
    name: v.name,
    status: v.status,
    counts: countsFromRow(v),
    capturedAt: v.captured_at,
    startDate: v.start_date,
    ended: !!v.unavailable_since,
    economics: null,
  }));

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="type-page-title text-on-surface">Client portal</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Choose what {client.name} sees in their report. Figures always come from Klaroh&apos;s verified metrics.
        </p>
      </div>
      <PortalSettingsForm
        clientId={client.id}
        clientSlug={client.slug}
        clientName={client.name}
        clientActive={client.status === 'active'}
        campaigns={campaigns}
        initial={config}
      />
    </PageContainer>
  );
}

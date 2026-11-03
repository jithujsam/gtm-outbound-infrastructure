import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getClientBySlug } from '@/lib/data/clients';
import { getSessionWorkspace, getWorkspaceProfile } from '@/lib/data/workspace';
import DashboardLayout from '../dashboard-layout';
import { getClientCampaigns } from '@/lib/data/campaigns';
import { getPortalToken } from '@/lib/data/portal';
import type { InfraSignals } from '@/components/EmailInfrastructureSignals';
import { ClientDetailSkeleton } from '@/components/ui/PageSkeletons';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ClientSlugPage({ params }: Props) {
  const { slug } = await params;

  // Wave 1: workspace identity + client row (parallel, independent)
  const [session, client] = await Promise.all([getSessionWorkspace(), getClientBySlug(slug)]);

  if (!session || !client) return notFound();
  const { supabase } = session;

  // Wave 2: workspace profile + campaigns + portal link (parallel)
  const [workspace, initialCampaigns, portalToken] = await Promise.all([
    getWorkspaceProfile(supabase, session.workspaceId),
    getClientCampaigns(supabase, client.id),
    getPortalToken(supabase, client.id),
  ]);

  // Infra signals are already on the client row from getClientBySlug — no extra query.
  const initialInfraSignals: InfraSignals = {
    sending_capacity: client.sending_capacity ?? null,
    active_inboxes: client.active_inboxes ?? null,
    domain_health_score: client.domain_health_score ?? null,
    domain_health_status: client.domain_health_status ?? null,
  };

  return (
    <Suspense fallback={<ClientDetailSkeleton />}>
      <DashboardLayout
        userId={session.userId}
        clientId={client.id}
        clientName={client.name}
        clientSlug={client.slug}
        clientStatus={client.status}
        initialAgencyName={workspace?.name ?? ''}
        initialCampaigns={initialCampaigns}
        portalToken={portalToken}
        initialInfraSignals={initialInfraSignals}
      />
    </Suspense>
  );
}

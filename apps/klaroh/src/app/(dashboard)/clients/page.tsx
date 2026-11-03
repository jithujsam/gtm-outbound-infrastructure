export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { getSessionWorkspace } from '@/lib/data/workspace';
import { getWorkspaceClients } from '@/lib/data/clients';
import DashboardClientList from './dashboard-client-list';
import { ClientsSkeleton } from '@/components/ui/PageSkeletons';

async function ClientsListContent() {
  const session = await getSessionWorkspace();

  if (!session) {
    return (
      <div className="px-8 py-16 text-center">
        <p className="text-on-surface-variant">Please log in to view your clients.</p>
      </div>
    );
  }

  const clients = await getWorkspaceClients(session.supabase, session.workspaceId);
  
  return <DashboardClientList clients={clients} />;
}

export default function ClientsPage() {
  return (
    <Suspense
      fallback={<ClientsSkeleton />}
    >
      <ClientsListContent />
    </Suspense>
  );
}

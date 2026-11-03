import { NextRequest, NextResponse } from 'next/server';
import { canManageIntegrations, getSessionRole, getSessionWorkspace } from '@/lib/data/workspace';
import { disconnectIntegration, getWorkspaceIntegration } from '@/lib/data/integration-secrets';
import { getIntegrationSummaries } from '@/lib/data/integration-summary';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * DELETE /api/integrations/:id — disconnects the integration: syncing stops
 * and the stored credential is purged. Campaigns, client links and statistics
 * history are kept (client dashboards keep showing the last synced numbers);
 * reconnecting the same provider resumes syncing.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionWorkspace();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageIntegrations(await getSessionRole(session))) {
    return NextResponse.json(
      { error: 'Only workspace owners and admins can disconnect integrations.' },
      { status: 403 }
    );
  }

  const integration = await getWorkspaceIntegration(session.supabase, session.workspaceId, id);
  if (!integration) return NextResponse.json({ error: 'Integration not found' }, { status: 404 });

  const summary = (await getIntegrationSummaries(session.supabase, session.workspaceId)).find((s) => s.id === id);

  let ok = false;
  try {
    ok = await disconnectIntegration(createAdminClient(), session.workspaceId, id);
  } catch (err) {
    console.error('integrations DELETE: admin client unavailable:', err instanceof Error ? err.message : err);
  }
  if (!ok) return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });

  return NextResponse.json({
    disconnected: true,
    clientsAffected: summary?.client_count ?? 0,
    campaignsKept: summary?.campaign_count ?? 0,
  });
}

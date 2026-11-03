import { NextRequest, NextResponse } from 'next/server';
import { getSessionWorkspace } from '@/lib/data/workspace';
import { getWorkspaceIntegration, isConnected } from '@/lib/data/integration-secrets';
import { discoverProviderCampaigns } from '@/lib/sync/workspace-sync';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/integrations/:id/campaigns?clientId=… — the campaigns available in
 * the connected provider account (discovery). Nothing is stored. With
 * clientId, campaigns already on that client are flagged `linked`.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionWorkspace();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { supabase, workspaceId } = session;

  if (!(await checkRateLimit(`integration-campaigns:${session.userId}`, 60, 3600))) {
    return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 });
  }

  const integration = await getWorkspaceIntegration(supabase, workspaceId, id);
  if (!integration) return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
  if (!isConnected(integration)) {
    return NextResponse.json({ error: 'This integration is not connected.', kind: 'not_connected' }, { status: 409 });
  }

  let result;
  try {
    result = await discoverProviderCampaigns(createAdminClient(), integration);
  } catch (err) {
    console.error('integration campaigns: admin client unavailable:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to load campaigns' }, { status: 500 });
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error, kind: result.kind }, { status: result.status });
  }

  // Campaigns already on this client (the client must be the workspace's own).
  const clientId = request.nextUrl.searchParams.get('clientId');
  let linked = new Set<string>();
  if (clientId) {
    const { data } = await supabase
      .from('campaign_client_map')
      .select('campaigns_v2!inner(external_id, integration_id)')
      .eq('client_id', clientId)
      .eq('workspace_id', workspaceId)
      .eq('campaigns_v2.integration_id', integration.id);
    linked = new Set(
      ((data ?? []) as unknown as { campaigns_v2: { external_id: string } | { external_id: string }[] }[]).flatMap(
        (r) => (Array.isArray(r.campaigns_v2) ? r.campaigns_v2 : [r.campaigns_v2]).map((c) => c.external_id)
      )
    );
  }

  return NextResponse.json({
    campaigns: result.campaigns.map((c) => ({ ...c, linked: linked.has(c.external_id) })),
  });
}

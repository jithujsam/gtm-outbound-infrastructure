import { NextRequest, NextResponse } from 'next/server';
import { getSessionWorkspace } from '@/lib/data/workspace';
import { getWorkspaceIntegration, isConnected } from '@/lib/data/integration-secrets';
import { getClientCampaigns } from '@/lib/data/campaigns';
import { importCampaignsForClient, normalizeExternalIds } from '@/lib/sync/workspace-sync';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/clients/:id/campaigns { integrationId, externalIds } — imports the
 * selected provider campaigns for this client: only those campaigns are
 * stored, linked to the client and kept in sync. Returns the client's
 * campaigns afterwards so the dashboard can render without a reload.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const session = await getSessionWorkspace();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { supabase, workspaceId } = session;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }
  const integrationId = typeof body.integrationId === 'string' ? body.integrationId : '';
  const externalIds = normalizeExternalIds(body.externalIds);
  if (!integrationId || externalIds === null) {
    return NextResponse.json({ error: 'Missing integrationId or externalIds' }, { status: 400 });
  }
  if (externalIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one campaign to import.' }, { status: 400 });
  }

  if (!(await checkRateLimit(`import-campaigns:${session.userId}`, 60, 3600))) {
    return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 });
  }

  // Both the client and the integration must belong to the session's workspace.
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (clientErr) {
    console.error('import campaigns client lookup error:', clientErr.message);
    return NextResponse.json({ error: 'Failed to verify client' }, { status: 500 });
  }
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const integration = await getWorkspaceIntegration(supabase, workspaceId, integrationId);
  if (!integration) return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
  if (!isConnected(integration)) {
    return NextResponse.json({ error: 'This integration is not connected.', kind: 'not_connected' }, { status: 409 });
  }

  let result;
  try {
    result = await importCampaignsForClient({
      db: supabase,
      secrets: createAdminClient(),
      workspaceId,
      clientId,
      integration,
      externalIds,
    });
  } catch (err) {
    console.error('import campaigns failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to import campaigns' }, { status: 500 });
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error, kind: result.kind }, { status: result.status });
  }

  const campaigns = await getClientCampaigns(supabase, clientId);
  return NextResponse.json({ ...result, campaigns });
}

import { NextRequest, NextResponse } from 'next/server';
import { getSessionWorkspace } from '@/lib/data/workspace';
import { getWorkspaceSyncStatuses } from '@/lib/data/integration-sync';

/**
 * GET /api/sync/status[?integrationId=] — the sync state of the signed-in
 * workspace's connected integrations, from their sync_runs (server timestamps,
 * UTC). Read-only; RLS-scoped to the caller's workspace.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionWorkspace();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const integrationId = request.nextUrl.searchParams.get('integrationId');
  const integrations = await getWorkspaceSyncStatuses(session.supabase, session.workspaceId, integrationId);
  return NextResponse.json({ integrations }, { headers: { 'Cache-Control': 'no-store' } });
}

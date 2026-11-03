// Sync status of the workspace's connected integrations, for the browser.
// Server-side, through the signed-in user's RLS-scoped client; never credentials.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getProviderCatalogEntry } from '../providers/catalog.ts';
import { connectableProviders } from '../providers/index.ts';
import { loadSyncStatuses, type IntegrationSyncStatus } from '../sync/sync-status.ts';
import { isConnected, listWorkspaceIntegrations } from './integration-secrets.ts';

export async function getWorkspaceSyncStatuses(
  db: SupabaseClient,
  workspaceId: string,
  integrationId?: string | null
): Promise<IntegrationSyncStatus[]> {
  const integrations = (await listWorkspaceIntegrations(db, workspaceId, connectableProviders()))
    .filter(isConnected)
    .filter((i) => !integrationId || i.id === integrationId)
    .map((i) => ({ id: i.id, provider: i.provider, label: getProviderCatalogEntry(i.provider)?.label ?? i.label ?? i.provider }));
  return loadSyncStatuses(db, workspaceId, integrations);
}

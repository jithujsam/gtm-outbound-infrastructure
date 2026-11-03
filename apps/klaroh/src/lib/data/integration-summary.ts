// Browser-safe summaries of a workspace's integrations (status + usage, never
// credentials). Server-side: takes the signed-in user's RLS-scoped client.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getProviderCatalogEntry } from '../providers/catalog.ts';
import { connectableProviders } from '../providers/index.ts';
import type { IntegrationSummary } from '../types.ts';
import { isConnected, listWorkspaceIntegrations } from './integration-secrets.ts';

export async function getIntegrationSummaries(
  db: SupabaseClient,
  workspaceId: string
): Promise<IntegrationSummary[]> {
  const rows = await listWorkspaceIntegrations(db, workspaceId, connectableProviders());
  if (rows.length === 0) return [];

  // Which clients/campaigns depend on each integration.
  const { data: links, error } = await db
    .from('campaign_client_map')
    .select('client_id, campaign_id, campaigns_v2!inner(integration_id)')
    .eq('workspace_id', workspaceId);
  if (error) console.warn('getIntegrationSummaries usage error:', error.message);

  const clients = new Map<string, Set<string>>();
  const campaigns = new Map<string, Set<string>>();
  for (const link of (links ?? []) as unknown as {
    client_id: string;
    campaign_id: string;
    campaigns_v2: { integration_id: string } | { integration_id: string }[];
  }[]) {
    const parent = Array.isArray(link.campaigns_v2) ? link.campaigns_v2[0] : link.campaigns_v2;
    if (!parent) continue;
    const id = parent.integration_id;
    if (!clients.has(id)) clients.set(id, new Set());
    if (!campaigns.has(id)) campaigns.set(id, new Set());
    clients.get(id)!.add(link.client_id);
    campaigns.get(id)!.add(link.campaign_id);
  }

  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    label: getProviderCatalogEntry(r.provider)?.label ?? r.label ?? r.provider,
    connected: isConnected(r),
    updated_at: r.updated_at,
    client_count: clients.get(r.id)?.size ?? 0,
    campaign_count: campaigns.get(r.id)?.size ?? 0,
  }));
}

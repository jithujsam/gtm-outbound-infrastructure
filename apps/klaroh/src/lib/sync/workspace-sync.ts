// Server-only entry points that connect a workspace's stored integrations to
// the provider-neutral sync. Route handlers call these after resolving the
// workspace from the session (or, for cron, with the service-role client).
//
//   db       — writes campaign data; the user's RLS client (or service role for cron)
//   secrets  — the service-role client, used only to read the stored credential

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getDecryptedIntegrationKey,
  isConnected,
  listWorkspaceIntegrations,
} from '../data/integration-secrets.ts';
import { connectableProviders, getProviderAdapter } from '../providers/index.ts';
import { classifyProviderError, type ProviderErrorKind } from '../providers/types.ts';
import type { ProviderCampaignOption } from '../types.ts';
import { createSupabaseCampaignStore, type SyncTrigger } from './campaign-store.ts';
import { syncIntegration, type SyncOutcome } from './sync-integration.ts';

export type WorkspaceSyncOutcome = SyncOutcome | { status: 'not_connected'; error?: string };

export interface IntegrationRef {
  id: string;
  workspace_id: string;
  provider: string;
}

/** Manual refreshes within this window reuse the last successful sync. */
export const MANUAL_SYNC_MIN_INTERVAL_MS = 30_000;

/**
 * Step analytics and the sending infrastructure are heavier (several provider
 * calls) and change slowly: a manual refresh includes them at most this often.
 * Cron and imports always include them.
 */
export const EXTRAS_MIN_INTERVAL_MS = 15 * 60_000;

/** Most campaigns one import may select. */
export const MAX_IMPORT_CAMPAIGNS = 100;

export async function syncIntegrationById(
  db: SupabaseClient,
  secrets: SupabaseClient,
  integration: IntegrationRef,
  trigger: SyncTrigger,
  options: { minIntervalMs?: number; scope?: string[]; extras?: boolean; skipIfRunning?: boolean } = {}
): Promise<WorkspaceSyncOutcome> {
  const adapter = getProviderAdapter(integration.provider);
  if (!adapter) return { status: 'not_connected', error: 'Unsupported provider' };

  const apiKey = await getDecryptedIntegrationKey(secrets, integration);
  if (!apiKey) return { status: 'not_connected', error: `${adapter.label} is not connected` };

  const store = createSupabaseCampaignStore(db);
  let extras = options.extras ?? trigger !== 'manual';
  if (options.extras === undefined && trigger === 'manual') {
    const last = await store.lastExtrasSyncAt(integration.id);
    extras = !last || Date.now() - Date.parse(last) >= EXTRAS_MIN_INTERVAL_MS;
  }

  return syncIntegration({
    store,
    extras,
    adapter,
    ctx: { workspaceId: integration.workspace_id, integrationId: integration.id, provider: integration.provider },
    apiKey,
    trigger,
    scope: options.scope,
    minIntervalMs: options.minIntervalMs,
    // Manual and scheduled syncs never run twice at once for one integration;
    // an import (attach) of new campaigns may run beside them (writes are idempotent).
    skipIfRunning: options.skipIfRunning ?? (trigger === 'manual' || trigger === 'cron'),
  });
}

/** One integration's outcome of a workspace sync. */
export type IntegrationSyncOutcome = WorkspaceSyncOutcome & { integrationId: string; provider: string };

/**
 * Syncs every connected integration of the workspace (only the campaigns its
 * clients use), or only `integrationId` when given. Returns one outcome per
 * integration synced.
 */
export async function syncWorkspace(
  db: SupabaseClient,
  secrets: SupabaseClient,
  workspaceId: string,
  trigger: SyncTrigger,
  minIntervalMs?: number,
  integrationId?: string
): Promise<IntegrationSyncOutcome[]> {
  const integrations = (await listWorkspaceIntegrations(db, workspaceId, connectableProviders()))
    .filter(isConnected)
    .filter((i) => !integrationId || i.id === integrationId);
  const outcomes: IntegrationSyncOutcome[] = [];
  for (const integration of integrations) {
    const outcome = await syncIntegrationById(db, secrets, integration, trigger, { minIntervalMs });
    outcomes.push({ ...outcome, integrationId: integration.id, provider: integration.provider });
  }
  return outcomes;
}

// ── discovery: what exists in the connected account (transient) ─────────────

export type DiscoveryResult =
  | { ok: true; campaigns: ProviderCampaignOption[] }
  | { ok: false; status: number; error: string; kind: ProviderErrorKind | 'not_connected' };

/**
 * The campaigns available in the connected provider account, with their
 * current metrics, in Klaroh's provider-neutral shape. Nothing is stored:
 * campaigns only enter Klaroh when the user imports them for a client.
 */
export async function discoverProviderCampaigns(
  secrets: SupabaseClient,
  integration: IntegrationRef
): Promise<DiscoveryResult> {
  const adapter = getProviderAdapter(integration.provider);
  const apiKey = adapter ? await getDecryptedIntegrationKey(secrets, integration) : null;
  if (!adapter || !apiKey) {
    return { ok: false, status: 409, error: 'This integration is not connected.', kind: 'not_connected' };
  }

  const [list, stats] = await Promise.all([adapter.listCampaigns(apiKey), adapter.fetchStats(apiKey)]);
  if (!list.ok) {
    const kind = classifyProviderError(list.error);
    return {
      ok: false,
      status: kind === 'auth' ? 401 : 502,
      error: adapter.userSafeError(list.error, `Could not load campaigns from ${adapter.label}.`),
      kind,
    };
  }

  // Metrics are a nice-to-have in the picker; a stats failure still lists campaigns.
  const metricsById = new Map(stats.ok ? stats.data.map((s) => [s.externalId, s.metrics]) : []);
  const campaigns = list.data.map((c): ProviderCampaignOption => {
    const m = metricsById.get(c.externalId);
    return {
      external_id: c.externalId,
      name: c.name,
      status: c.status,
      external_created_at: c.externalCreatedAt,
      emails_sent: m?.emailsSent ?? null,
      contacted: m?.contacted ?? null,
      opens: m?.opens ?? null,
      opens_unique: m?.opensUnique ?? null,
      replies: m?.replies ?? null,
      replies_unique: m?.repliesUnique ?? null,
      opportunities: m?.opportunities ?? null,
      leads: m?.leads ?? null,
    };
  });
  return { ok: true, campaigns };
}

// ── import: selected campaigns → this client ─────────────────────────────────

export type ImportResult =
  | {
      ok: true;
      /** Newly linked to the client. */
      linked: number;
      /** Were already on the client. */
      alreadyLinked: number;
      /** Selected ids the provider account does not have. */
      notFound: string[];
      /** Set when campaigns were imported but their statistics could not be fetched/saved. */
      warning?: string;
    }
  | { ok: false; status: number; error: string; kind?: ProviderErrorKind | 'not_connected' };

/** Trims, de-duplicates and bounds a caller-supplied list of external ids. */
export function normalizeExternalIds(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const ids = [
    ...new Set(
      input
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim())
        .filter((v) => v.length > 0 && v.length <= 200)
    ),
  ];
  return ids;
}

/**
 * Imports the selected provider campaigns for one client: fetches them from
 * the provider (which also proves they exist in the connected account), stores
 * only those campaigns with today's statistics, and links them to the client.
 * From then on they are in the sync scope; unselected campaigns never are.
 *
 * The caller must already have verified that the client and the integration
 * belong to the session's workspace (the database re-checks this as well).
 */
export async function importCampaignsForClient(params: {
  db: SupabaseClient;
  secrets: SupabaseClient;
  workspaceId: string;
  clientId: string;
  integration: IntegrationRef;
  externalIds: string[];
}): Promise<ImportResult> {
  const { db, secrets, workspaceId, clientId, integration, externalIds } = params;
  if (externalIds.length === 0) return { ok: false, status: 400, error: 'Select at least one campaign to import.' };
  if (externalIds.length > MAX_IMPORT_CAMPAIGNS) {
    return { ok: false, status: 400, error: `Select at most ${MAX_IMPORT_CAMPAIGNS} campaigns at a time.` };
  }

  const outcome = await syncIntegrationById(db, secrets, integration, 'attach', { scope: externalIds });
  if (outcome.status === 'not_connected') {
    return { ok: false, status: 409, error: 'This integration is not connected.', kind: 'not_connected' };
  }
  if (outcome.status === 'failed' || outcome.status === 'skipped') {
    return {
      ok: false,
      status: outcome.errorKind === 'auth' ? 401 : 502,
      error: outcome.error ?? 'Could not import campaigns',
      kind: outcome.errorKind,
    };
  }

  const campaignIds = [...outcome.campaignIds.values()];
  if (campaignIds.length === 0) {
    return { ok: false, status: 404, error: 'None of the selected campaigns were found in the connected account.' };
  }

  const { data: existing } = await db
    .from('campaign_client_map')
    .select('campaign_id')
    .eq('client_id', clientId)
    .in('campaign_id', campaignIds);
  const already = new Set((existing ?? []).map((r) => r.campaign_id as string));
  const toLink = campaignIds.filter((id) => !already.has(id));

  if (toLink.length) {
    const { error } = await db
      .from('campaign_client_map')
      .upsert(
        toLink.map((campaign_id) => ({ campaign_id, client_id: clientId, workspace_id: workspaceId })),
        { onConflict: 'campaign_id,client_id', ignoreDuplicates: true }
      );
    if (error) {
      console.error('importCampaignsForClient link error:', error.message);
      return { ok: false, status: 500, error: 'Could not add the campaigns to this client.' };
    }
  }

  return {
    ok: true,
    linked: toLink.length,
    alreadyLinked: already.size,
    notFound: outcome.missing,
    ...(outcome.status === 'partial' && outcome.error ? { warning: outcome.error } : {}),
  };
}

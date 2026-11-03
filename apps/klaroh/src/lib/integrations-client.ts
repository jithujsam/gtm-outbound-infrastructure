// Browser-side calls to the integration endpoints. Works only with integration
// ids and statuses — credentials are sent once (when connecting) and never
// come back.

import type { ProviderCatalogEntry } from './providers/catalog';
import type { CampaignView, IntegrationSummary, ProviderCampaignOption } from './types';
import type { IntegrationSyncStatus } from './sync/sync-status';

export type ApiErrorKind = 'auth' | 'rate_limited' | 'unavailable' | 'error' | 'not_connected';

export class ApiError extends Error {
  status: number;
  kind: ApiErrorKind | null;
  constructor(message: string, status: number, kind: ApiErrorKind | null) {
    super(message);
    this.status = status;
    this.kind = kind;
  }
}

async function request<T>(url: string, init?: RequestInit, fallback = 'Something went wrong'): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError('Could not reach Klaroh. Check your connection and try again.', 0, 'unavailable');
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(
      typeof body.error === 'string' ? body.error : fallback,
      res.status,
      typeof body.kind === 'string' ? (body.kind as ApiErrorKind) : null
    );
  }
  return body as T;
}

export interface IntegrationsState {
  providers: ProviderCatalogEntry[];
  integrations: IntegrationSummary[];
  canManage: boolean;
}

export const fetchIntegrations = () =>
  request<IntegrationsState>('/api/integrations', undefined, 'Could not load integrations');

export const connectIntegration = (provider: string, apiKey: string) =>
  request<{ integration: { id: string; provider: string; label: string; connected: boolean } }>(
    '/api/integrations',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, apiKey }) },
    'Could not connect'
  );

export const disconnectIntegration = (integrationId: string) =>
  request<{ disconnected: boolean; clientsAffected: number; campaignsKept: number }>(
    `/api/integrations/${encodeURIComponent(integrationId)}`,
    { method: 'DELETE' },
    'Could not disconnect'
  );

export const fetchProviderCampaigns = (integrationId: string, clientId: string) =>
  request<{ campaigns: ProviderCampaignOption[] }>(
    `/api/integrations/${encodeURIComponent(integrationId)}/campaigns?clientId=${encodeURIComponent(clientId)}`,
    undefined,
    'Could not load campaigns'
  );

export interface ImportResponse {
  linked: number;
  alreadyLinked: number;
  notFound: string[];
  warning?: string;
  campaigns: CampaignView[];
}

export const importClientCampaigns = (clientId: string, integrationId: string, externalIds: string[]) =>
  request<ImportResponse>(
    `/api/clients/${encodeURIComponent(clientId)}/campaigns`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationId, externalIds }),
    },
    'Could not import campaigns'
  );

// ── sync status ────────────────────────────────────────────────────────────

export const fetchSyncStatus = (integrationId?: string) =>
  request<{ integrations: IntegrationSyncStatus[] }>(
    `/api/sync/status${integrationId ? `?integrationId=${encodeURIComponent(integrationId)}` : ''}`,
    { cache: 'no-store' },
    'Could not load the sync status'
  ).then((r) => r.integrations);

export interface SyncResponse {
  /** success | partial | failed | skipped | in_progress | not_connected */
  status: string;
  error?: string;
  campaignsUpserted?: number;
  /** The sync status after the request (server timestamps). */
  integrations?: IntegrationSyncStatus[];
}

/**
 * Starts a sync. `manual` = the Sync button (always syncs unless one is
 * running); `auto` = a page refreshing its data (skipped right after a sync).
 * Resolves for every server answer, including 409 (in progress) and 502
 * (failed): the body says what happened.
 */
export async function requestSync(mode: 'manual' | 'auto', integrationId?: string): Promise<SyncResponse> {
  let res: Response;
  try {
    res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, ...(integrationId ? { integrationId } : {}) }),
    });
  } catch {
    return { status: 'failed', error: 'Could not reach Klaroh. Check your connection and try again.' };
  }
  const body = (await res.json().catch(() => ({}))) as Partial<SyncResponse>;
  return {
    ...body,
    status: typeof body.status === 'string' ? body.status : res.ok ? 'success' : 'failed',
    ...(!res.ok && typeof body.error !== 'string' ? { error: 'Sync failed. Please try again.' } : {}),
  };
}

// Server-side access to workspace integrations and their stored credentials.
//
// SECURITY: this file must NEVER start with 'use server'. Every export of a
// 'use server' module becomes a publicly invocable endpoint, and some of the
// functions below return decrypted third-party API keys. They are only meant
// to be imported by route handlers after the caller has been authenticated and
// the workspace resolved from the session.
//
// Two kinds of client are passed in:
//   * `db`      — the signed-in user's client (RLS-scoped). Signed-in users can
//                 read every integration column EXCEPT api_key_encrypted and
//                 cannot write integrations at all (see migration
//                 20261007000100).
//   * `secrets` — the service-role client. Only it can read or write the
//                 credential, and every function taking it also takes the
//                 session's workspace id and refuses rows of other workspaces.

import { decryptApiKey, encryptApiKey } from '../encryption.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface IntegrationRow {
  id: string;
  workspace_id: string;
  provider: string;
  enabled: boolean;
  label: string | null;
  has_credential: boolean;
  created_at: string | null;
  updated_at: string | null;
}

const PUBLIC_COLUMNS = 'id, workspace_id, provider, enabled, label, has_credential, created_at, updated_at';

/** Connected = enabled with a stored credential. */
export const isConnected = (i: Pick<IntegrationRow, 'enabled' | 'has_credential'>): boolean =>
  i.enabled && i.has_credential;

/** The workspace's integrations for the given providers (any state). */
export async function listWorkspaceIntegrations(
  db: SupabaseClient,
  workspaceId: string,
  providers: string[]
): Promise<IntegrationRow[]> {
  if (providers.length === 0) return [];
  const { data, error } = await db
    .from('integrations')
    .select(PUBLIC_COLUMNS)
    .eq('workspace_id', workspaceId)
    .in('provider', providers)
    .order('created_at', { ascending: true });
  if (error || !data) {
    if (error) console.warn('listWorkspaceIntegrations error:', error.message);
    return [];
  }
  return data as IntegrationRow[];
}

/** One integration of the workspace (any state), or null. */
export async function getWorkspaceIntegration(
  db: SupabaseClient,
  workspaceId: string,
  integrationId: string
): Promise<IntegrationRow | null> {
  const { data, error } = await db
    .from('integrations')
    .select(PUBLIC_COLUMNS)
    .eq('id', integrationId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn('getWorkspaceIntegration error:', error.message);
    return null;
  }
  return data as IntegrationRow;
}

/** The workspace's connected integration for a provider, or null. */
export async function getEnabledIntegration(
  db: SupabaseClient,
  workspaceId: string,
  provider: string
): Promise<IntegrationRow | null> {
  const { data, error } = await db
    .from('integrations')
    .select(PUBLIC_COLUMNS)
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)
    .eq('enabled', true)
    .eq('has_credential', true)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn('getEnabledIntegration error:', error.message);
    return null;
  }
  return data as IntegrationRow;
}

/**
 * Decrypts the API key of an enabled integration that belongs to
 * `integration.workspace_id`. Returns null when the row is missing, disabled,
 * in another workspace, or the key cannot be decrypted.
 */
export async function getDecryptedIntegrationKey(
  secrets: SupabaseClient,
  integration: { id: string; workspace_id: string }
): Promise<string | null> {
  const { data, error } = await secrets
    .from('integrations')
    .select('api_key_encrypted')
    .eq('id', integration.id)
    .eq('workspace_id', integration.workspace_id)
    .eq('enabled', true)
    .maybeSingle();

  if (error || !data?.api_key_encrypted) return null;

  try {
    return decryptApiKey(data.api_key_encrypted) ?? null;
  } catch {
    return null;
  }
}

/**
 * Creates or refreshes the workspace's integration for a provider with an
 * already validated API key (encrypted at rest). Re-enables a previously
 * disconnected row, so its campaigns and history carry on under the same
 * integration. Returns the integration id, or null on failure.
 */
export async function upsertIntegrationKey(
  secrets: SupabaseClient,
  workspaceId: string,
  provider: string,
  label: string,
  apiKey: string
): Promise<string | null> {
  let encrypted: string;
  try {
    encrypted = encryptApiKey(apiKey);
  } catch (err) {
    console.error('Failed to encrypt integration key:', err instanceof Error ? err.message : err);
    return null;
  }

  const payload = {
    workspace_id: workspaceId,
    provider,
    label,
    enabled: true,
    api_key_encrypted: encrypted,
  };

  const { data: existing } = await secrets
    .from('integrations')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const result = existing?.id
    ? await secrets
        .from('integrations')
        .update(payload)
        .eq('id', existing.id)
        .eq('workspace_id', workspaceId)
        .select('id')
        .single()
    : await secrets.from('integrations').insert(payload).select('id').single();

  if (result.error || !result.data) {
    if (result.error) console.warn('upsertIntegrationKey error:', result.error.message);
    return null;
  }
  return result.data.id as string;
}

/**
 * Disconnects an integration of the workspace: disables it and purges the
 * stored credential. Campaigns, client links and statistics history are kept;
 * reconnecting the same provider re-enables this row and syncing resumes.
 */
export async function disconnectIntegration(
  secrets: SupabaseClient,
  workspaceId: string,
  integrationId: string
): Promise<boolean> {
  const { data, error } = await secrets
    .from('integrations')
    .update({ enabled: false, api_key_encrypted: null })
    .eq('id', integrationId)
    .eq('workspace_id', workspaceId)
    .select('id');
  if (error) {
    console.warn('disconnectIntegration error:', error.message);
    return false;
  }
  return (data ?? []).length === 1;
}

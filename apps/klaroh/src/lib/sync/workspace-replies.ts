// Server-only entry points for the reply sync (see reply-sync.ts): resolve the
// integration's stored credential with the service-role client, then sync
// through `db` (the signed-in member's RLS client, or service role for cron).

import type { SupabaseClient } from '@supabase/supabase-js';
import { getDecryptedIntegrationKey, isConnected, listWorkspaceIntegrations } from '../data/integration-secrets.ts';
import { connectableProviders, getProviderAdapter } from '../providers/index.ts';
import { createSupabaseReplyStore } from './reply-store.ts';
import { REPLY_SYNC_MIN_INTERVAL_MS, STATUS_REFRESH_DAYS, syncReplies, type ReplySyncOutcome, type ReplySyncTrigger } from './reply-sync.ts';
import type { IntegrationRef } from './workspace-sync.ts';

export type ReplyIntegrationOutcome = (ReplySyncOutcome | { status: 'not_connected'; error?: string }) & { integrationId: string };

export async function syncRepliesById(
  db: SupabaseClient,
  secrets: SupabaseClient,
  integration: IntegrationRef,
  trigger: ReplySyncTrigger
): Promise<ReplyIntegrationOutcome> {
  const adapter = getProviderAdapter(integration.provider);
  if (!adapter?.fetchReplyPage) return { status: 'unsupported', runId: null, messagesSeen: 0, messagesStored: 0, threadsUpdated: 0, pages: 0, backlog: false, integrationId: integration.id };
  const apiKey = await getDecryptedIntegrationKey(secrets, integration);
  if (!apiKey) return { status: 'not_connected', error: `${adapter.label} is not connected`, integrationId: integration.id };
  const outcome = await syncReplies({
    store: createSupabaseReplyStore(db),
    adapter,
    ctx: { workspaceId: integration.workspace_id, integrationId: integration.id },
    apiKey,
    trigger,
    minIntervalMs: trigger === 'manual' ? REPLY_SYNC_MIN_INTERVAL_MS : 0,
    refreshDays: STATUS_REFRESH_DAYS,
  });
  return { ...outcome, integrationId: integration.id };
}

/** Every connected integration of the workspace, one after the other (never in parallel). */
export async function syncWorkspaceReplies(
  db: SupabaseClient,
  secrets: SupabaseClient,
  workspaceId: string,
  trigger: ReplySyncTrigger
): Promise<ReplyIntegrationOutcome[]> {
  const integrations = (await listWorkspaceIntegrations(db, workspaceId, connectableProviders())).filter(isConnected);
  const out: ReplyIntegrationOutcome[] = [];
  for (const integration of integrations) out.push(await syncRepliesById(db, secrets, integration, trigger));
  return out;
}

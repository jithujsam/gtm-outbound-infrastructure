import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionWorkspace } from '@/lib/data/workspace';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { connectableProviders } from '@/lib/providers';
import { getWorkspaceSyncStatuses } from '@/lib/data/integration-sync';
import {
  MANUAL_SYNC_MIN_INTERVAL_MS,
  syncIntegrationById,
  syncWorkspace,
  type IntegrationSyncOutcome,
} from '@/lib/sync/workspace-sync';
import { syncRepliesById } from '@/lib/sync/workspace-replies';

// The scheduled run also syncs replies (spaced provider requests); see REPLY_CRON_BUDGET_MS.
export const maxDuration = 300;
/** Reply syncs start only while the cron run is younger than this; the rest continue next time. */
const REPLY_CRON_BUDGET_MS = 200_000;

// Campaign sync (V2), provider-neutral. Only campaigns that a client uses
// (campaign_client_map) are fetched and stored — never a whole provider
// account. Writes campaigns_v2, one campaign_stats snapshot per campaign per
// day, and a sync_runs row (the source of every sync status Klaroh shows).
//   1. POST — for the signed-in workspace. { mode: 'auto' } (default: a page
//      opening refreshes data, skipped within 30 s of the last successful sync)
//      or { mode: 'manual' } (the Sync button: always syncs unless one is running).
//   2. GET  — Vercel Cron: every connected integration of every workspace.

function summarize(outcomes: IntegrationSyncOutcome[]) {
  const failed = outcomes.find((o) => o.status === 'failed' || o.status === 'partial');
  const synced = outcomes.filter((o) => o.status === 'success' || o.status === 'partial');
  const running = outcomes.find((o) => o.status === 'in_progress');
  return {
    status:
      outcomes.length === 0
        ? 'not_connected'
        : failed?.status ?? (synced.length ? 'success' : running ? 'in_progress' : 'skipped'),
    campaignsUpserted: synced.reduce((n, o) => n + ('campaignsUpserted' in o ? o.campaignsUpserted : 0), 0),
    statsWritten: synced.reduce((n, o) => n + ('statsWritten' in o ? o.statsWritten : 0), 0),
    ...(failed?.error ? { error: failed.error } : {}),
    ...(!failed && !synced.length && running ? { error: 'A sync is already in progress.' } : {}),
    // which integration did what (no credentials, no provider payloads)
    outcomes: outcomes.map((o) => ({ integrationId: o.integrationId, provider: o.provider, status: o.status })),
  };
}

// Single-flight guard per server instance: parallel page loads share one sync;
// a manual click while one runs is told so (the database guard covers other
// instances and the scheduled sync — see skipIfRunning).
const inflight = new Map<string, Promise<IntegrationSyncOutcome[]>>();

export async function POST(request: NextRequest) {
  const session = await getSessionWorkspace();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { supabase, userId, workspaceId } = session;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // no body: an automatic refresh (older clients)
  }
  const manual = body.mode === 'manual';
  const integrationId = typeof body.integrationId === 'string' && body.integrationId ? body.integrationId : undefined;

  // Every call can hit provider APIs (the dashboard syncs on each view).
  if (!(await checkRateLimit(`sync:${userId}`, 240, 3600))) {
    return NextResponse.json({ error: 'Too many sync requests. Please try again shortly.' }, { status: 429 });
  }

  let task = inflight.get(workspaceId);
  if (task && manual) {
    return NextResponse.json(
      {
        status: 'in_progress',
        error: 'A sync is already in progress.',
        integrations: await getWorkspaceSyncStatuses(supabase, workspaceId, integrationId),
      },
      { status: 409 }
    );
  }
  if (!task) {
    try {
      task = syncWorkspace(
        supabase,
        createAdminClient(),
        workspaceId,
        'manual',
        manual ? 0 : MANUAL_SYNC_MIN_INTERVAL_MS,
        integrationId
      );
    } catch (err) {
      console.error('sync: admin client unavailable:', err instanceof Error ? err.message : err);
      return NextResponse.json({ error: 'Sync is unavailable' }, { status: 500 });
    }
    inflight.set(workspaceId, task);
    task.finally(() => inflight.delete(workspaceId)).catch(() => {});
  }
  let outcomes: IntegrationSyncOutcome[];
  try {
    outcomes = await task;
  } catch (err) {
    console.error('sync failed:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      {
        status: 'failed',
        error: 'Sync failed — showing the last synced data',
        integrations: await getWorkspaceSyncStatuses(supabase, workspaceId, integrationId),
      },
      { status: 502 }
    );
  }
  const result = summarize(integrationId ? outcomes.filter((o) => o.integrationId === integrationId) : outcomes);
  const integrations = await getWorkspaceSyncStatuses(supabase, workspaceId, integrationId);
  const code = result.status === 'failed' ? 502 : result.status === 'in_progress' ? 409 : 200;
  return NextResponse.json({ ...result, integrations }, { status: code });
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error('sync cron: CRON_SECRET is not configured; refusing to run');
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 });
  }
  if (!isAuthorizedCronRequest(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Every connected integration, each synced into its own workspace.
  const admin = createAdminClient();
  const { data: integrations, error } = await admin
    .from('integrations')
    .select('id, workspace_id, provider')
    .in('provider', connectableProviders())
    .eq('enabled', true)
    .eq('has_credential', true);
  if (error) {
    console.error('sync cron: fetch integrations error:', error.message);
    return NextResponse.json({ error: 'Failed to load integrations' }, { status: 500 });
  }

  const startedAt = Date.now();
  const results: Record<string, number> = {};
  const replies: Record<string, number> = {};
  let campaignsUpserted = 0;
  let statsWritten = 0;
  for (const integration of integrations ?? []) {
    const outcome = await syncIntegrationById(
      admin,
      admin,
      {
        id: integration.id as string,
        workspace_id: integration.workspace_id as string,
        provider: integration.provider as string,
      },
      'cron'
    );
    results[outcome.status] = (results[outcome.status] ?? 0) + 1;
    if (outcome.status !== 'not_connected') {
      campaignsUpserted += outcome.campaignsUpserted;
      statsWritten += outcome.statsWritten;
      if (outcome.status === 'failed') {
        console.warn(`sync cron: integration ${integration.id} failed: ${outcome.error ?? 'unknown error'}`);
      }
    }
    // replies after the campaigns, so their campaigns exist; bounded by the run budget
    if (Date.now() - startedAt < REPLY_CRON_BUDGET_MS) {
      const ref = { id: integration.id as string, workspace_id: integration.workspace_id as string, provider: integration.provider as string };
      const r = await syncRepliesById(admin, admin, ref, 'cron').catch((err) => {
        console.warn(`sync cron: replies ${integration.id} failed:`, err instanceof Error ? err.message : err);
        return null;
      });
      if (r) replies[r.status] = (replies[r.status] ?? 0) + 1;
    } else replies.deferred = (replies.deferred ?? 0) + 1;
  }

  return NextResponse.json({ integrations: integrations?.length ?? 0, results, replies, campaignsUpserted, statsWritten });
}

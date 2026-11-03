import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionWorkspace } from '@/lib/data/workspace';
import { checkRateLimit } from '@/lib/rate-limit';
import { syncWorkspaceReplies } from '@/lib/sync/workspace-replies';

// A reply sync makes at most a few spaced provider requests per integration
// (the provider's message endpoint allows ~20 per minute).
export const maxDuration = 60;

/**
 * POST — the "Sync replies" button. Signed-in members only; writes through the
 * member's RLS client. Skipped within 2 minutes of the previous reply sync and
 * while one is running (database guard); never deletes stored conversations.
 */
export async function POST() {
  const session = await getSessionWorkspace();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await checkRateLimit(`reply-sync:${session.userId}`, 30, 3600))) {
    return NextResponse.json({ error: 'Too many reply syncs. Please try again later.' }, { status: 429 });
  }
  let outcomes;
  try {
    outcomes = await syncWorkspaceReplies(session.supabase, createAdminClient(), session.workspaceId, 'manual');
  } catch (err) {
    console.error('reply sync failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ status: 'failed', error: 'Reply sync failed — showing the replies already synced.' }, { status: 502 });
  }
  const failed = outcomes.find((o) => o.status === 'failed' || o.status === 'partial');
  const running = outcomes.some((o) => o.status === 'in_progress');
  const synced = outcomes.some((o) => o.status === 'success' || o.status === 'partial');
  const connected = outcomes.filter((o) => o.status !== 'not_connected' && o.status !== 'unsupported');
  const status = failed?.status ?? (synced ? 'success' : running ? 'in_progress' : connected.length ? 'skipped' : 'not_connected');
  return NextResponse.json(
    {
      status,
      messagesStored: outcomes.reduce((n, o) => n + ('messagesStored' in o ? o.messagesStored : 0), 0),
      backlog: outcomes.some((o) => 'backlog' in o && o.backlog),
      ...(failed?.error ? { error: failed.error } : {}),
      ...(running && !synced ? { error: 'A reply sync is already in progress.' } : {}),
      ...(status === 'not_connected' ? { error: 'Connect your sending platform to sync replies.' } : {}),
    },
    { status: status === 'failed' ? 502 : status === 'in_progress' ? 409 : status === 'not_connected' ? 409 : 200 }
  );
}

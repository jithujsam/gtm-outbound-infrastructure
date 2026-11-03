// Inbox reads (operator side). Server-side, through the signed-in member's
// RLS-scoped client: a workspace only ever reads its own conversations.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeadInterest } from '../providers/types.ts';
import type { ReplySyncInfo, ThreadSummary } from '../analytics/replies.ts';
import { STALE_RUN_MS } from '../sync/sync-status.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** Most conversations listed at once (newest activity first). */
export const MAX_THREADS = 500;

const THREAD_COLUMNS =
  'id, campaign_id, lead_name, lead_company, lead_email, interest, subject, human_replies, auto_replies, last_human_reply_at, last_reply_at, last_snippet, campaigns_v2(name)';

function toSummary(r: Record<string, unknown>): ThreadSummary {
  return {
    id: r.id as string,
    campaignId: r.campaign_id as string,
    campaignName: ((r.campaigns_v2 as { name?: string } | null)?.name as string | undefined) ?? 'Campaign',
    leadName: (r.lead_name as string | null) ?? null,
    leadCompany: (r.lead_company as string | null) ?? null,
    leadEmail: (r.lead_email as string | null) ?? null,
    interest: (r.interest as LeadInterest | null) ?? null,
    subject: (r.subject as string | null) ?? null,
    humanReplies: Number(r.human_replies ?? 0),
    autoReplies: Number(r.auto_replies ?? 0),
    lastHumanReplyAt: (r.last_human_reply_at as string | null) ?? null,
    lastReplyAt: (r.last_reply_at as string | null) ?? null,
    snippet: (r.last_snippet as string | null) ?? null,
  };
}

export interface InboxData {
  threads: ThreadSummary[];
  sync: ReplySyncInfo;
  /** Clients that have campaigns (for the client filter). */
  clients: { id: string; name: string }[];
}

/** The workspace's conversations (optionally one client's) and the reply sync state. */
export async function loadInbox(db: SupabaseClient, workspaceId: string, clientId: string | null): Promise<InboxData> {
  const [{ data: clients }, sync] = await Promise.all([
    db.from('clients').select('id, name, campaign_client_map!inner(campaign_id)').eq('workspace_id', workspaceId).order('name'),
    loadReplySync(db, workspaceId),
  ]);
  const clientList = (clients ?? []).map((c) => ({ id: c.id as string, name: c.name as string }));

  let query = db.from('reply_threads').select(THREAD_COLUMNS).eq('workspace_id', workspaceId);
  if (clientId) {
    // only a client of this workspace; its campaigns decide the conversations
    if (!clientList.some((c) => c.id === clientId)) return { threads: [], sync, clients: clientList };
    const { data: links } = await db.from('campaign_client_map').select('campaign_id').eq('client_id', clientId);
    const ids = (links ?? []).map((l) => l.campaign_id as string);
    if (ids.length === 0) return { threads: [], sync, clients: clientList };
    query = query.in('campaign_id', ids);
  }
  const { data, error } = await query.order('last_reply_at', { ascending: false, nullsFirst: false }).limit(MAX_THREADS);
  if (error) console.warn('loadInbox error:', error.message);
  return { threads: ((data ?? []) as Record<string, unknown>[]).map(toSummary), sync, clients: clientList };
}

export interface ThreadMessage {
  id: string;
  sentAt: string;
  fromName: string | null;
  fromEmail: string | null;
  subject: string | null;
  body: string | null;
  isAutoReply: boolean;
}

export interface ThreadDetail {
  thread: ThreadSummary;
  messages: ThreadMessage[];
}

/** One conversation with its messages, oldest first (RLS: own workspace only). */
export async function loadThread(db: SupabaseClient, workspaceId: string, threadId: string): Promise<ThreadDetail | null> {
  if (!isUuid(threadId)) return null;
  const { data: t } = await db.from('reply_threads').select(THREAD_COLUMNS).eq('id', threadId).eq('workspace_id', workspaceId).maybeSingle();
  if (!t) return null;
  const { data: msgs } = await db
    .from('reply_messages')
    .select('id, sent_at, from_name, from_email, subject, body, is_auto_reply')
    .eq('thread_id', threadId)
    .order('sent_at')
    .limit(200);
  return {
    thread: toSummary(t as Record<string, unknown>),
    messages: (msgs ?? []).map((m) => ({
      id: m.id as string,
      sentAt: m.sent_at as string,
      fromName: (m.from_name as string | null) ?? null,
      fromEmail: (m.from_email as string | null) ?? null,
      subject: (m.subject as string | null) ?? null,
      body: (m.body as string | null) ?? null,
      isAutoReply: !!m.is_auto_reply,
    })),
  };
}

/** The reply sync state of the workspace, from its reply sync runs. */
export async function loadReplySync(db: SupabaseClient, workspaceId: string, now: Date = new Date()): Promise<ReplySyncInfo> {
  const [{ data: recent }, { data: success }] = await Promise.all([
    db
      .from('reply_sync_runs')
      .select('status, started_at, finished_at, error_message, details')
      .eq('workspace_id', workspaceId)
      .order('started_at', { ascending: false })
      .limit(10),
    db
      .from('reply_sync_runs')
      .select('finished_at, started_at')
      .eq('workspace_id', workspaceId)
      .eq('status', 'success')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return deriveReplySync((recent ?? []) as RunRow[], success as RunRow | null, now);
}

interface RunRow {
  status: string;
  started_at: string;
  finished_at: string | null;
  error_message?: string | null;
  details?: Record<string, unknown> | null;
}

/** Pure: newest-first runs → what the Inbox says about freshness. */
export function deriveReplySync(recent: RunRow[], lastSuccess: RunRow | null, now: Date = new Date()): ReplySyncInfo {
  const live = (r: RunRow) => r.status === 'running' && now.getTime() - Date.parse(r.started_at) < STALE_RUN_MS;
  const finished = recent.find((r) => r.status !== 'running') ?? null;
  const success = lastSuccess ?? recent.find((r) => r.status === 'success') ?? null;
  return {
    everSynced: recent.length > 0 || !!lastSuccess,
    syncing: recent.some(live),
    lastSuccessAt: success ? (success.finished_at ?? success.started_at) : null,
    lastFailed: !!finished && finished.status !== 'success',
    lastError: finished && finished.status !== 'success' ? (finished.error_message ?? null) : null,
    backlog: !!finished?.details?.backlog,
  };
}

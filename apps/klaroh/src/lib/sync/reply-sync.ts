// Reply sync: provider adapter → reply_threads / reply_messages.
//
// Provider-neutral (any ProviderAdapter with fetchReplyPage) and separate from
// the campaign sync, because messages have their own, much tighter provider
// rate limit. Controlled on purpose:
//
//   * incremental   only messages created since the last completed window
//                   (first sync: REPLY_HISTORY_DAYS back), oldest first
//   * bounded       at most MAX_PAGES_PER_RUN provider requests per run; the
//                   provider cursor is saved after every page, so a run that
//                   stops (budget, rate limit, failure) continues there next time
//   * one at a time per integration (database unique index), and a manual run
//                   is skipped within REPLY_SYNC_MIN_INTERVAL_MS of the last one
//   * scoped        only messages of campaigns a client uses are stored
//   * idempotent    provider message / thread ids de-duplicate; a re-sync stores
//                   nothing twice
//   * never destructive: a failed sync keeps every stored conversation
//
// Lead details (name, company, CURRENT interest status) are refreshed for the
// threads touched by the run and for recently active ones, in batches.

import { classifyProviderError, type LeadProfile, type ProviderAdapter, type ProviderErrorKind, type ReceivedMessage } from '../providers/types.ts';
import { STALE_RUN_MS } from './sync-status.ts';

export const REPLY_HISTORY_DAYS = 90;
export const MAX_PAGES_PER_RUN = 6;
export const REPLY_SYNC_MIN_INTERVAL_MS = 2 * 60_000;
/** A new window re-reads this much before the previous one ended (late-indexed messages). */
export const WINDOW_OVERLAP_MS = 10 * 60_000;
/** Lead details are refreshed at most this often per thread. */
export const LEAD_REFRESH_MS = 6 * 60 * 60_000;
/** Threads whose lead details are refreshed per run (in provider batches of 100). */
export const MAX_LEAD_REFRESH = 300;
/**
 * Days of received messages re-read after the incremental window to refresh
 * conversation statuses. Verified on a real account: Instantly's email rows
 * mostly carry no lead id (so the lead lookup cannot run), while their
 * interest status follows the lead's current status — a re-read is the only
 * way a lead marked positive later becomes positive here.
 */
export const STATUS_REFRESH_DAYS = 30;

export type ReplySyncTrigger = 'manual' | 'cron';
export type ReplyRunStatus = 'success' | 'partial' | 'failed';

export interface ReplyContext {
  workspaceId: string;
  integrationId: string;
}

export interface ReplySyncState {
  windowStart: string | null;
  cursor: string | null;
  windowOpenedAt: string | null;
  syncedThrough: string | null;
}

export interface ThreadInsert {
  campaignId: string;
  providerThreadId: string;
  leadExternalId: string | null;
  leadEmail: string | null;
  leadName: string | null;
  interest: ReceivedMessage['interest'];
  subject: string | null;
}

export interface MessageInsert {
  threadId: string;
  integrationId: string;
  providerMessageId: string;
  isAutoReply: boolean;
  sentAt: string;
  fromEmail: string | null;
  fromName: string | null;
  toEmail: string | null;
  subject: string | null;
  body: string | null;
  step: number | null;
  syncedAt: string;
}

export interface LeadUpdate {
  threadId: string;
  lead: LeadProfile;
  checkedAt: string;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ReplyRunFinish {
  status: ReplyRunStatus;
  messagesSeen: number;
  messagesStored: number;
  threadsUpdated: number;
  errorMessage: string | null;
  details: Record<string, unknown>;
}

/** Klaroh-side persistence the reply sync needs (Supabase in production, a fake in tests). */
export interface ReplyStore {
  /** Client-linked campaigns of the integration: provider campaign id → Klaroh campaign id. */
  scopedCampaigns(integrationId: string): Promise<Result<Map<string, string>>>;
  /** Start time of the newest run (any status), for the manual interval. */
  lastRunStartedAt(integrationId: string): Promise<string | null>;
  /** Marks runs still `running` that started before `before` as failed (they never finished). */
  closeStaleRuns(integrationId: string, before: string, at: string): Promise<void>;
  /** null = another run of this integration is running. */
  startRun(ctx: ReplyContext, trigger: ReplySyncTrigger, startedAt: string): Promise<{ id: string } | null>;
  finishRun(runId: string, finish: ReplyRunFinish, finishedAt: string): Promise<void>;
  getState(integrationId: string): Promise<ReplySyncState | null>;
  saveState(ctx: ReplyContext, state: ReplySyncState): Promise<Result<null>>;
  /** Existing threads by provider thread id. */
  findThreads(integrationId: string, providerThreadIds: string[]): Promise<Result<Map<string, string>>>;
  /** New threads only; returns provider thread id → Klaroh thread id. */
  insertThreads(rows: ThreadInsert[]): Promise<Result<Map<string, string>>>;
  /** Inserts messages not stored yet (provider message id); returns how many were new. */
  insertMessages(rows: MessageInsert[]): Promise<Result<number>>;
  /** Threads whose lead details should be refreshed (touched ones first). */
  threadsForLeadRefresh(integrationId: string, touched: string[], staleBefore: string, activeSince: string, limit: number): Promise<{ threadId: string; leadExternalId: string }[]>;
  updateLeads(updates: LeadUpdate[]): Promise<Result<number>>;
  /** Interest status carried on the newest messages (used when lead details are unavailable). */
  setInterest(updates: { threadId: string; interest: NonNullable<ReceivedMessage['interest']> }[]): Promise<Result<number>>;
}

export interface ReplySyncOutcome {
  status: ReplyRunStatus | 'skipped' | 'in_progress' | 'unsupported';
  runId: string | null;
  messagesSeen: number;
  messagesStored: number;
  threadsUpdated: number;
  pages: number;
  /** More messages remain in the current window (continues on the next sync). */
  backlog: boolean;
  error?: string;
  errorKind?: ProviderErrorKind;
}

export interface ReplySyncParams {
  store: ReplyStore;
  adapter: ProviderAdapter;
  ctx: ReplyContext;
  apiKey: string;
  trigger: ReplySyncTrigger;
  /** Skip a manual sync started within this long of the previous run. */
  minIntervalMs?: number;
  maxPages?: number;
  /** Re-read this many days of messages (within the page budget) to refresh statuses; 0 = off. */
  refreshDays?: number;
  now?: () => Date;
}

export async function syncReplies(p: ReplySyncParams): Promise<ReplySyncOutcome> {
  const { store, adapter, ctx, apiKey } = p;
  const now = p.now ?? (() => new Date());
  const maxPages = p.maxPages ?? MAX_PAGES_PER_RUN;
  const base = { runId: null, messagesSeen: 0, messagesStored: 0, threadsUpdated: 0, pages: 0, backlog: false };
  if (!adapter.fetchReplyPage) return { status: 'unsupported', ...base };

  const scope = await store.scopedCampaigns(ctx.integrationId);
  if (!scope.ok) return { status: 'failed', ...base, error: 'Could not read the campaigns to sync' };
  // No client uses a campaign of this integration: no provider call, no run.
  if (scope.data.size === 0) return { status: 'skipped', ...base };

  if (p.minIntervalMs && p.minIntervalMs > 0) {
    const last = await store.lastRunStartedAt(ctx.integrationId);
    if (last && now().getTime() - Date.parse(last) < p.minIntervalMs) return { status: 'skipped', ...base };
  }

  await store.closeStaleRuns(ctx.integrationId, new Date(now().getTime() - STALE_RUN_MS).toISOString(), now().toISOString());
  const run = await store.startRun(ctx, p.trigger, now().toISOString());
  if (!run) return { status: 'in_progress', ...base };

  const out: ReplySyncOutcome = { status: 'success', ...base, runId: run.id };
  const details: Record<string, unknown> = {};
  const finish = async (): Promise<ReplySyncOutcome> => {
    details.pages = out.pages;
    details.backlog = out.backlog;
    if (out.errorKind) details.errorKind = out.errorKind;
    await store.finishRun(
      run.id,
      {
        status: out.status as ReplyRunStatus,
        messagesSeen: out.messagesSeen,
        messagesStored: out.messagesStored,
        threadsUpdated: out.threadsUpdated,
        errorMessage: out.error ?? null,
        details,
      },
      now().toISOString()
    );
    return out;
  };

  // ── the window being fetched ──
  const saved = (await store.getState(ctx.integrationId)) ?? { windowStart: null, cursor: null, windowOpenedAt: null, syncedThrough: null };
  let state: ReplySyncState;
  if (saved.windowStart && saved.windowOpenedAt) {
    state = saved; // continue the unfinished window from its cursor
  } else {
    const from = saved.syncedThrough
      ? new Date(Date.parse(saved.syncedThrough) - WINDOW_OVERLAP_MS)
      : new Date(now().getTime() - REPLY_HISTORY_DAYS * 86_400_000);
    state = { windowStart: from.toISOString(), cursor: null, windowOpenedAt: now().toISOString(), syncedThrough: saved.syncedThrough };
  }

  const touched = new Set<string>();
  const hints = new Map<string, { at: string; interest: NonNullable<ReceivedMessage['interest']> }>();
  const seenCursors = new Set<string>();
  let complete = false;
  for (; out.pages < maxPages; ) {
    const page = await adapter.fetchReplyPage(apiKey, { since: state.windowStart!, cursor: state.cursor });
    out.pages++;
    if (!page.ok) {
      const kind = classifyProviderError(page.error);
      out.errorKind = kind;
      out.error = adapter.userSafeError(page.error, `${adapter.label} replies unavailable`);
      // Rate limited after progress: what was fetched is kept, the rest continues next time.
      out.status = kind === 'rate_limited' && out.pages > 1 ? 'partial' : 'failed';
      break;
    }
    const stored = await storePage(store, ctx, scope.data, page.data.messages, now().toISOString());
    if (!stored.ok) {
      out.status = 'failed';
      out.error = 'Could not save replies';
      console.error(`reply sync ${ctx.integrationId}: write failed:`, stored.error);
      break;
    }
    out.messagesSeen += page.data.messages.length;
    out.messagesStored += stored.data.stored;
    for (const id of stored.data.threads) touched.add(id);
    for (const [id, h] of stored.data.hints) if (!hints.has(id) || hints.get(id)!.at < h.at) hints.set(id, h);

    const next = page.data.nextCursor;
    // end of the window, an empty page, or a provider repeating a cursor (loop guard)
    if (!next || page.data.rows === 0 || seenCursors.has(next) || next === state.cursor) {
      complete = true;
      break;
    }
    seenCursors.add(next);
    state = { ...state, cursor: next };
    const kept = await store.saveState(ctx, state);
    if (!kept.ok) console.warn(`reply sync ${ctx.integrationId}: state save failed:`, kept.error);
  }

  if (complete) {
    state = { windowStart: null, cursor: null, windowOpenedAt: null, syncedThrough: state.windowOpenedAt };
    const kept = await store.saveState(ctx, state);
    if (!kept.ok) console.warn(`reply sync ${ctx.integrationId}: state save failed:`, kept.error);
  } else if (out.status !== 'failed' || out.pages > 1) {
    out.backlog = true;
  }

  // ── status refresh: re-read recent messages with the pages left (never fails the run) ──
  if (complete && out.status === 'success' && p.refreshDays && p.refreshDays > 0 && out.pages < maxPages) {
    const since = new Date(now().getTime() - p.refreshDays * 86_400_000).toISOString();
    let cursor: string | null = null;
    const refreshCursors = new Set<string>();
    details.statusRefresh = 'partial';
    while (out.pages < maxPages) {
      const page = await adapter.fetchReplyPage(apiKey, { since, cursor });
      out.pages++;
      if (!page.ok) {
        details.statusRefresh = classifyProviderError(page.error) === 'rate_limited' ? 'rate_limited' : 'failed';
        break;
      }
      const stored = await storePage(store, ctx, scope.data, page.data.messages, now().toISOString());
      if (!stored.ok) {
        details.statusRefresh = 'failed';
        break;
      }
      out.messagesStored += stored.data.stored;
      for (const id of stored.data.threads) touched.add(id);
      for (const [id, h] of stored.data.hints) if (!hints.has(id) || hints.get(id)!.at < h.at) hints.set(id, h);
      const next = page.data.nextCursor;
      if (!next || page.data.rows === 0 || refreshCursors.has(next) || next === cursor) {
        details.statusRefresh = 'ok';
        break;
      }
      refreshCursors.add(next);
      cursor = next;
    }
  }
  out.threadsUpdated = touched.size;

  // ── lead details: name, company and the CURRENT interest status ──
  const refreshed = new Set<string>();
  if (adapter.fetchLeads && out.status !== 'failed') {
    const t = now().getTime();
    const due = await store.threadsForLeadRefresh(
      ctx.integrationId,
      [...touched],
      new Date(t - LEAD_REFRESH_MS).toISOString(),
      new Date(t - REPLY_HISTORY_DAYS * 86_400_000).toISOString(),
      MAX_LEAD_REFRESH
    );
    if (due.length) {
      const leads = await adapter.fetchLeads(apiKey, due.map((d) => d.leadExternalId));
      if (leads.ok) {
        const byId = new Map(leads.data.map((l) => [l.externalId, l]));
        const checkedAt = now().toISOString();
        const updates = due.filter((d) => byId.has(d.leadExternalId)).map((d) => ({ threadId: d.threadId, lead: byId.get(d.leadExternalId)!, checkedAt }));
        const w = updates.length ? await store.updateLeads(updates) : ({ ok: true, data: 0 } as const);
        details.leads = w.ok ? 'ok' : 'failed';
        if (w.ok) for (const u of updates) refreshed.add(u.threadId);
      } else {
        // not fatal: conversations stay, with the status carried on their messages
        details.leads = 'failed';
        console.warn(`reply sync ${ctx.integrationId}: leads failed:`, leads.error.status, leads.error.message);
      }
    }
  }
  // threads without current lead details: the status on their newest message is the best known
  const fallback = [...hints].filter(([threadId]) => !refreshed.has(threadId));
  if (fallback.length) await store.setInterest(fallback.map(([threadId, h]) => ({ threadId, interest: h.interest })));

  return finish();
}

/** Stores one page: new threads, then the messages not stored yet. Out-of-scope messages are dropped. */
async function storePage(
  store: ReplyStore,
  ctx: ReplyContext,
  scope: Map<string, string>,
  messages: ReceivedMessage[],
  syncedAt: string
): Promise<Result<{ stored: number; threads: string[]; hints: Map<string, { at: string; interest: NonNullable<ReceivedMessage['interest']> }> }>> {
  const inScope = messages.filter((m) => m.campaignExternalId && scope.has(m.campaignExternalId));
  if (inScope.length === 0) return { ok: true, data: { stored: 0, threads: [], hints: new Map() } };

  const byThread = new Map<string, ReceivedMessage[]>();
  for (const m of inScope) byThread.set(m.threadId, [...(byThread.get(m.threadId) ?? []), m]);
  const existing = await store.findThreads(ctx.integrationId, [...byThread.keys()]);
  if (!existing.ok) return existing;

  const fresh: ThreadInsert[] = [];
  for (const [threadId, list] of byThread) {
    if (existing.data.has(threadId)) continue;
    const first = [...list].sort((a, b) => a.sentAt.localeCompare(b.sentAt))[0];
    const latest = [...list].sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
    fresh.push({
      campaignId: scope.get(first.campaignExternalId!)!,
      providerThreadId: threadId,
      leadExternalId: first.leadExternalId,
      leadEmail: first.leadEmail,
      leadName: first.fromName,
      interest: latest.interest,
      subject: first.subject,
    });
  }
  const created = fresh.length ? await store.insertThreads(fresh) : ({ ok: true, data: new Map<string, string>() } as const);
  if (!created.ok) return created;
  const ids = new Map([...existing.data, ...created.data]);

  const rows: MessageInsert[] = inScope
    .filter((m) => ids.has(m.threadId))
    .map((m) => ({
      threadId: ids.get(m.threadId)!,
      integrationId: ctx.integrationId,
      providerMessageId: m.externalId,
      isAutoReply: m.isAutoReply,
      sentAt: m.sentAt,
      fromEmail: m.fromEmail,
      fromName: m.fromName,
      toEmail: m.toEmail,
      subject: m.subject,
      body: m.body,
      step: m.step,
      syncedAt,
    }));
  // a provider repeating a message within one page must not write it twice
  const unique = [...new Map(rows.map((r) => [r.providerMessageId, r])).values()];
  const inserted = await store.insertMessages(unique);
  if (!inserted.ok) return inserted;
  const hints = new Map<string, { at: string; interest: NonNullable<ReceivedMessage['interest']> }>();
  for (const m of inScope) {
    const id = ids.get(m.threadId);
    if (!id || !m.interest || m.isAutoReply) continue;
    if (!hints.has(id) || hints.get(id)!.at < m.sentAt) hints.set(id, { at: m.sentAt, interest: m.interest });
  }
  return { ok: true, data: { stored: inserted.data, threads: [...new Set(unique.map((r) => r.threadId))], hints } };
}

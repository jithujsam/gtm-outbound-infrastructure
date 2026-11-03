// Supabase implementation of the reply sync's store. Writes through the given
// client: the signed-in member's (RLS-scoped to their workspace) or the
// service role for cron. Every row's workspace is re-derived by the database
// from its campaign / thread / integration; nothing is ever deleted here.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MessageInsert, ReplyStore, ThreadInsert } from './reply-sync.ts';

const CHUNK = 200;
const chunks = <T,>(items: T[], size = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export function createSupabaseReplyStore(db: SupabaseClient): ReplyStore {
  return {
    async scopedCampaigns(integrationId) {
      const { data, error } = await db
        .from('campaigns_v2')
        .select('id, external_id, campaign_client_map!inner(client_id)')
        .eq('integration_id', integrationId)
        .is('archived_at', null);
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: new Map((data ?? []).map((r) => [r.external_id as string, r.id as string])) };
    },

    async lastRunStartedAt(integrationId) {
      const { data } = await db
        .from('reply_sync_runs')
        .select('started_at')
        .eq('integration_id', integrationId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data?.started_at as string | undefined) ?? null;
    },

    async closeStaleRuns(integrationId, before, at) {
      const { error } = await db
        .from('reply_sync_runs')
        .update({ status: 'failed', finished_at: at, error_message: 'The sync did not finish.' })
        .eq('integration_id', integrationId)
        .eq('status', 'running')
        .lt('started_at', before);
      if (error) console.warn('reply sync: closing stale runs failed:', error.message);
    },

    async startRun(ctx, trigger, startedAt) {
      const { data, error } = await db
        .from('reply_sync_runs')
        .insert({ workspace_id: ctx.workspaceId, integration_id: ctx.integrationId, triggered_by: trigger, status: 'running', started_at: startedAt })
        .select('id')
        .single();
      if (error) {
        // 23505: the one-running-run-per-integration index — another sync is running
        if (error.code !== '23505') console.error('reply sync: start failed:', error.message);
        return null;
      }
      return { id: data.id as string };
    },

    async finishRun(runId, f, finishedAt) {
      const { error } = await db
        .from('reply_sync_runs')
        .update({
          status: f.status,
          finished_at: finishedAt,
          messages_seen: f.messagesSeen,
          messages_stored: f.messagesStored,
          threads_updated: f.threadsUpdated,
          error_message: f.errorMessage,
          details: f.details,
        })
        .eq('id', runId);
      if (error) console.error('reply sync: finish failed:', error.message);
    },

    async getState(integrationId) {
      const { data } = await db
        .from('reply_sync_state')
        .select('window_start, cursor, window_opened_at, synced_through')
        .eq('integration_id', integrationId)
        .maybeSingle();
      if (!data) return null;
      return {
        windowStart: (data.window_start as string | null) ?? null,
        cursor: (data.cursor as string | null) ?? null,
        windowOpenedAt: (data.window_opened_at as string | null) ?? null,
        syncedThrough: (data.synced_through as string | null) ?? null,
      };
    },

    async saveState(ctx, s) {
      const { error } = await db.from('reply_sync_state').upsert(
        {
          integration_id: ctx.integrationId,
          workspace_id: ctx.workspaceId,
          window_start: s.windowStart,
          cursor: s.cursor,
          window_opened_at: s.windowOpenedAt,
          synced_through: s.syncedThrough,
        },
        { onConflict: 'integration_id' }
      );
      return error ? { ok: false, error: error.message } : { ok: true, data: null };
    },

    async findThreads(integrationId, providerThreadIds) {
      const out = new Map<string, string>();
      for (const batch of chunks(providerThreadIds)) {
        const { data, error } = await db
          .from('reply_threads')
          .select('id, provider_thread_id')
          .eq('integration_id', integrationId)
          .in('provider_thread_id', batch);
        if (error) return { ok: false, error: error.message };
        for (const r of data ?? []) out.set(r.provider_thread_id as string, r.id as string);
      }
      return { ok: true, data: out };
    },

    async insertThreads(rows: ThreadInsert[]) {
      const out = new Map<string, string>();
      for (const batch of chunks(rows)) {
        const { data, error } = await db
          .from('reply_threads')
          .upsert(
            batch.map((t) => ({
              campaign_id: t.campaignId,
              provider_thread_id: t.providerThreadId,
              lead_external_id: t.leadExternalId,
              lead_email: t.leadEmail,
              lead_name: t.leadName,
              interest: t.interest,
              subject: t.subject,
              // the guard derives these from the campaign; sent for the conflict target
              integration_id: null,
              workspace_id: null,
            })),
            { onConflict: 'integration_id,provider_thread_id', ignoreDuplicates: true }
          )
          .select('id, provider_thread_id');
        if (error) return { ok: false, error: error.message };
        for (const r of data ?? []) out.set(r.provider_thread_id as string, r.id as string);
      }
      // a thread created concurrently (ignored duplicate) is looked up
      const missing = rows.map((r) => r.providerThreadId).filter((id) => !out.has(id));
      if (missing.length) {
        const integrationId = await integrationOf(db, rows[0].campaignId);
        if (integrationId) {
          const found = await this.findThreads(integrationId, missing);
          if (found.ok) for (const [k, v] of found.data) out.set(k, v);
        }
      }
      return { ok: true, data: out };
    },

    async insertMessages(rows: MessageInsert[]) {
      let stored = 0;
      for (const batch of chunks(rows)) {
        const { data, error } = await db
          .from('reply_messages')
          .upsert(
            batch.map((m) => ({
              thread_id: m.threadId,
              integration_id: m.integrationId,
              provider_message_id: m.providerMessageId,
              direction: 'received',
              is_auto_reply: m.isAutoReply,
              sent_at: m.sentAt,
              from_email: m.fromEmail,
              from_name: m.fromName,
              to_email: m.toEmail,
              subject: m.subject,
              body: m.body,
              step: m.step,
              synced_at: m.syncedAt,
              workspace_id: null,
            })),
            { onConflict: 'integration_id,provider_message_id', ignoreDuplicates: true }
          )
          .select('id');
        if (error) return { ok: false, error: error.message };
        stored += data?.length ?? 0;
      }
      return { ok: true, data: stored };
    },

    async threadsForLeadRefresh(integrationId, touched, staleBefore, activeSince, limit) {
      const out = new Map<string, string>();
      for (const batch of chunks(touched)) {
        const { data } = await db
          .from('reply_threads')
          .select('id, lead_external_id')
          .in('id', batch)
          .not('lead_external_id', 'is', null);
        for (const r of data ?? []) if (out.size < limit) out.set(r.id as string, r.lead_external_id as string);
      }
      if (out.size < limit) {
        const { data } = await db
          .from('reply_threads')
          .select('id, lead_external_id')
          .eq('integration_id', integrationId)
          .not('lead_external_id', 'is', null)
          .gte('last_reply_at', activeSince)
          .or(`interest_checked_at.is.null,interest_checked_at.lt.${staleBefore}`)
          .order('last_reply_at', { ascending: false })
          .limit(limit);
        for (const r of data ?? []) if (out.size < limit && !out.has(r.id as string)) out.set(r.id as string, r.lead_external_id as string);
      }
      return [...out].map(([threadId, leadExternalId]) => ({ threadId, leadExternalId }));
    },

    async updateLeads(updates) {
      let n = 0;
      for (const u of updates) {
        const { error } = await db
          .from('reply_threads')
          .update({
            interest: u.lead.interest,
            interest_checked_at: u.checkedAt,
            ...(u.lead.name ? { lead_name: u.lead.name } : {}),
            ...(u.lead.company ? { lead_company: u.lead.company } : {}),
            ...(u.lead.email ? { lead_email: u.lead.email } : {}),
          })
          .eq('id', u.threadId);
        if (error) return { ok: false, error: error.message };
        n++;
      }
      return { ok: true, data: n };
    },

    async setInterest(updates) {
      let n = 0;
      for (const u of updates) {
        const { error } = await db.from('reply_threads').update({ interest: u.interest }).eq('id', u.threadId);
        if (error) return { ok: false, error: error.message };
        n++;
      }
      return { ok: true, data: n };
    },
  };
}

async function integrationOf(db: SupabaseClient, campaignId: string): Promise<string | null> {
  const { data } = await db.from('campaigns_v2').select('integration_id').eq('id', campaignId).maybeSingle();
  return (data?.integration_id as string | undefined) ?? null;
}

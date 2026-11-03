// Klaroh database writer for synced campaign data. Knows Klaroh's tables
// (campaigns_v2, campaign_stats, sync_runs) and the provider-neutral types —
// never a provider's field names. Server-only.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AccountDay,
  CampaignStatSnapshot,
  DomainCheck,
  NormalizedAccount,
  NormalizedCampaign,
  ProviderErrorKind,
  StepStat,
  WarmupDay,
} from '../providers/types.ts';

export type SyncTrigger = 'manual' | 'cron' | 'attach' | 'backfill';
export type SyncRunStatus = 'success' | 'partial' | 'failed';

export interface SyncContext {
  workspaceId: string;
  integrationId: string;
  provider: string;
}

export interface CampaignRow {
  workspace_id: string;
  integration_id: string;
  provider: string;
  external_id: string;
  name: string;
  status: string;
  provider_status: string | null;
  is_evergreen: boolean | null;
  sender_count: number | null;
  daily_limit: number | null;
  start_date: string | null;
  end_date: string | null;
  external_created_at: string | null;
  external_updated_at: string | null;
  provider_raw: Record<string, unknown> | null;
  sender_emails: string[] | null;
  last_synced_at: string;
  /** Returned by the provider in this sync, so available again. */
  unavailable_since: null;
}

export interface StatRow {
  campaign_id: string;
  workspace_id: string;
  sync_run_id: string | null;
  stat_date: string;
  captured_at: string;
  leads: number | null;
  contacted: number | null;
  new_leads_contacted: number | null;
  emails_sent: number | null;
  opens: number | null;
  opens_unique: number | null;
  replies: number | null;
  replies_unique: number | null;
  clicks: number | null;
  clicks_unique: number | null;
  bounces: number | null;
  unsubscribes: number | null;
  completed: number | null;
  opportunities: number | null;
  opportunity_value: number | null;
  interested: number | null;
  meetings_booked: number | null;
  meetings_completed: number | null;
  closed: number | null;
  provider_raw: Record<string, unknown> | null;
}

export interface StepStatRow {
  campaign_id: string;
  sync_run_id: string | null;
  stat_date: string;
  captured_at: string;
  step: number;
  variant: string;
  sent: number | null;
  opens: number | null;
  opens_unique: number | null;
  replies: number | null;
  replies_unique: number | null;
  clicks: number | null;
  clicks_unique: number | null;
  opportunities: number | null;
}

export interface AccountRow {
  workspace_id: string;
  integration_id: string;
  provider: string;
  email: string;
  status: string;
  provider_status: string | null;
  warmup_status: string;
  provider_warmup_status: string | null;
  warmup_score: number | null;
  daily_limit: number | null;
  sending_gap_minutes: number | null;
  tracking_domain: string | null;
  tracking_domain_status: string | null;
  last_used_at: string | null;
  external_created_at: string | null;
  provider_raw: Record<string, unknown> | null;
  last_synced_at: string;
  unavailable_since: null;
}

/** Campaign sending of one mailbox on one day. */
export interface AccountSendingRow {
  account_id: string;
  stat_date: string;
  captured_at: string;
  sent: number | null;
  bounced: number | null;
  replies: number | null;
}

/** Warmup activity of one mailbox on one day (written separately from sending). */
export interface AccountWarmupRow {
  account_id: string;
  stat_date: string;
  captured_at: string;
  warmup_sent: number | null;
  warmup_landed_inbox: number | null;
  warmup_landed_spam: number | null;
  warmup_received: number | null;
}

export interface DomainRow {
  workspace_id: string;
  integration_id: string;
  domain: string;
  spf: boolean | null;
  dkim: boolean | null;
  dmarc: boolean | null;
  mx: boolean | null;
  checked_at: string;
}

/** What one part of a sync did; failures carry a user-safe message. */
export type PartOutcome = 'ok' | 'failed' | 'unsupported' | 'skipped';

export interface SyncDetails {
  outcomes: PartOutcome;
  /** 'done' when the infrastructure/step parts ran in this sync. */
  extras: 'done' | 'skipped';
  steps?: PartOutcome;
  accounts?: PartOutcome;
  accountDaily?: PartOutcome;
  warmup?: PartOutcome;
  domains?: PartOutcome;
  /** part → user-safe reason */
  errors?: Record<string, string>;
}

export interface SyncRunFinish {
  status: SyncRunStatus;
  campaignsSeen: number;
  campaignsUpserted: number;
  statsWritten: number;
  errorMessage: string | null;
  details?: SyncDetails;
  /** Why a failed/partial run failed (auth, rate_limited, …); stored in details.errorKind. */
  errorKind?: ProviderErrorKind;
}

export type StoreResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** The persistence operations sync needs (an interface so sync is testable). */
export interface CampaignStore {
  lastSuccessfulSyncAt(integrationId: string): Promise<string | null>;
  /**
   * Start of the newest run of this integration that is still `running` and
   * started after `startedAfter` (older running rows never finished), or null.
   */
  activeRunStartedAt(integrationId: string, startedAfter: string): Promise<string | null>;
  /**
   * The sync scope: external ids of this integration's campaigns that are
   * linked to at least one client. Nothing else is ever stored or synced.
   */
  scopedExternalIds(integrationId: string): Promise<StoreResult<string[]>>;
  /** Flags in-scope campaigns the provider no longer returns (history kept). */
  markUnavailable(integrationId: string, externalIds: string[], at: string): Promise<void>;
  startRun(ctx: SyncContext, trigger: SyncTrigger, startedAt: string): Promise<string | null>;
  /** Upserts by (integration_id, external_id); returns external_id → campaign id. */
  upsertCampaigns(rows: CampaignRow[]): Promise<StoreResult<Map<string, string>>>;
  /** Upserts by (campaign_id, stat_date): one snapshot per campaign per day. */
  upsertStats(rows: StatRow[]): Promise<StoreResult<number>>;
  finishRun(runId: string, finish: SyncRunFinish, finishedAt: string): Promise<void>;

  // ── analytics + infrastructure (optional parts of a sync) ─────────────────
  /** Start of the last sync whose infrastructure/step parts ran. */
  lastExtrasSyncAt(integrationId: string): Promise<string | null>;
  upsertStepStats(rows: StepStatRow[]): Promise<StoreResult<number>>;
  /** Upserts by (integration_id, email); returns email → account id. */
  upsertAccounts(rows: AccountRow[]): Promise<StoreResult<Map<string, string>>>;
  /** Flags this integration's stored mailboxes that are no longer in scope / returned. */
  markAccountsUnavailable(integrationId: string, keepEmails: string[], at: string): Promise<void>;
  upsertAccountSending(rows: AccountSendingRow[]): Promise<StoreResult<number>>;
  upsertAccountWarmup(rows: AccountWarmupRow[]): Promise<StoreResult<number>>;
  upsertDomains(rows: DomainRow[]): Promise<StoreResult<number>>;
}

// ── pure row builders ─────────────────────────────────────────────────────────

export function toCampaignRow(ctx: SyncContext, c: NormalizedCampaign, syncedAt: string): CampaignRow {
  return {
    workspace_id: ctx.workspaceId,
    integration_id: ctx.integrationId,
    provider: ctx.provider,
    external_id: c.externalId,
    name: c.name,
    status: c.status,
    provider_status: c.providerStatus,
    is_evergreen: c.isEvergreen,
    sender_count: c.senderCount,
    daily_limit: c.dailyLimit,
    start_date: c.startDate,
    end_date: c.endDate,
    external_created_at: c.externalCreatedAt,
    external_updated_at: c.externalUpdatedAt,
    provider_raw: c.providerRaw,
    sender_emails: c.senderEmails,
    last_synced_at: syncedAt,
    unavailable_since: null,
  };
}

/** Snapshot day is the UTC date of the capture. */
export function toStatRow(
  ctx: SyncContext,
  campaignId: string,
  s: CampaignStatSnapshot,
  syncRunId: string | null,
  capturedAt: string
): StatRow {
  const m = s.metrics;
  return {
    campaign_id: campaignId,
    workspace_id: ctx.workspaceId,
    sync_run_id: syncRunId,
    stat_date: capturedAt.slice(0, 10),
    captured_at: capturedAt,
    leads: m.leads,
    contacted: m.contacted,
    new_leads_contacted: m.newLeadsContacted,
    emails_sent: m.emailsSent,
    opens: m.opens,
    opens_unique: m.opensUnique,
    replies: m.replies,
    replies_unique: m.repliesUnique,
    clicks: m.clicks,
    clicks_unique: m.clicksUnique,
    bounces: m.bounces,
    unsubscribes: m.unsubscribes,
    completed: m.completed,
    opportunities: m.opportunities,
    opportunity_value: m.opportunityValue,
    interested: m.interested,
    meetings_booked: m.meetingsBooked,
    meetings_completed: m.meetingsCompleted,
    closed: m.closed,
    provider_raw: s.providerRaw,
  };
}

export function toStepStatRow(campaignId: string, s: StepStat, syncRunId: string | null, capturedAt: string): StepStatRow {
  return {
    campaign_id: campaignId,
    sync_run_id: syncRunId,
    stat_date: capturedAt.slice(0, 10),
    captured_at: capturedAt,
    step: s.step,
    variant: s.variant,
    sent: s.sent,
    opens: s.opens,
    opens_unique: s.opensUnique,
    replies: s.replies,
    replies_unique: s.repliesUnique,
    clicks: s.clicks,
    clicks_unique: s.clicksUnique,
    opportunities: s.opportunities,
  };
}

export function toAccountRow(ctx: SyncContext, a: NormalizedAccount, syncedAt: string): AccountRow {
  return {
    workspace_id: ctx.workspaceId,
    integration_id: ctx.integrationId,
    provider: ctx.provider,
    email: a.email,
    status: a.status,
    provider_status: a.providerStatus,
    warmup_status: a.warmupStatus,
    provider_warmup_status: a.providerWarmupStatus,
    warmup_score: a.warmupScore,
    daily_limit: a.dailyLimit,
    sending_gap_minutes: a.sendingGapMinutes,
    tracking_domain: a.trackingDomain,
    tracking_domain_status: a.trackingDomainStatus,
    last_used_at: a.lastUsedAt,
    external_created_at: a.externalCreatedAt,
    provider_raw: a.providerRaw,
    last_synced_at: syncedAt,
    unavailable_since: null,
  };
}

export function toAccountSendingRow(accountId: string, d: AccountDay, capturedAt: string): AccountSendingRow {
  return { account_id: accountId, stat_date: d.date, captured_at: capturedAt, sent: d.sent, bounced: d.bounced, replies: d.replies };
}

export function toAccountWarmupRow(accountId: string, d: WarmupDay, capturedAt: string): AccountWarmupRow {
  return {
    account_id: accountId,
    stat_date: d.date,
    captured_at: capturedAt,
    warmup_sent: d.sent,
    warmup_landed_inbox: d.landedInbox,
    warmup_landed_spam: d.landedSpam,
    warmup_received: d.received,
  };
}

export function toDomainRow(ctx: SyncContext, d: DomainCheck, checkedAt: string): DomainRow {
  return {
    workspace_id: ctx.workspaceId,
    integration_id: ctx.integrationId,
    domain: d.domain,
    spf: d.spf,
    dkim: d.dkim,
    dmarc: d.dmarc,
    mx: d.mx,
    checked_at: checkedAt,
  };
}

// ── Supabase implementation ───────────────────────────────────────────────────

const CHUNK = 500;

function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

/**
 * Writes through the given client: the signed-in user's client (RLS-scoped to
 * their workspace) or the service-role client for cron (every row carries an
 * explicit workspace_id, and DB triggers re-derive and verify it).
 */
export function createSupabaseCampaignStore(supabase: SupabaseClient): CampaignStore {
  return {
    async lastSuccessfulSyncAt(integrationId) {
      const { data } = await supabase
        .from('sync_runs')
        .select('started_at')
        .eq('integration_id', integrationId)
        .eq('status', 'success')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data?.started_at as string | undefined) ?? null;
    },

    async scopedExternalIds(integrationId) {
      const { data, error } = await supabase
        .from('campaigns_v2')
        .select('external_id, campaign_client_map!inner(client_id)')
        .eq('integration_id', integrationId)
        .is('archived_at', null);
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: [...new Set((data ?? []).map((r) => r.external_id as string))] };
    },

    async markUnavailable(integrationId, externalIds, at) {
      for (const batch of chunks(externalIds)) {
        const { error } = await supabase
          .from('campaigns_v2')
          .update({ unavailable_since: at })
          .eq('integration_id', integrationId)
          .in('external_id', batch)
          .is('unavailable_since', null);
        if (error) console.warn('markUnavailable failed:', error.message);
      }
    },

    async activeRunStartedAt(integrationId, startedAfter) {
      const { data } = await supabase
        .from('sync_runs')
        .select('started_at')
        .eq('integration_id', integrationId)
        .eq('status', 'running')
        .gt('started_at', startedAfter)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data?.started_at as string | undefined) ?? null;
    },

    async startRun(ctx, trigger, startedAt) {
      const { data, error } = await supabase
        .from('sync_runs')
        .insert({
          workspace_id: ctx.workspaceId,
          integration_id: ctx.integrationId,
          provider: ctx.provider,
          triggered_by: trigger,
          status: 'running',
          started_at: startedAt,
        })
        .select('id')
        .single();
      if (error || !data) {
        console.warn('sync run start failed:', error?.message);
        return null;
      }
      return data.id as string;
    },

    async upsertCampaigns(rows) {
      const ids = new Map<string, string>();
      for (const batch of chunks(rows)) {
        const { data, error } = await supabase
          .from('campaigns_v2')
          .upsert(batch, { onConflict: 'integration_id,external_id' })
          .select('id, external_id');
        if (error) return { ok: false, error: error.message };
        for (const r of data ?? []) ids.set(r.external_id as string, r.id as string);
      }
      return { ok: true, data: ids };
    },

    async upsertStats(rows) {
      let written = 0;
      for (const batch of chunks(rows)) {
        const { error, count } = await supabase
          .from('campaign_stats')
          .upsert(batch, { onConflict: 'campaign_id,stat_date', count: 'exact' });
        if (error) return { ok: false, error: error.message };
        written += count ?? batch.length;
      }
      return { ok: true, data: written };
    },

    async finishRun(runId, finish, finishedAt) {
      const details =
        finish.details || finish.errorKind
          ? { ...(finish.details ?? {}), ...(finish.errorKind ? { errorKind: finish.errorKind } : {}) }
          : null;
      const { error } = await supabase
        .from('sync_runs')
        .update({
          status: finish.status,
          finished_at: finishedAt,
          campaigns_seen: finish.campaignsSeen,
          campaigns_upserted: finish.campaignsUpserted,
          stats_written: finish.statsWritten,
          error_message: finish.errorMessage,
          ...(details ? { details } : {}),
        })
        .eq('id', runId);
      if (error) console.warn('sync run finish failed:', error.message);
    },

    async lastExtrasSyncAt(integrationId) {
      const { data } = await supabase
        .from('sync_runs')
        .select('started_at')
        .eq('integration_id', integrationId)
        .eq('details->>extras', 'done')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data?.started_at as string | undefined) ?? null;
    },

    upsertStepStats: (rows) => upsertCount(supabase, 'campaign_step_stats', rows, 'campaign_id,stat_date,step,variant'),

    async upsertAccounts(rows) {
      const ids = new Map<string, string>();
      for (const batch of chunks(rows)) {
        const { data, error } = await supabase
          .from('email_accounts')
          .upsert(batch, { onConflict: 'integration_id,email' })
          .select('id, email');
        if (error) return { ok: false, error: error.message };
        for (const r of data ?? []) ids.set(r.email as string, r.id as string);
      }
      return { ok: true, data: ids };
    },

    async markAccountsUnavailable(integrationId, keepEmails, at) {
      let query = supabase
        .from('email_accounts')
        .update({ unavailable_since: at })
        .eq('integration_id', integrationId)
        .is('unavailable_since', null);
      if (keepEmails.length) query = query.not('email', 'in', `(${keepEmails.map((e) => `"${e}"`).join(',')})`);
      const { error } = await query;
      if (error) console.warn('markAccountsUnavailable failed:', error.message);
    },

    upsertAccountSending: (rows) => upsertCount(supabase, 'email_account_stats', rows, 'account_id,stat_date'),
    upsertAccountWarmup: (rows) => upsertCount(supabase, 'email_account_stats', rows, 'account_id,stat_date'),
    upsertDomains: (rows) => upsertCount(supabase, 'email_domains', rows, 'integration_id,domain'),
  };
}

async function upsertCount(
  supabase: SupabaseClient,
  table: string,
  rows: object[],
  onConflict: string
): Promise<StoreResult<number>> {
  let written = 0;
  for (const batch of chunks(rows)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) return { ok: false, error: error.message };
    written += batch.length;
  }
  return { ok: true, data: written };
}

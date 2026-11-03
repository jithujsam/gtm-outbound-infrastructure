// Analytics reads (V2 tables) → the pure analytics layer's inputs.
// Server-side, through the caller's RLS-scoped client: a workspace only ever
// reads its own campaigns, statistics and infrastructure. No provider payloads
// leave this module (provider_raw is never selected).
//
// Campaign figures are the latest stored snapshot of each campaign
// (lifetime-to-date, "All time"). Snapshots are never subtracted to fake a
// date range.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CampaignStatus } from '../types.ts';
import { countsFromRow, latestCapture, scopeCampaigns, type CampaignRecord, type CampaignScope } from '../analytics/metrics.ts';
import type { StepStatInput } from '../analytics/steps.ts';
import { addDays, mailboxWindowStart, toDay, type AccountDayInput, type AccountInput, type CampaignSenders, type DomainInput } from '../analytics/infrastructure.ts';
import { REPLY_ACTIVITY_DAYS } from '../analytics/activity.ts';

const STATUSES: CampaignStatus[] = ['draft', 'active', 'paused', 'completed', 'error', 'suspended', 'unknown'];
/** PostgREST returns at most this many rows per request; reads page through. */
const PAGE = 1000;
/** Upper bound of rows read for one view (safety net). */
const MAX_ROWS = 100_000;

export type AnalyticsFilters = CampaignScope;

export interface FilterOption {
  id: string;
  label: string;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? v[0] : v) ?? null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** URL search params → filters. Unknown/invalid values are ignored, never trusted. */
export function parseFilters(params: Params): AnalyticsFilters {
  const id = (v: string | null) => (v && UUID.test(v) ? v : null);
  const provider = one(params.provider);
  return {
    clientId: id(one(params.client)),
    campaignId: id(one(params.campaign)),
    provider: provider && /^[a-z0-9_-]{1,40}$/.test(provider) ? provider : null,
  };
}

async function pageAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) {
      console.warn('analytics read failed:', error.message);
      break;
    }
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

const chunked = <T,>(items: T[], size = 200): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const toStatus = (v: unknown): CampaignStatus => (STATUSES.includes(v as CampaignStatus) ? (v as CampaignStatus) : 'unknown');

export interface CampaignData {
  /** Every client-linked campaign of the workspace (for filter options and comparisons). */
  all: CampaignRecord[];
  /** The campaigns matching the filters. */
  campaigns: CampaignRecord[];
  /** Every client of the workspace, id → name. */
  clients: FilterOption[];
  providers: string[];
  /** Campaigns matching the client/provider filters (for the campaign filter). */
  campaignOptions: FilterOption[];
  /** Latest snapshot capture among the campaigns in scope. */
  asOf: string | null;
}

/**
 * The workspace's client-linked campaigns with their latest snapshot.
 * Two RLS-scoped reads plus one batched read — no per-campaign queries.
 */
export async function loadCampaignData(supabase: SupabaseClient, filters: AnalyticsFilters): Promise<CampaignData> {
  const [{ data: linked, error }, { data: clients }] = await Promise.all([
    supabase.rpc('get_client_campaigns', { p_client_id: null }),
    supabase.from('clients').select('id, name').order('name'),
  ]);
  if (error) console.warn('loadCampaignData campaigns:', error.message);

  // get_client_campaigns returns one row per campaign × client: merge to one record per campaign.
  const byId = new Map<string, CampaignRecord>();
  for (const r of (linked ?? []) as Record<string, unknown>[]) {
    const id = String(r.campaign_id);
    const cur = byId.get(id);
    if (cur) {
      if (r.client_id && !cur.clientIds.includes(String(r.client_id))) cur.clientIds.push(String(r.client_id));
      continue;
    }
    byId.set(id, {
      id,
      name: String(r.name ?? 'Campaign'),
      provider: (r.provider as string | null) ?? null,
      status: toStatus(r.status),
      clientIds: r.client_id ? [String(r.client_id)] : [],
      counts: countsFromRow(r),
      capturedAt: (r.captured_at as string | null) ?? null,
      senderEmails: [],
      unavailableSince: null,
    });
  }

  for (const batch of chunked([...byId.keys()])) {
    const { data } = await supabase.from('campaigns_v2').select('id, sender_emails, unavailable_since').in('id', batch);
    for (const r of data ?? []) {
      const c = byId.get(r.id as string);
      if (!c) continue;
      c.senderEmails = (r.sender_emails as string[] | null) ?? [];
      c.unavailableSince = (r.unavailable_since as string | null) ?? null;
    }
  }

  const all = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  const providers = [...new Set(all.map((c) => c.provider).filter((p): p is string => !!p))].sort();
  const options = scopeCampaigns(all, { ...filters, campaignId: null });
  const campaigns = scopeCampaigns(options, filters);

  return {
    all,
    campaigns,
    clients: (clients ?? []).map((c) => ({ id: c.id as string, label: c.name as string })),
    providers,
    campaignOptions: options.map((c) => ({ id: c.id, label: c.name })),
    asOf: latestCapture(campaigns),
  };
}

export interface CampaignMailbox {
  email: string;
  status: AccountInput['status'];
  warmupStatus: AccountInput['warmupStatus'];
  warmupScore: number | null;
  dailyLimit: number | null;
}

export interface CampaignDetailData {
  campaign: CampaignRecord & {
    clientNames: string[];
    dailyLimit: number | null;
    startDate: string | null;
    endDate: string | null;
    createdDay: string | null;
    lastSyncedAt: string | null;
  };
  steps: StepStatInput[];
  stepsAsOf: string | null;
  /** The mailboxes this campaign sends from, as stored by the last infrastructure sync. */
  mailboxes: CampaignMailbox[];
}

/** One campaign (RLS: only the caller's workspace) with its latest snapshot, steps and mailboxes. */
export async function loadCampaignDetail(supabase: SupabaseClient, campaignId: string): Promise<CampaignDetailData | null> {
  if (!UUID.test(campaignId)) return null;
  const { data: c } = await supabase
    .from('campaigns_v2')
    .select('id, name, status, provider, integration_id, sender_emails, daily_limit, start_date, end_date, external_created_at, last_synced_at, unavailable_since, campaign_client_map(client_id, clients(id, name))')
    .eq('id', campaignId)
    .is('archived_at', null)
    .maybeSingle();
  if (!c) return null;

  const links = (c.campaign_client_map as unknown as { client_id: string; clients: { id: string; name: string } | null }[]) ?? [];
  const senders = (c.sender_emails as string[] | null) ?? [];

  const [{ data: latest }, stepRows, { data: accountRows }] = await Promise.all([
    supabase
      .from('campaign_stats')
      .select('captured_at, emails_sent, new_leads_contacted, replies_unique, opportunities, bounces')
      .eq('campaign_id', campaignId)
      .order('stat_date', { ascending: false })
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('campaign_step_stats')
      .select('stat_date, step, variant, sent, replies, replies_unique, opens_unique, clicks_unique, opportunities')
      .eq('campaign_id', campaignId)
      .order('stat_date', { ascending: false })
      .limit(500),
    senders.length
      ? supabase
          .from('email_accounts')
          .select('email, status, warmup_status, warmup_score, daily_limit')
          .eq('integration_id', c.integration_id as string)
          .in('email', senders)
          .is('unavailable_since', null)
          .order('email')
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const stepData = (stepRows.data ?? []) as (StepStatInput & { stat_date: string })[];
  const stepsAsOf = stepData[0]?.stat_date ?? null;
  const known = (v: unknown, list: string[]) => (list.includes(v as string) ? (v as 'active') : 'unknown');

  return {
    campaign: {
      id: c.id as string,
      name: c.name as string,
      status: toStatus(c.status),
      provider: (c.provider as string) ?? null,
      clientIds: links.map((l) => l.client_id),
      clientNames: links.map((l) => l.clients?.name).filter((n): n is string => !!n),
      counts: countsFromRow(latest as Record<string, unknown> | null),
      capturedAt: (latest?.captured_at as string | undefined) ?? null,
      senderEmails: senders,
      unavailableSince: (c.unavailable_since as string | null) ?? null,
      dailyLimit: (c.daily_limit as number | null) ?? null,
      startDate: (c.start_date as string | null) ?? null,
      endDate: (c.end_date as string | null) ?? null,
      createdDay: ((c.external_created_at as string | null) ?? null)?.slice(0, 10) ?? null,
      lastSyncedAt: (c.last_synced_at as string | null) ?? null,
    },
    steps: stepData.filter((s) => s.stat_date === stepsAsOf),
    stepsAsOf,
    mailboxes: ((accountRows ?? []) as Record<string, unknown>[]).map((r) => ({
      email: r.email as string,
      status: known(r.status, ['active', 'paused', 'error']) as AccountInput['status'],
      warmupStatus: known(r.warmup_status, ['active', 'paused', 'error']) as AccountInput['warmupStatus'],
      warmupScore: r.warmup_score === null || r.warmup_score === undefined ? null : Number(r.warmup_score),
      dailyLimit: r.daily_limit === null || r.daily_limit === undefined ? null : Number(r.daily_limit),
    })),
  };
}

const ACCOUNT_COLUMNS =
  'id, email, status, provider_status, warmup_status, warmup_score, daily_limit, sending_gap_minutes, tracking_domain, tracking_domain_status, last_used_at, unavailable_since';

function toAccountInput(r: Record<string, unknown>): AccountInput {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: r.id as string,
    email: r.email as string,
    status: (['active', 'paused', 'error'].includes(r.status as string) ? r.status : 'unknown') as AccountInput['status'],
    providerStatus: (r.provider_status as string | null) ?? null,
    warmupStatus: (['active', 'paused', 'error'].includes(r.warmup_status as string) ? r.warmup_status : 'unknown') as AccountInput['warmupStatus'],
    warmupScore: n(r.warmup_score),
    dailyLimit: n(r.daily_limit),
    sendingGapMinutes: n(r.sending_gap_minutes),
    trackingDomain: (r.tracking_domain as string | null) ?? null,
    trackingDomainStatus: (r.tracking_domain_status as string | null) ?? null,
    lastUsedAt: (r.last_used_at as string | null) ?? null,
    unavailableSince: (r.unavailable_since as string | null) ?? null,
  };
}

/** What the last infrastructure sync could and could not read. */
export interface InfraSyncState {
  at: string | null;
  parts: Record<string, string>;
  errors: Record<string, string>;
}

export interface InfrastructureData {
  accounts: AccountInput[];
  /** Stored mailbox days in the mailbox window (warmup and, when reported, campaign sending). */
  days: AccountDayInput[];
  domains: DomainInput[];
  /** The campaigns in view (the filters applied). */
  campaigns: CampaignSenders[];
  /** Every client campaign of the workspace (to name other campaigns that share a mailbox). */
  allCampaigns: CampaignSenders[];
  clients: FilterOption[];
  providers: string[];
  sync: InfraSyncState;
}

/**
 * The sending infrastructure of the workspace (or of one client / campaign /
 * provider): the mailboxes its client-linked campaigns send from.
 */
export async function loadInfrastructure(supabase: SupabaseClient, filters: AnalyticsFilters): Promise<InfrastructureData> {
  const campaignData = await loadCampaignData(supabase, filters);
  const campaigns = campaignData.campaigns.map((c) => ({ id: c.id, name: c.name, senderEmails: c.senderEmails }));
  const allCampaigns = campaignData.all.map((c) => ({ id: c.id, name: c.name, senderEmails: c.senderEmails }));
  const windowStart = mailboxWindowStart(toDay(new Date()));
  const scoped = filters.clientId || filters.campaignId || filters.provider;
  const emails = new Set(campaigns.flatMap((c) => c.senderEmails));

  const { data: accountRows } = await supabase.from('email_accounts').select(ACCOUNT_COLUMNS).order('email');
  const accounts = ((accountRows ?? []) as Record<string, unknown>[])
    .map(toAccountInput)
    .filter((a) => !scoped || emails.has(a.email));

  const days: AccountDayInput[] = [];
  for (const batch of chunked(accounts.map((a) => a.id))) {
    days.push(
      ...(await pageAll<AccountDayInput>((from, to) =>
        supabase
          .from('email_account_stats')
          .select('account_id, stat_date, sent, bounced, replies, warmup_sent, warmup_landed_inbox, warmup_landed_spam, warmup_received')
          .in('account_id', batch)
          .gte('stat_date', windowStart)
          .order('stat_date')
          .order('id')
          .range(from, to) as unknown as PromiseLike<{ data: AccountDayInput[] | null; error: { message: string } | null }>
      ))
    );
  }

  const domainNames = [...new Set(accounts.map((a) => a.email.split('@')[1]))];
  const { data: domainRows } = domainNames.length
    ? await supabase.from('email_domains').select('domain, spf, dkim, dmarc, mx, checked_at').in('domain', domainNames)
    : { data: [] };

  const { data: run } = await supabase
    .from('sync_runs')
    .select('started_at, details')
    .eq('details->>extras', 'done')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const details = (run?.details ?? {}) as Record<string, unknown>;
  const parts: Record<string, string> = {};
  for (const k of ['accounts', 'accountDaily', 'warmup', 'domains', 'steps', 'outcomes']) {
    if (typeof details[k] === 'string') parts[k] = details[k] as string;
  }

  return {
    accounts,
    days,
    domains: (domainRows ?? []) as DomainInput[],
    campaigns,
    allCampaigns,
    clients: campaignData.clients,
    providers: campaignData.providers,
    sync: {
      at: (run?.started_at as string | undefined) ?? null,
      parts,
      errors: (details.errors as Record<string, string> | undefined) ?? {},
    },
  };
}

/**
 * When prospects replied to the given campaigns: the send time of every synced,
 * non-automatic reply in the last REPLY_ACTIVITY_DAYS days. Timestamps only;
 * no message content leaves this function. RLS-scoped (own workspace only).
 */
export async function loadReplyTimes(supabase: SupabaseClient, campaignIds: string[], today: string = toDay(new Date())): Promise<string[]> {
  if (!campaignIds.length) return [];
  const since = `${addDays(today, -(REPLY_ACTIVITY_DAYS - 1))}T00:00:00Z`;
  const threadIds: string[] = [];
  for (const batch of chunked(campaignIds)) {
    const rows = await pageAll<{ id: string }>((from, to) =>
      supabase.from('reply_threads').select('id').in('campaign_id', batch).order('id').range(from, to) as unknown as PromiseLike<{
        data: { id: string }[] | null;
        error: { message: string } | null;
      }>
    );
    threadIds.push(...rows.map((r) => r.id));
  }
  const times: string[] = [];
  for (const batch of chunked(threadIds)) {
    const rows = await pageAll<{ sent_at: string }>((from, to) =>
      supabase
        .from('reply_messages')
        .select('sent_at')
        .in('thread_id', batch)
        .eq('direction', 'received')
        .eq('is_auto_reply', false)
        .gte('sent_at', since)
        .order('sent_at')
        .order('id')
        .range(from, to) as unknown as PromiseLike<{ data: { sent_at: string }[] | null; error: { message: string } | null }>
    );
    times.push(...rows.map((r) => r.sent_at));
  }
  return times;
}

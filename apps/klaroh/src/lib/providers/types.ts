// Provider-neutral concepts every campaign provider adapter produces.
//
//   provider API → provider HTTP layer → provider mapper → ADAPTER → these types
//                → Klaroh database writer (src/lib/sync) → Klaroh features
//
// Nothing in here (or downstream of it) may know a provider's field names.
// Safe to import from client components (types, constants and pure helpers).

import type { CampaignStatus } from '../types.ts';

export type { CampaignStatus };

/** A provider campaign's identity and configuration, in Klaroh terms. */
export interface NormalizedCampaign {
  externalId: string;
  name: string;
  status: CampaignStatus;
  /** The provider's own status value, kept verbatim for diagnostics. */
  providerStatus: string | null;
  isEvergreen: boolean | null;
  senderCount: number | null;
  dailyLimit: number | null;
  /** YYYY-MM-DD */
  startDate: string | null;
  /** YYYY-MM-DD */
  endDate: string | null;
  /** ISO timestamp */
  externalCreatedAt: string | null;
  /** ISO timestamp */
  externalUpdatedAt: string | null;
  /** Provider payload, so later features can recover fields without a schema change. */
  providerRaw: Record<string, unknown> | null;
  /** The sending accounts (mailbox emails, lower-case) the campaign uses; null = not reported. */
  senderEmails: string[] | null;
}

/**
 * Cumulative (lifetime-to-date) campaign counters. `null` means the provider
 * did not report the value — never a fabricated zero.
 */
export interface CampaignMetrics {
  leads: number | null;
  contacted: number | null;
  newLeadsContacted: number | null;
  emailsSent: number | null;
  opens: number | null;
  opensUnique: number | null;
  replies: number | null;
  repliesUnique: number | null;
  clicks: number | null;
  clicksUnique: number | null;
  bounces: number | null;
  unsubscribes: number | null;
  completed: number | null;
  opportunities: number | null;
  opportunityValue: number | null;
  interested: number | null;
  meetingsBooked: number | null;
  meetingsCompleted: number | null;
  closed: number | null;
}

/** One campaign's metrics at the moment of a sync. */
export interface CampaignStatSnapshot {
  externalId: string;
  metrics: CampaignMetrics;
  providerRaw: Record<string, unknown> | null;
}

export interface ProviderError {
  /** HTTP status from the provider; 0 = network/timeout. */
  status: number;
  message: string;
}

/** What a provider failure means for the user, independent of the provider. */
export type ProviderErrorKind = 'auth' | 'rate_limited' | 'unavailable' | 'error';

export function classifyProviderError(error: ProviderError): ProviderErrorKind {
  if (error.status === 401 || error.status === 403) return 'auth';
  if (error.status === 429) return 'rate_limited';
  if (error.status === 0 || error.status >= 500) return 'unavailable';
  return 'error';
}

export type ProviderResult<T> = { ok: true; data: T } | { ok: false; error: ProviderError };

/** Business outcomes some providers only report per campaign (merged into CampaignMetrics). */
export type CampaignOutcomes = Partial<
  Pick<CampaignMetrics, 'interested' | 'meetingsBooked' | 'meetingsCompleted' | 'closed' | 'opportunities' | 'opportunityValue'>
>;

/** Fills metrics the analytics row did not report from the per-campaign outcomes (never overwrites). */
export function mergeOutcomes(metrics: CampaignMetrics, outcomes: CampaignOutcomes): CampaignMetrics {
  const merged = { ...metrics };
  for (const [key, value] of Object.entries(outcomes) as [keyof CampaignOutcomes, number | null][]) {
    if (merged[key] === null && value !== null && value !== undefined) merged[key] = value;
  }
  return merged;
}

/** One sequence step (and variant) of a campaign, lifetime-to-date. null = not reported. */
export interface StepStat {
  externalId: string;
  /** 1-based step number. */
  step: number;
  /** Provider variant label ('A', 'B', …); '' when the provider gives no split. */
  variant: string;
  sent: number | null;
  opens: number | null;
  opensUnique: number | null;
  replies: number | null;
  repliesUnique: number | null;
  clicks: number | null;
  clicksUnique: number | null;
  opportunities: number | null;
}

/** Sending-account state, provider-neutral. */
export type AccountStatus = 'active' | 'paused' | 'error' | 'unknown';
export type WarmupStatus = 'active' | 'paused' | 'error' | 'unknown';

/**
 * A sending mailbox (an "email ID"): infrastructure, never a lead. Carries no
 * credentials — adapters must whitelist what goes into providerRaw.
 */
export interface NormalizedAccount {
  email: string;
  status: AccountStatus;
  providerStatus: string | null;
  warmupStatus: WarmupStatus;
  providerWarmupStatus: string | null;
  /** Provider warmup health score, 0–100. */
  warmupScore: number | null;
  dailyLimit: number | null;
  sendingGapMinutes: number | null;
  trackingDomain: string | null;
  trackingDomainStatus: string | null;
  /** ISO timestamp */
  lastUsedAt: string | null;
  /** ISO timestamp */
  externalCreatedAt: string | null;
  providerRaw: Record<string, unknown> | null;
}

/** Campaign sending by one mailbox on one day (not cumulative). */
export interface AccountDay {
  email: string;
  /** YYYY-MM-DD */
  date: string;
  sent: number | null;
  bounced: number | null;
  replies: number | null;
}

/** Warmup activity of one mailbox on one day — never campaign activity. */
export interface WarmupDay {
  email: string;
  /** YYYY-MM-DD */
  date: string;
  sent: number | null;
  landedInbox: number | null;
  landedSpam: number | null;
  received: number | null;
}

export interface WarmupReport {
  days: WarmupDay[];
  /** email → provider warmup health score (0–100) */
  healthScores: Map<string, number>;
}

/** DNS checks of a sending domain; null = not checked / not reported. */
export interface DomainCheck {
  domain: string;
  spf: boolean | null;
  dkim: boolean | null;
  dmarc: boolean | null;
  mx: boolean | null;
}

// ── replies (Inbox) ──────────────────────────────────────────────────────────

/**
 * A lead's interest status as marked at the provider (by the agency's team or
 * the provider's AI). The positive ones are exactly the statuses the
 * "positive" metric counts — see POSITIVE_INTEREST in src/lib/analytics/replies.ts.
 */
export type LeadInterest =
  | 'interested'
  | 'meeting_booked'
  | 'meeting_completed'
  | 'won'
  | 'out_of_office'
  | 'not_interested'
  | 'wrong_person'
  | 'lost';

/** A message a prospect sent to a campaign (received side only). */
export interface ReceivedMessage {
  externalId: string;
  /** Provider conversation id; the message id when the provider gives none. */
  threadId: string;
  campaignExternalId: string | null;
  leadExternalId: string | null;
  leadEmail: string | null;
  /** Automatic response (out-of-office, vacation, …) — never a human reply. */
  isAutoReply: boolean;
  /** The lead's interest status as carried on the message (may be older than the lead's current one). */
  interest: LeadInterest | null;
  sentAt: string;
  subject: string | null;
  fromEmail: string | null;
  fromName: string | null;
  toEmail: string | null;
  /** Readable text with the quoted earlier conversation removed. */
  body: string | null;
  step: number | null;
}

export interface ReplyPage {
  /** Received messages on the page (others are dropped). */
  messages: ReceivedMessage[];
  /** Rows the provider returned (for paging decisions). */
  rows: number;
  nextCursor: string | null;
}

export interface LeadProfile {
  externalId: string;
  email: string | null;
  name: string | null;
  company: string | null;
  /** The lead's CURRENT interest status. */
  interest: LeadInterest | null;
}

/** What Klaroh needs from any campaign provider. */
export interface ProviderAdapter {
  readonly provider: string;
  readonly label: string;
  validateCredentials(apiKey: string): Promise<ProviderResult<null>>;
  listCampaigns(apiKey: string): Promise<ProviderResult<NormalizedCampaign[]>>;
  fetchStats(apiKey: string): Promise<ProviderResult<CampaignStatSnapshot[]>>;
  /** A message that is safe to show to the user for a provider error. */
  userSafeError(error: ProviderError, fallback: string): string;

  // ── optional capabilities: a provider implements what it can report ──────
  /** Per-campaign business outcomes missing from fetchStats (interested, meetings, …). */
  fetchCampaignOutcomes?(apiKey: string, externalId: string): Promise<ProviderResult<CampaignOutcomes>>;
  fetchStepStats?(apiKey: string, externalId: string): Promise<ProviderResult<StepStat[]>>;
  /** Every sending account of the connected provider account. */
  listAccounts?(apiKey: string): Promise<ProviderResult<NormalizedAccount[]>>;
  /** Campaign sending per mailbox per day for [startDate, endDate] (YYYY-MM-DD). */
  fetchAccountDaily?(apiKey: string, emails: string[], startDate: string, endDate: string): Promise<ProviderResult<AccountDay[]>>;
  fetchWarmup?(apiKey: string, emails: string[]): Promise<ProviderResult<WarmupReport>>;
  checkDomains?(apiKey: string, emails: string[]): Promise<ProviderResult<DomainCheck[]>>;
  /**
   * One page of messages prospects sent, created at or after `since` (ISO), oldest
   * first. The provider's own (tighter) rate limit for messages is respected inside.
   */
  fetchReplyPage?(apiKey: string, params: { since: string; cursor: string | null }): Promise<ProviderResult<ReplyPage>>;
  /** Name, company and current interest status of leads (by provider lead id). */
  fetchLeads?(apiKey: string, leadIds: string[]): Promise<ProviderResult<LeadProfile[]>>;
}

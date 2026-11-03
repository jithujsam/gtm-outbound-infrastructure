// Instantly → Klaroh normalization. Pure functions (no I/O) so they can be
// unit tested. This is the ONLY place that knows how Instantly's campaign and
// analytics shapes translate into Klaroh's provider-neutral concepts.

import { UE_TYPE_RECEIVED } from '../../instantly-mappers.ts';
import type {
  InstantlyAccount,
  InstantlyAccountDay,
  InstantlyCampaign,
  InstantlyCampaignAnalytics,
  InstantlyCampaignOutcomes,
  InstantlyDomainVitals,
  InstantlyEmail,
  InstantlyLead,
  InstantlyStepRow,
  InstantlyWarmupReport,
} from '../../instantly-mappers.ts';
import type {
  AccountDay,
  AccountStatus,
  CampaignMetrics,
  CampaignOutcomes,
  CampaignStatSnapshot,
  CampaignStatus,
  DomainCheck,
  LeadInterest,
  LeadProfile,
  NormalizedAccount,
  ReceivedMessage,
  NormalizedCampaign,
  StepStat,
  WarmupReport,
  WarmupStatus,
} from '../types.ts';

// Instantly v2 campaign status codes.
const STATUS_BY_CODE: Record<number, CampaignStatus> = {
  0: 'draft',
  1: 'active',
  2: 'paused',
  3: 'completed',
  4: 'active', // running subsequences
  [-1]: 'error', // accounts unhealthy
  [-2]: 'error', // bounce protect
  [-99]: 'suspended', // account suspended
};

export function normalizeInstantlyStatus(code: number | null | undefined): CampaignStatus {
  if (code === null || code === undefined) return 'unknown';
  return STATUS_BY_CODE[code] ?? 'unknown';
}

// Large/sensitive keys not worth keeping in provider_raw (email copy).
const RAW_CAMPAIGN_KEYS_DROPPED = new Set(['sequences']);

function compactRaw(raw: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  return Object.fromEntries(Object.entries(raw).filter(([k]) => !RAW_CAMPAIGN_KEYS_DROPPED.has(k)));
}

function toDate(value: string | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (match && !Number.isNaN(Date.parse(match[1]))) return match[1];
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
}

function toTimestamp(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function toCount(value: number | undefined): number | null {
  if (value === undefined || value === null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

function toMoney(value: number | undefined): number | null {
  if (value === undefined || value === null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

export function normalizeInstantlyCampaign(
  campaign: InstantlyCampaign,
  raw?: Record<string, unknown>
): NormalizedCampaign {
  return {
    externalId: campaign.campaign_id,
    name: campaign.campaign_name,
    status: normalizeInstantlyStatus(campaign.campaign_status),
    providerStatus: campaign.campaign_status === undefined ? null : String(campaign.campaign_status),
    isEvergreen: campaign.campaign_is_evergreen ?? null,
    senderCount: toCount(campaign.campaign_sender_count),
    dailyLimit: toCount(campaign.campaign_daily_limit),
    startDate: toDate(campaign.campaign_start_date),
    endDate: toDate(campaign.campaign_end_date),
    externalCreatedAt: toTimestamp(campaign.campaign_created_at),
    externalUpdatedAt: toTimestamp(campaign.campaign_updated_at),
    providerRaw: compactRaw(raw),
    senderEmails: campaign.campaign_sender_emails ?? null,
  };
}

export function normalizeInstantlyMetrics(a: InstantlyCampaignAnalytics): CampaignMetrics {
  return {
    leads: toCount(a.leads_count),
    contacted: toCount(a.contacted_count),
    newLeadsContacted: toCount(a.new_leads_contacted_count),
    emailsSent: toCount(a.emails_sent_count),
    opens: toCount(a.open_count),
    opensUnique: toCount(a.open_count_unique),
    replies: toCount(a.reply_count),
    repliesUnique: toCount(a.reply_count_unique),
    clicks: toCount(a.link_click_count),
    clicksUnique: toCount(a.link_click_count_unique),
    bounces: toCount(a.bounced_count),
    unsubscribes: toCount(a.unsubscribed_count),
    completed: toCount(a.completed_count),
    opportunities: toCount(a.total_opportunities),
    opportunityValue: toMoney(a.total_opportunity_value),
    interested: toCount(a.total_interested),
    meetingsBooked: toCount(a.total_meeting_booked),
    meetingsCompleted: toCount(a.total_meeting_completed),
    closed: toCount(a.total_closed),
  };
}

export function normalizeInstantlyStats(
  analytics: InstantlyCampaignAnalytics,
  raw?: Record<string, unknown>
): CampaignStatSnapshot {
  return {
    externalId: analytics.campaign_id,
    metrics: normalizeInstantlyMetrics(analytics),
    providerRaw: raw ?? null,
  };
}

export function normalizeInstantlyOutcomes(o: InstantlyCampaignOutcomes): CampaignOutcomes {
  const out: CampaignOutcomes = {};
  if (o.total_interested !== undefined) out.interested = toCount(o.total_interested);
  if (o.total_meeting_booked !== undefined) out.meetingsBooked = toCount(o.total_meeting_booked);
  if (o.total_meeting_completed !== undefined) out.meetingsCompleted = toCount(o.total_meeting_completed);
  if (o.total_closed !== undefined) out.closed = toCount(o.total_closed);
  if (o.total_opportunities !== undefined) out.opportunities = toCount(o.total_opportunities);
  if (o.total_opportunity_value !== undefined) out.opportunityValue = toMoney(o.total_opportunity_value);
  return out;
}

/** Variant index → letter (0 → A); a non-numeric label is kept as given. */
function variantLabel(variant: string | null): string {
  if (variant === null) return '';
  const n = Number(variant);
  if (Number.isInteger(n) && n >= 0 && n < 26) return String.fromCharCode(65 + n);
  return variant.slice(0, 20);
}

/**
 * Instantly reports steps 0-based in some payloads and 1-based in others: a
 * set containing step 0 is shifted so Klaroh's steps always start at 1.
 * Duplicate step/variant rows are summed.
 */
export function normalizeInstantlySteps(externalId: string, rows: InstantlyStepRow[]): StepStat[] {
  const zeroBased = rows.some((r) => r.step === 0);
  const byKey = new Map<string, StepStat>();
  const add = (a: number | null, b: number | undefined) => {
    const v = toCount(b);
    return v === null ? a : (a ?? 0) + v;
  };
  for (const r of rows) {
    const step = r.step + (zeroBased ? 1 : 0);
    const variant = variantLabel(r.variant);
    const key = `${step}|${variant}`;
    const cur = byKey.get(key) ?? {
      externalId, step, variant, sent: null, opens: null, opensUnique: null, replies: null,
      repliesUnique: null, clicks: null, clicksUnique: null, opportunities: null,
    };
    cur.sent = add(cur.sent, r.sent);
    cur.opens = add(cur.opens, r.opened);
    cur.opensUnique = add(cur.opensUnique, r.unique_opened);
    cur.replies = add(cur.replies, r.replies);
    cur.repliesUnique = add(cur.repliesUnique, r.unique_replies);
    cur.clicks = add(cur.clicks, r.clicks);
    cur.clicksUnique = add(cur.clicksUnique, r.unique_clicks);
    cur.opportunities = add(cur.opportunities, r.opportunities);
    byKey.set(key, cur);
  }
  return [...byKey.values()].sort((a, b) => a.step - b.step || a.variant.localeCompare(b.variant));
}

// Instantly account status codes.
const ACCOUNT_STATUS: Record<number, AccountStatus> = {
  1: 'active',
  2: 'paused',
  [-1]: 'error', // connection error
  [-2]: 'error', // soft bounce error
  [-3]: 'error', // sending error
};

// Instantly warmup status codes.
const WARMUP_STATUS: Record<number, WarmupStatus> = {
  0: 'paused',
  1: 'active',
  [-1]: 'error', // banned
  [-2]: 'error', // spam folder unknown
  [-3]: 'error', // permanent suspension
};

export function normalizeInstantlyAccountStatus(code: number | undefined): AccountStatus {
  return code === undefined ? 'unknown' : ACCOUNT_STATUS[code] ?? 'unknown';
}

export function normalizeInstantlyWarmupStatus(code: number | undefined): WarmupStatus {
  return code === undefined ? 'unknown' : WARMUP_STATUS[code] ?? 'unknown';
}

function toScore(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value) || value < 0 || value > 100) return null;
  return Math.round(value * 100) / 100;
}

export function normalizeInstantlyAccount(a: InstantlyAccount, raw: Record<string, unknown> | null): NormalizedAccount {
  return {
    email: a.email,
    status: normalizeInstantlyAccountStatus(a.status),
    providerStatus: a.status === undefined ? null : String(a.status),
    warmupStatus: normalizeInstantlyWarmupStatus(a.warmup_status),
    providerWarmupStatus: a.warmup_status === undefined ? null : String(a.warmup_status),
    warmupScore: toScore(a.stat_warmup_score),
    dailyLimit: toCount(a.daily_limit),
    sendingGapMinutes: toCount(a.sending_gap),
    trackingDomain: a.tracking_domain_name ?? null,
    trackingDomainStatus: a.tracking_domain_status ?? null,
    lastUsedAt: toTimestamp(a.timestamp_last_used),
    externalCreatedAt: toTimestamp(a.timestamp_created),
    providerRaw: raw,
  };
}

export function normalizeInstantlyAccountDays(rows: InstantlyAccountDay[]): AccountDay[] {
  return rows.map((r) => ({
    email: r.email,
    date: r.date,
    sent: toCount(r.sent),
    bounced: toCount(r.bounced),
    replies: toCount(r.replies),
  }));
}

export function normalizeInstantlyWarmup(r: InstantlyWarmupReport): WarmupReport {
  return {
    days: r.days.map((d) => ({
      email: d.email,
      date: d.date,
      sent: toCount(d.sent),
      landedInbox: toCount(d.landed_inbox),
      landedSpam: toCount(d.landed_spam),
      received: toCount(d.received),
    })),
    healthScores: new Map([...r.healthScores].map(([e, s]) => [e, toScore(s) ?? 0])),
  };
}

export function normalizeInstantlyDomains(rows: InstantlyDomainVitals[]): DomainCheck[] {
  return rows.map((r) => ({ domain: r.domain, spf: r.spf, dkim: r.dkim, dmarc: r.dmarc, mx: r.mx }));
}

// ── replies ─────────────────────────────────────────────────────────────────

/**
 * Instantly lead interest status codes (`lt_interest_status`, `i_status`).
 * 1–4 are the statuses Instantly counts as opportunities (total_opportunities,
 * Klaroh's "positive" metric).
 */
const INTEREST_CODES: Record<number, LeadInterest> = {
  1: 'interested',
  2: 'meeting_booked',
  3: 'meeting_completed',
  4: 'won',
  0: 'out_of_office',
  [-1]: 'not_interested',
  [-2]: 'wrong_person',
  [-3]: 'lost',
};

export function normalizeInstantlyInterest(code: number | null | undefined): LeadInterest | null {
  return code === null || code === undefined ? null : (INTEREST_CODES[code] ?? null);
}

/** Subjects that only automatic responders use (a fallback when the provider gives no flag). */
const AUTO_SUBJECT = /^\s*(automatic reply|auto[- ]?reply|autoreply|out of (the )?office|ooo\b|on vacation|vacation reply|abwesend|abwesenheitsnotiz|r[ée]ponse automatique|absence|respuesta autom[aá]tica|delivery status notification|undeliverable)/i;

export function isAutoReplyMessage(flag: boolean | null, subject: string | null, interest: LeadInterest | null): boolean {
  if (flag === true) return true;
  if (interest === 'out_of_office') return true;
  return flag === null && !!subject && AUTO_SUBJECT.test(subject);
}

/** The new part of a reply: quoted earlier messages and signatures' reply chains cut off. */
export function stripQuotedText(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = `${line} ${lines[i + 1] ?? ''}`;
    if (
      /^\s*On .{4,200}wrote:\s*$/i.test(line) ||
      /^\s*On .{4,200}$/i.test(line) && /wrote:\s*$/i.test(lines[i + 1] ?? '') && !/[.!?]$/.test(line.trim()) ||
      /^\s*-{2,}\s*(Original Message|Forwarded message)/i.test(line) ||
      /^\s*(From|Von|De):\s.+/i.test(line) && /(Sent|Gesendet|Envoy[ée]|Date):/i.test(next) ||
      /^\s*_{8,}\s*$/.test(line)
    ) {
      break;
    }
    if (/^\s*>/.test(line)) continue;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const MAX_BODY = 20_000;

/** Received messages only: Instantly's `ue_type` 2, or (when absent) a message not sent from the agency mailbox. */
export function normalizeInstantlyEmail(e: InstantlyEmail): ReceivedMessage | null {
  const received =
    e.ue_type === UE_TYPE_RECEIVED || (e.ue_type === null && !!e.from_email && e.from_email !== e.eaccount);
  if (!received || !e.timestamp) return null;
  const interest = normalizeInstantlyInterest(e.i_status);
  const text = e.text ? stripQuotedText(e.text) : null;
  return {
    externalId: e.id,
    threadId: e.thread_id ?? e.id,
    campaignExternalId: e.campaign_id,
    leadExternalId: e.lead_id,
    leadEmail: e.lead_email ?? e.from_email,
    isAutoReply: isAutoReplyMessage(e.is_auto_reply, e.subject, interest),
    interest,
    sentAt: new Date(e.timestamp).toISOString(),
    subject: e.subject,
    fromEmail: e.from_email,
    fromName: e.from_name,
    toEmail: e.to_email,
    body: text ? text.slice(0, MAX_BODY) : null,
    step: e.step,
  };
}

export function normalizeInstantlyLead(l: InstantlyLead): LeadProfile {
  const name = [l.first_name, l.last_name].filter(Boolean).join(' ').trim();
  return {
    externalId: l.id,
    email: l.email,
    name: name || null,
    company: l.company_name,
    interest: normalizeInstantlyInterest(l.interest_status),
  };
}

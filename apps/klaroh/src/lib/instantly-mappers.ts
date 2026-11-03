// Instantly API v2 — layer B: response parsing / mapping.
//
// Pure functions only (no I/O, no framework imports) so they can be unit
// tested in isolation. Everything here is defensive: the v2 payload has
// changed shape before (see docs/archive/Klaroh_Instantly_Integration_Repair.md), so every
// field is validated and missing/invalid values become `undefined`/`null`.
//
// Used by the Instantly provider adapter (src/lib/providers/instantly). They
// describe Instantly's payloads, not Klaroh's storage.

// Campaign identity/config as returned by the campaign-list endpoint.
// The `campaign_*` names are Klaroh's normalised aliases for the v2 fields.
export interface InstantlyCampaign {
  campaign_id: string;
  campaign_name: string;
  campaign_status?: number;
  campaign_is_evergreen?: boolean;
  campaign_sender_count?: number;
  /** Sending accounts (lower-cased, de-duplicated) from `email_list`. */
  campaign_sender_emails?: string[];
  campaign_daily_limit?: number;
  campaign_pl_value?: number;
  campaign_start_date?: string;
  campaign_end_date?: string;
  campaign_created_at?: string;
  campaign_updated_at?: string;
}

// Raw per-campaign metrics from the analytics endpoint.
export interface InstantlyCampaignAnalytics {
  campaign_id: string;
  leads_count?: number;
  contacted_count?: number;
  emails_sent_count?: number;
  new_leads_contacted_count?: number;
  open_count?: number;
  open_count_unique?: number;
  reply_count?: number;
  reply_count_unique?: number;
  link_click_count?: number;
  link_click_count_unique?: number;
  bounced_count?: number;
  unsubscribed_count?: number;
  completed_count?: number;
  total_opportunities?: number;
  total_opportunity_value?: number;
  total_interested?: number;
  total_meeting_booked?: number;
  total_meeting_completed?: number;
  total_closed?: number;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

export function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function bool(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
}

/** Extracts an array of rows from either a bare array or a wrapped payload. */
export function toRecordList(candidate: unknown): Record<string, unknown>[] {
  if (Array.isArray(candidate)) return candidate as Record<string, unknown>[];
  if (isRecord(candidate)) {
    if (Array.isArray(candidate.data)) return candidate.data as Record<string, unknown>[];
    if (Array.isArray(candidate.items)) return candidate.items as Record<string, unknown>[];
    if (Array.isArray(candidate.campaigns)) return candidate.campaigns as Record<string, unknown>[];
    return [];
  }
  return [];
}

/** Lower-cased, trimmed, de-duplicated email addresses; anything else dropped. */
export function normalizeEmails(values: unknown[]): string[] {
  const out = new Set<string>();
  for (const v of values) {
    const e = typeof v === 'string' ? v.trim().toLowerCase() : '';
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) out.add(e);
  }
  return [...out];
}

export function mapAnalyticsRow(raw: Record<string, unknown>): InstantlyCampaignAnalytics | null {
  const id = str(raw.campaign_id) ?? str(raw.id);
  if (!id) return null;

  const pick = (...keys: string[]): number | undefined => {
    for (const key of keys) {
      const n = num(raw[key]);
      if (n !== null) return n;
    }
    return undefined;
  };

  return {
    campaign_id: id,
    leads_count: pick('leads_count'),
    contacted_count: pick('contacted_count'),
    emails_sent_count: pick('emails_sent_count', 'emails_sent'),
    new_leads_contacted_count: pick('new_leads_contacted_count'),
    open_count: pick('open_count'),
    open_count_unique: pick('open_count_unique'),
    reply_count: pick('reply_count'),
    reply_count_unique: pick('reply_count_unique'),
    link_click_count: pick('link_click_count'),
    link_click_count_unique: pick('link_click_count_unique'),
    bounced_count: pick('bounced_count'),
    unsubscribed_count: pick('unsubscribed_count'),
    completed_count: pick('completed_count'),
    total_opportunities: pick('total_opportunities'),
    total_opportunity_value: pick('total_opportunity_value'),
    total_interested: pick('total_interested'),
    total_meeting_booked: pick('total_meeting_booked'),
    total_meeting_completed: pick('total_meeting_completed'),
    total_closed: pick('total_closed'),
  };
}

export function mapCampaignListRow(raw: Record<string, unknown>): InstantlyCampaign | null {
  const id = str(raw.id) ?? str(raw.campaign_id);
  if (!id) return null;
  const name = str(raw.name) ?? str(raw.campaign_name) ?? id;

  const status = num(raw.status) ?? num(raw.campaign_status);
  const isEvergreen = bool(raw.is_evergreen) ?? bool(raw.campaign_is_evergreen);
  const schedule = isRecord(raw.campaign_schedule) ? raw.campaign_schedule : undefined;
  const emailList = Array.isArray(raw.email_list) ? raw.email_list : undefined;

  const campaign: InstantlyCampaign = { campaign_id: id, campaign_name: name };
  if (status !== null) campaign.campaign_status = status;
  if (isEvergreen !== null) campaign.campaign_is_evergreen = isEvergreen;
  if (emailList) {
    const emails = normalizeEmails(emailList);
    campaign.campaign_sender_emails = emails;
    campaign.campaign_sender_count = emails.length;
  }

  const dailyLimit = num(raw.daily_limit);
  if (dailyLimit !== null) campaign.campaign_daily_limit = dailyLimit;

  const plValue = num(raw.pl_value);
  if (plValue !== null) campaign.campaign_pl_value = plValue;

  if (schedule) {
    const start = str(schedule.start_date);
    if (start) campaign.campaign_start_date = start;
    const end = str(schedule.end_date);
    if (end) campaign.campaign_end_date = end;
  }

  const created = str(raw.timestamp_created) ?? str(raw.created_at);
  if (created) campaign.campaign_created_at = created;
  const updated = str(raw.timestamp_updated) ?? str(raw.updated_at);
  if (updated) campaign.campaign_updated_at = updated;

  return campaign;
}

export interface CampaignListPage {
  items: Record<string, unknown>[];
  nextCursor: string | null;
}

export function parseCampaignListPage(candidate: unknown): CampaignListPage {
  if (Array.isArray(candidate)) {
    return { items: candidate as Record<string, unknown>[], nextCursor: null };
  }
  if (isRecord(candidate)) {
    const items = (Array.isArray(candidate.items)
      ? candidate.items
      : Array.isArray(candidate.data)
      ? candidate.data
      : Array.isArray(candidate.campaigns)
      ? candidate.campaigns
      : []) as Record<string, unknown>[];
    return { items, nextCursor: str(candidate.next_starting_after) };
  }
  return { items: [], nextCursor: null };
}

// ── campaign outcomes (/campaigns/analytics/overview?id=…) ──────────────────

export interface InstantlyCampaignOutcomes {
  total_opportunities?: number;
  total_opportunity_value?: number;
  total_interested?: number;
  total_meeting_booked?: number;
  total_meeting_completed?: number;
  total_closed?: number;
}

/** The outcome fields of the overview payload (an object, or a one-row list). */
export function mapCampaignOverview(candidate: unknown): InstantlyCampaignOutcomes | null {
  const raw = Array.isArray(candidate) ? candidate[0] : candidate;
  if (!isRecord(raw)) return null;
  const out: InstantlyCampaignOutcomes = {};
  for (const key of [
    'total_opportunities', 'total_opportunity_value', 'total_interested',
    'total_meeting_booked', 'total_meeting_completed', 'total_closed',
  ] as const) {
    const n = num(raw[key]);
    if (n !== null) out[key] = n;
  }
  return out;
}

// ── step analytics (/campaigns/analytics/steps?campaign_id=…) ───────────────

export interface InstantlyStepRow {
  step: number; // as reported (may be 0-based)
  variant: string | null;
  sent?: number;
  opened?: number;
  unique_opened?: number;
  replies?: number;
  unique_replies?: number;
  clicks?: number;
  unique_clicks?: number;
  opportunities?: number;
}

export function mapStepRow(raw: Record<string, unknown>): InstantlyStepRow | null {
  const step = num(raw.step);
  if (step === null || step < 0 || !Number.isInteger(step)) return null;
  const pick = (...keys: string[]): number | undefined => {
    for (const key of keys) {
      const n = num(raw[key]);
      if (n !== null) return n;
    }
    return undefined;
  };
  const variantRaw = raw.variant;
  const variant =
    variantRaw === null || variantRaw === undefined || variantRaw === ''
      ? null
      : String(variantRaw);
  return {
    step,
    variant,
    sent: pick('sent'),
    opened: pick('opened', 'opens'),
    unique_opened: pick('unique_opened', 'opened_unique'),
    replies: pick('replies'),
    unique_replies: pick('unique_replies', 'replies_unique'),
    clicks: pick('clicks'),
    unique_clicks: pick('unique_clicks', 'clicks_unique'),
    opportunities: pick('opportunities', 'unique_opportunities'),
  };
}

// ── accounts (/accounts) ────────────────────────────────────────────────────

export interface InstantlyAccount {
  email: string;
  status?: number;
  warmup_status?: number;
  stat_warmup_score?: number;
  daily_limit?: number;
  sending_gap?: number;
  tracking_domain_name?: string;
  tracking_domain_status?: string;
  timestamp_last_used?: string;
  timestamp_created?: string;
}

/**
 * Account fields Klaroh may keep as provider_raw. A whitelist on purpose: the
 * account payload can carry SMTP/IMAP settings and other secrets.
 */
export const ACCOUNT_RAW_KEYS = [
  'status', 'warmup_status', 'stat_warmup_score', 'daily_limit', 'sending_gap', 'provider_code',
  'setup_pending', 'enable_slow_ramp', 'is_managed_account', 'tracking_domain_name',
  'tracking_domain_status', 'timestamp_last_used', 'timestamp_created', 'timestamp_updated',
] as const;

export function safeAccountRaw(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ACCOUNT_RAW_KEYS) {
    const v = raw[key];
    if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
      if (v !== undefined) out[key] = v;
    }
  }
  return out;
}

export function mapAccountRow(raw: Record<string, unknown>): InstantlyAccount | null {
  const [email] = normalizeEmails([raw.email]);
  if (!email) return null;
  const account: InstantlyAccount = { email };
  const setNum = (key: 'status' | 'warmup_status' | 'stat_warmup_score' | 'daily_limit' | 'sending_gap') => {
    const n = num(raw[key]);
    if (n !== null) account[key] = n;
  };
  setNum('status');
  setNum('warmup_status');
  setNum('stat_warmup_score');
  setNum('daily_limit');
  setNum('sending_gap');
  for (const key of ['tracking_domain_name', 'tracking_domain_status', 'timestamp_last_used', 'timestamp_created'] as const) {
    const v = raw[key];
    const text = typeof v === 'number' ? String(v) : str(v);
    if (text) account[key] = text;
  }
  return account;
}

// ── account daily analytics (/accounts/analytics/daily) ─────────────────────

export interface InstantlyAccountDay {
  email: string;
  date: string;
  sent?: number;
  bounced?: number;
  replies?: number;
}

export function mapAccountDayRow(raw: Record<string, unknown>): InstantlyAccountDay | null {
  const [email] = normalizeEmails([raw.email_account ?? raw.email ?? raw.eaccount]);
  const date = str(raw.date);
  if (!email || !date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return null;
  const day: InstantlyAccountDay = { email, date: date.slice(0, 10) };
  const sent = num(raw.sent);
  if (sent !== null) day.sent = sent;
  const bounced = num(raw.bounced);
  if (bounced !== null) day.bounced = bounced;
  const replies = num(raw.replies ?? raw.unique_replies);
  if (replies !== null) day.replies = replies;
  return day;
}

// ── warmup analytics (POST /accounts/warmup-analytics) ──────────────────────

export interface InstantlyWarmupDay {
  email: string;
  date: string;
  sent?: number;
  landed_inbox?: number;
  landed_spam?: number;
  received?: number;
}

export interface InstantlyWarmupReport {
  days: InstantlyWarmupDay[];
  healthScores: Map<string, number>;
}

export function mapWarmupReport(candidate: unknown): InstantlyWarmupReport {
  const report: InstantlyWarmupReport = { days: [], healthScores: new Map() };
  if (!isRecord(candidate)) return report;
  const byEmail = isRecord(candidate.email_date_data) ? candidate.email_date_data : {};
  for (const [rawEmail, dates] of Object.entries(byEmail)) {
    const [email] = normalizeEmails([rawEmail]);
    if (!email || !isRecord(dates)) continue;
    for (const [date, values] of Object.entries(dates)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isRecord(values)) continue;
      const day: InstantlyWarmupDay = { email, date };
      for (const key of ['sent', 'landed_inbox', 'landed_spam', 'received'] as const) {
        const n = num(values[key]);
        if (n !== null) day[key] = n;
      }
      report.days.push(day);
    }
  }
  const aggregate = isRecord(candidate.aggregate_data) ? candidate.aggregate_data : {};
  for (const [rawEmail, values] of Object.entries(aggregate)) {
    const [email] = normalizeEmails([rawEmail]);
    if (!email || !isRecord(values)) continue;
    const score = num(values.health_score);
    if (score !== null && score >= 0 && score <= 100) report.healthScores.set(email, score);
  }
  return report;
}

// ── domain vitals (POST /accounts/test/vitals) ──────────────────────────────

export interface InstantlyDomainVitals {
  domain: string;
  spf: boolean | null;
  dkim: boolean | null;
  dmarc: boolean | null;
  mx: boolean | null;
}

function vital(value: unknown): boolean | null {
  if (typeof value === 'string') {
    const v = value.toLowerCase();
    if (['pass', 'passed', 'valid', 'ok', 'true'].includes(v)) return true;
    if (['fail', 'failed', 'invalid', 'missing', 'false'].includes(v)) return false;
    return null;
  }
  return bool(value);
}

export function mapDomainVitals(candidate: unknown): InstantlyDomainVitals[] {
  if (!isRecord(candidate)) return [];
  const rows = [
    ...(Array.isArray(candidate.success_list) ? candidate.success_list : []),
    ...(Array.isArray(candidate.failure_list) ? candidate.failure_list : []),
  ];
  const byDomain = new Map<string, InstantlyDomainVitals>();
  for (const raw of rows) {
    if (!isRecord(raw)) continue;
    const domain = str(raw.domain)?.trim().toLowerCase();
    if (!domain || domain.length < 3 || byDomain.has(domain)) continue;
    byDomain.set(domain, { domain, spf: vital(raw.spf), dkim: vital(raw.dkim), dmarc: vital(raw.dmarc), mx: vital(raw.mx) });
  }
  return [...byDomain.values()];
}

// ── emails (/emails) and leads (/leads/list) ────────────────────────────────
// Field names follow Instantly's v2 Email and Lead schemas. Read-only.

/** Instantly `ue_type`: 1 sent by a campaign, 2 received, 3 sent manually, 4 scheduled. */
export const UE_TYPE_RECEIVED = 2;

export interface InstantlyEmail {
  id: string;
  thread_id: string | null;
  campaign_id: string | null;
  lead_id: string | null;
  /** The prospect's address (`lead`). */
  lead_email: string | null;
  /** The agency mailbox the conversation runs through (`eaccount`). */
  eaccount: string | null;
  ue_type: number | null;
  is_auto_reply: boolean | null;
  /** The lead's interest status code as carried on the email (`i_status`). */
  i_status: number | null;
  /** When the email was sent/received (`timestamp_email`, else `timestamp_created`). */
  timestamp: string | null;
  subject: string | null;
  from_email: string | null;
  from_name: string | null;
  to_email: string | null;
  /** Plain text (`body.text`, else `body.html` as text, else `content_preview`). */
  text: string | null;
  step: number | null;
}

/** HTML → readable plain text (no tags, entities decoded, block breaks kept). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function firstAddress(value: unknown): { email: string | null; name: string | null } {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  for (const v of list) {
    if (typeof v === 'string') {
      // "Name <a@b>", or a bare address (first of a comma-separated list)
      const named = v.match(/^\s*"?([^"<]*?)"?\s*<([^<>\s]+@[^<>\s]+)>/);
      if (named) return { email: named[2].toLowerCase(), name: named[1].trim() || null };
      const bare = v.split(',')[0].trim();
      if (/^[^@\s]+@[^@\s]+$/.test(bare)) return { email: bare.toLowerCase(), name: null };
    } else if (isRecord(v)) {
      const email = str(v.address) ?? str(v.email);
      if (email) return { email: email.toLowerCase(), name: str(v.name) };
    }
  }
  return { email: null, name: null };
}

export function mapEmailRow(raw: Record<string, unknown>): InstantlyEmail | null {
  const id = str(raw.id);
  if (!id) return null;
  const body = isRecord(raw.body) ? raw.body : null;
  const text =
    str(body?.text) ?? (str(body?.html) ? htmlToText(String(body!.html)) : null) ?? (typeof raw.body === 'string' ? raw.body : null) ?? str(raw.content_preview);
  const from = firstAddress(raw.from_address_json);
  const to = firstAddress(raw.to_address_json ?? raw.to_address_email_list);
  const ts = str(raw.timestamp_email) ?? str(raw.timestamp_created);
  return {
    id,
    thread_id: str(raw.thread_id),
    campaign_id: str(raw.campaign_id),
    lead_id: str(raw.lead_id),
    lead_email: str(raw.lead)?.toLowerCase() ?? null,
    eaccount: str(raw.eaccount)?.toLowerCase() ?? null,
    ue_type: num(raw.ue_type),
    is_auto_reply: bool(raw.is_auto_reply),
    i_status: num(raw.i_status),
    timestamp: ts && !Number.isNaN(Date.parse(ts)) ? ts : null,
    subject: str(raw.subject),
    from_email: (str(raw.from_address_email) ?? from.email)?.toLowerCase() ?? null,
    from_name: from.name,
    to_email: (to.email ?? (typeof raw.to_address_email_list === 'string' ? raw.to_address_email_list.toLowerCase() : null)) || null,
    text,
    step: num(raw.step),
  };
}

export interface InstantlyLead {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  /** `lt_interest_status`: the lead's current interest status code. */
  interest_status: number | null;
}

export function mapLeadRow(raw: Record<string, unknown>): InstantlyLead | null {
  const id = str(raw.id);
  if (!id) return null;
  return {
    id,
    email: str(raw.email)?.toLowerCase() ?? null,
    first_name: str(raw.first_name),
    last_name: str(raw.last_name),
    company_name: str(raw.company_name),
    interest_status: num(raw.lt_interest_status),
  };
}

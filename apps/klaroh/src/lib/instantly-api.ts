// Instantly API v2 — layer A: API communication.
//
// Server-only. Never import this module from client components: it receives
// raw API keys. No persistence and no Klaroh-specific table knowledge here.
//
// Wrapped by the Klaroh provider adapter (src/lib/providers/instantly), which
// translates these Instantly shapes into Klaroh's normalized campaign/stat
// concepts. Nothing here knows about Klaroh's database.

import { createHash } from 'node:crypto';
import {
  isRecord,
  mapAccountDayRow,
  mapEmailRow,
  mapLeadRow,
  mapAccountRow,
  mapAnalyticsRow,
  mapCampaignListRow,
  mapCampaignOverview,
  mapDomainVitals,
  mapStepRow,
  mapWarmupReport,
  parseCampaignListPage,
  safeAccountRaw,
  toRecordList,
  type InstantlyAccount,
  type InstantlyAccountDay,
  type InstantlyCampaign,
  type InstantlyCampaignAnalytics,
  type InstantlyCampaignOutcomes,
  type InstantlyDomainVitals,
  type InstantlyEmail,
  type InstantlyLead,
  type InstantlyStepRow,
  type InstantlyWarmupReport,
} from './instantly-mappers.ts';

export const INSTANTLY_API_BASE = 'https://api.instantly.ai/api/v2';

export interface InstantlyApiError {
  status: number;
  message: string;
}

export type InstantlyFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: InstantlyApiError };

export interface InstantlyRequestOptions {
  timeoutMs?: number;
  /** Extra attempts after the first for 429/5xx/network failures. GET only. */
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 5_000;

// Campaign list paging: page size and a hard ceiling so a misbehaving API can
// never loop forever.
export const CAMPAIGN_PAGE_SIZE = 100;
export const CAMPAIGN_MAX_PAGES = 10;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isRetryable(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

function retryDelayMs(attempt: number, base: number, retryAfterHeader: string | null): number {
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(retryAfterSeconds * 1000, MAX_RETRY_DELAY_MS);
  }
  return Math.min(base * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

async function singleAttempt<T>(
  path: string,
  apiKey: string,
  timeoutMs: number,
  body?: unknown
): Promise<{ result: InstantlyFetchResult<T>; retryAfter: string | null }> {
  try {
    const res = await fetch(`${INSTANTLY_API_BASE}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail =
          (body && (body.message || body.error)) ||
          (Array.isArray(body) ? `Instantly API ${res.status}` : JSON.stringify(body));
      } catch {
        detail = `Instantly API ${res.status}`;
      }
      return {
        result: { ok: false, error: { status: res.status, message: String(detail).slice(0, 300) } },
        retryAfter: res.headers.get('retry-after'),
      };
    }

    const payload = await res.json();
    return { result: { ok: true, data: payload as T }, retryAfter: null };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === 'TimeoutError' || err.name === 'AbortError'
          ? 'Instantly request timed out'
          : err.message
        : 'Could not reach Instantly';
    return { result: { ok: false, error: { status: 0, message } }, retryAfter: null };
  }
}

export async function instantlyFetch<T>(
  path: string,
  apiKey: string,
  options: InstantlyRequestOptions = {},
  body?: unknown
): Promise<InstantlyFetchResult<T>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const base = options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;

  let attempt = 0;
  for (;;) {
    const { result, retryAfter } = await singleAttempt<T>(path, apiKey, timeoutMs, body);
    if (result.ok || !isRetryable(result.error.status) || attempt >= maxRetries) {
      return result;
    }
    await sleep(retryDelayMs(attempt, base, retryAfter));
    attempt++;
  }
}

/** A mapped Instantly row together with the raw payload it came from. */
export interface InstantlyDetailed<T> {
  item: T;
  raw: Record<string, unknown>;
}

/**
 * Fetches every campaign available to the connected Instantly account via the
 * v2 campaign-list endpoint (used for key validation, the campaign picker and
 * sync), keeping each raw row next to its mapped form.
 *
 * Uses cursor paging (`starting_after` / `next_starting_after`). If the API
 * returns no cursor, falls back to offset paging for older accounts. Results
 * are de-duplicated by campaign id and paging stops as soon as a page adds
 * nothing new, so an API that ignores `offset` can never cause repeats.
 */
export async function fetchInstantlyCampaignListDetailed(
  apiKey: string,
  options: InstantlyRequestOptions = {}
): Promise<InstantlyFetchResult<InstantlyDetailed<InstantlyCampaign>[]>> {
  const campaigns = new Map<string, InstantlyDetailed<InstantlyCampaign>>();
  let cursor: string | null = null;
  let offset = 0;

  for (let page = 0; page < CAMPAIGN_MAX_PAGES; page++) {
    const query = new URLSearchParams({ limit: String(CAMPAIGN_PAGE_SIZE) });
    if (cursor) query.set('starting_after', cursor);
    else if (offset > 0) query.set('offset', String(offset));

    const result = await instantlyFetch<unknown>(`/campaigns?${query.toString()}`, apiKey, options);
    if (!result.ok) return result;

    const parsed = parseCampaignListPage(result.data);
    const batch = parsed.items
      .map((raw) => ({ item: mapCampaignListRow(raw), raw }))
      .filter((c): c is InstantlyDetailed<InstantlyCampaign> => c.item !== null);

    let added = 0;
    for (const c of batch) {
      if (!campaigns.has(c.item.campaign_id)) {
        campaigns.set(c.item.campaign_id, c);
        added++;
      }
    }

    if (added === 0) break;

    if (parsed.nextCursor) {
      cursor = parsed.nextCursor;
      continue;
    }

    // No cursor: legacy offset paging. A short page means we are done.
    if (batch.length < CAMPAIGN_PAGE_SIZE) break;
    cursor = null;
    offset += batch.length;
  }

  return { ok: true, data: [...campaigns.values()] };
}

/** Every campaign of the connected account (mapped rows only). */
export async function fetchInstantlyCampaignList(
  apiKey: string,
  options: InstantlyRequestOptions = {}
): Promise<InstantlyFetchResult<InstantlyCampaign[]>> {
  const result = await fetchInstantlyCampaignListDetailed(apiKey, options);
  return result.ok ? { ok: true, data: result.data.map((c) => c.item) } : result;
}

/**
 * Fetches lifetime analytics for one campaign (`campaignId`) or for all
 * campaigns when omitted, keeping each raw row next to its mapped form.
 */
export async function fetchInstantlyAnalyticsDetailed(
  apiKey: string,
  campaignId?: string,
  options: InstantlyRequestOptions = {}
): Promise<InstantlyFetchResult<InstantlyDetailed<InstantlyCampaignAnalytics>[]>> {
  const path = campaignId
    ? `/campaigns/analytics?id=${encodeURIComponent(campaignId)}`
    : '/campaigns/analytics';
  const result = await instantlyFetch<unknown>(path, apiKey, options);
  if (!result.ok) return result;

  const rows = toRecordList(result.data)
    .map((raw) => ({ item: mapAnalyticsRow(raw), raw }))
    .filter((a): a is InstantlyDetailed<InstantlyCampaignAnalytics> => a.item !== null);

  return { ok: true, data: rows };
}

/** Lifetime analytics (mapped rows only). */
export async function fetchInstantlyAnalytics(
  apiKey: string,
  campaignId?: string,
  options: InstantlyRequestOptions = {}
): Promise<InstantlyFetchResult<InstantlyCampaignAnalytics[]>> {
  const result = await fetchInstantlyAnalyticsDetailed(apiKey, campaignId, options);
  return result.ok ? { ok: true, data: result.data.map((a) => a.item) } : result;
}

// ── read-only analytics & infrastructure endpoints ─────────────────────────
// The two POST endpoints below only READ (warmup report, DNS checks); Klaroh
// never calls an Instantly endpoint that changes data.

/** Emails per request for endpoints that take a list of accounts. */
export const ACCOUNT_BATCH_SIZE = 100;
export const ACCOUNT_PAGE_SIZE = 100;
export const ACCOUNT_MAX_PAGES = 20;

function batches<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Interested / meetings / closed for one campaign (lifetime). */
export async function fetchInstantlyCampaignOutcomes(
  apiKey: string,
  campaignId: string,
  options: InstantlyRequestOptions = {}
): Promise<InstantlyFetchResult<InstantlyCampaignOutcomes>> {
  const result = await instantlyFetch<unknown>(
    `/campaigns/analytics/overview?id=${encodeURIComponent(campaignId)}`,
    apiKey,
    options
  );
  if (!result.ok) return result;
  return { ok: true, data: mapCampaignOverview(result.data) ?? {} };
}

/** Per step / variant counters for one campaign (lifetime). */
export async function fetchInstantlyStepAnalytics(
  apiKey: string,
  campaignId: string,
  options: InstantlyRequestOptions = {}
): Promise<InstantlyFetchResult<InstantlyStepRow[]>> {
  const query = new URLSearchParams({ campaign_id: campaignId, include_opportunities_count: 'true' });
  const result = await instantlyFetch<unknown>(`/campaigns/analytics/steps?${query.toString()}`, apiKey, options);
  if (!result.ok) return result;
  return {
    ok: true,
    data: toRecordList(result.data)
      .map(mapStepRow)
      .filter((r): r is InstantlyStepRow => r !== null),
  };
}

/** Every sending account (cursor paged), with a whitelisted raw payload. */
export async function fetchInstantlyAccounts(
  apiKey: string,
  options: InstantlyRequestOptions = {}
): Promise<InstantlyFetchResult<InstantlyDetailed<InstantlyAccount>[]>> {
  const accounts = new Map<string, InstantlyDetailed<InstantlyAccount>>();
  let cursor: string | null = null;
  for (let page = 0; page < ACCOUNT_MAX_PAGES; page++) {
    const query = new URLSearchParams({ limit: String(ACCOUNT_PAGE_SIZE) });
    if (cursor) query.set('starting_after', cursor);
    const result = await instantlyFetch<unknown>(`/accounts?${query.toString()}`, apiKey, options);
    if (!result.ok) return result;
    const parsed = parseCampaignListPage(result.data);
    let added = 0;
    for (const raw of parsed.items) {
      const item = mapAccountRow(raw);
      if (item && !accounts.has(item.email)) {
        accounts.set(item.email, { item, raw: safeAccountRaw(raw) });
        added++;
      }
    }
    if (added === 0 || !parsed.nextCursor) break;
    cursor = parsed.nextCursor;
  }
  return { ok: true, data: [...accounts.values()] };
}

/** Campaign sending per account per day. */
export async function fetchInstantlyAccountDaily(
  apiKey: string,
  emails: string[],
  startDate: string,
  endDate: string,
  options: InstantlyRequestOptions = {}
): Promise<InstantlyFetchResult<InstantlyAccountDay[]>> {
  const days: InstantlyAccountDay[] = [];
  for (const batch of batches(emails, ACCOUNT_BATCH_SIZE)) {
    const query = new URLSearchParams({ start_date: startDate, end_date: endDate });
    for (const e of batch) query.append('emails', e);
    const result = await instantlyFetch<unknown>(`/accounts/analytics/daily?${query.toString()}`, apiKey, options);
    if (!result.ok) return result;
    for (const raw of toRecordList(result.data)) {
      const day = mapAccountDayRow(raw);
      if (day) days.push(day);
    }
  }
  return { ok: true, data: days };
}

/** Warmup activity per account per day, plus each account's warmup health score. */
export async function fetchInstantlyWarmup(
  apiKey: string,
  emails: string[],
  options: InstantlyRequestOptions = {}
): Promise<InstantlyFetchResult<InstantlyWarmupReport>> {
  const report: InstantlyWarmupReport = { days: [], healthScores: new Map() };
  for (const batch of batches(emails, ACCOUNT_BATCH_SIZE)) {
    const result = await instantlyFetch<unknown>('/accounts/warmup-analytics', apiKey, options, { emails: batch });
    if (!result.ok) return result;
    const part = mapWarmupReport(result.data);
    report.days.push(...part.days);
    for (const [email, score] of part.healthScores) report.healthScores.set(email, score);
  }
  return { ok: true, data: report };
}

/** SPF / DKIM / DMARC / MX of the accounts' sending domains. */
export async function fetchInstantlyDomainVitals(
  apiKey: string,
  emails: string[],
  options: InstantlyRequestOptions = {}
): Promise<InstantlyFetchResult<InstantlyDomainVitals[]>> {
  const byDomain = new Map<string, InstantlyDomainVitals>();
  for (const batch of batches(emails, ACCOUNT_BATCH_SIZE)) {
    const result = await instantlyFetch<unknown>('/accounts/test/vitals', apiKey, options, { accounts: batch });
    if (!result.ok) return result;
    for (const v of mapDomainVitals(isRecord(result.data) ? result.data : {})) byDomain.set(v.domain, v);
  }
  return { ok: true, data: [...byDomain.values()] };
}

// ── emails & leads (reply sync) ─────────────────────────────────────────────
// GET /emails has its own, much tighter rate limit (20 requests per minute)
// than the rest of the API. Every email request of a process waits for its
// slot here, per API key, so requests are spaced below that limit no matter
// how many callers there are in this instance; the database allows one reply
// sync per integration at a time across instances. A 429 is never retried
// here: the caller stops and continues on a later sync.

/** Instantly's documented limit for GET /emails. */
export const EMAIL_REQUESTS_PER_MINUTE = 20;
/** Spacing between email requests per API key (≈ 19 per minute). */
export const EMAIL_REQUEST_SPACING_MS = 3_200;
export const EMAIL_PAGE_SIZE = 100;

const emailSlots = new Map<string, number>();
const keyId = (apiKey: string) => createHash('sha256').update(apiKey).digest('hex').slice(0, 16);

export interface EmailRequestOptions extends InstantlyRequestOptions {
  /** Override the spacing (tests). */
  spacingMs?: number;
  /** Clock and sleep (tests). */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** Waits until this API key may make its next email request, and reserves that slot. */
export async function waitForEmailSlot(apiKey: string, options: EmailRequestOptions = {}): Promise<void> {
  const spacing = options.spacingMs ?? EMAIL_REQUEST_SPACING_MS;
  const now = options.now ?? Date.now;
  const id = keyId(apiKey);
  const at = Math.max(now(), emailSlots.get(id) ?? 0);
  emailSlots.set(id, at + spacing);
  const wait = at - now();
  if (wait > 0) await (options.sleep ?? sleep)(wait);
}

export interface InstantlyEmailPage {
  emails: InstantlyEmail[];
  /** Rows on the page (including any that could not be mapped). */
  rows: number;
  nextCursor: string | null;
}

/**
 * One page of received emails created at or after `since`, oldest first.
 * Never retries a 429 (the caller stops); network and 5xx errors are retried once.
 */
export async function fetchInstantlyReceivedEmailPage(
  apiKey: string,
  params: { since: string; cursor?: string | null; limit?: number },
  options: EmailRequestOptions = {}
): Promise<InstantlyFetchResult<InstantlyEmailPage>> {
  const query = new URLSearchParams({
    limit: String(params.limit ?? EMAIL_PAGE_SIZE),
    email_type: 'received',
    sort_order: 'asc',
    min_timestamp_created: params.since,
  });
  if (params.cursor) query.set('starting_after', params.cursor);
  for (let attempt = 0; ; attempt++) {
    await waitForEmailSlot(apiKey, options);
    const result = await instantlyFetch<unknown>(`/emails?${query.toString()}`, apiKey, { ...options, maxRetries: 0 });
    if (!result.ok) {
      if (attempt < 1 && result.error.status !== 429 && isRetryable(result.error.status)) continue;
      return result;
    }
    const page = parseCampaignListPage(result.data);
    return {
      ok: true,
      data: {
        emails: page.items.map(mapEmailRow).filter((e): e is InstantlyEmail => e !== null),
        rows: page.items.length,
        nextCursor: page.nextCursor,
      },
    };
  }
}

export const LEAD_BATCH_SIZE = 100;

/** Name, company and current interest status of the given leads (by Instantly lead id). */
export async function fetchInstantlyLeads(
  apiKey: string,
  ids: string[],
  options: InstantlyRequestOptions = {}
): Promise<InstantlyFetchResult<InstantlyLead[]>> {
  const out = new Map<string, InstantlyLead>();
  for (const batch of batches([...new Set(ids)], LEAD_BATCH_SIZE)) {
    const result = await instantlyFetch<unknown>('/leads/list', apiKey, options, { ids: batch, limit: batch.length });
    if (!result.ok) return result;
    for (const raw of toRecordList(result.data)) {
      const lead = mapLeadRow(raw);
      // only the leads asked for, whatever the endpoint returns
      if (lead && batch.includes(lead.id)) out.set(lead.id, lead);
    }
  }
  return { ok: true, data: [...out.values()] };
}

/**
 * Validates an Instantly API key with a safe authenticated read. Intended to
 * run BEFORE encrypting/persisting a key.
 */
export async function validateInstantlyKey(
  apiKey: string,
  options: InstantlyRequestOptions = {}
): Promise<InstantlyFetchResult<InstantlyCampaign[]>> {
  return fetchInstantlyCampaignList(apiKey, options);
}

export function userSafeInstantlyError(error: InstantlyApiError, fallback: string): string {
  switch (error.status) {
    case 401:
      return 'Your Instantly API key is invalid or revoked.';
    case 403:
      return 'Your Instantly API key lacks permission to access this account.';
    case 429:
      return 'Instantly rate limit reached. Please try again shortly.';
    case 0:
      return 'Could not reach Instantly. Please try again.';
    default:
      return error.status >= 500 ? 'Instantly is temporarily unavailable.' : fallback;
  }
}

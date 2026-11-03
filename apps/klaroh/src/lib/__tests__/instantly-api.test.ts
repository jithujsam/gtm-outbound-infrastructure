import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPAIGN_MAX_PAGES,
  CAMPAIGN_PAGE_SIZE,
  fetchInstantlyAnalytics,
  fetchInstantlyCampaignList,
  instantlyFetch,
  userSafeInstantlyError,
  validateInstantlyKey,
} from '../instantly-api.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> } | Error;

/** Installs a fake fetch that replays `replies` in order and records requested URLs. */
function stubFetch(replies: Reply[]): { urls: string[]; headers: Array<Record<string, string>> } {
  const calls = { urls: [] as string[], headers: [] as Array<Record<string, string>> };
  let i = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.urls.push(String(input));
    calls.headers.push((init?.headers ?? {}) as Record<string, string>);
    const reply = replies[Math.min(i++, replies.length - 1)];
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status ?? 200,
      headers: reply.headers,
    });
  }) as typeof fetch;
  return calls;
}

const NO_RETRY = { maxRetries: 0 };
const FAST_RETRY = { maxRetries: 2, retryBaseDelayMs: 1 };

const campaigns = (from: number, count: number) =>
  Array.from({ length: count }, (_, k) => ({ id: `c${from + k}`, name: `Campaign ${from + k}` }));

test('instantlyFetch sends a Bearer token and hits the v2 base URL', async () => {
  const calls = stubFetch([{ body: [] }]);
  const res = await instantlyFetch('/campaigns', 'key-123', NO_RETRY);
  assert.equal(res.ok, true);
  assert.equal(calls.urls[0], 'https://api.instantly.ai/api/v2/campaigns');
  assert.equal(calls.headers[0].Authorization, 'Bearer key-123');
});

test('instantlyFetch does not retry client errors such as 401', async () => {
  const calls = stubFetch([{ status: 401, body: { message: 'bad key' } }]);
  const res = await instantlyFetch('/campaigns', 'k', FAST_RETRY);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.status, 401);
    assert.equal(res.error.message, 'bad key');
  }
  assert.equal(calls.urls.length, 1);
});

test('instantlyFetch retries 429 then succeeds', async () => {
  const calls = stubFetch([{ status: 429, body: {} }, { status: 200, body: { ok: 1 } }]);
  const res = await instantlyFetch('/campaigns', 'k', FAST_RETRY);
  assert.equal(res.ok, true);
  assert.equal(calls.urls.length, 2);
});

test('instantlyFetch gives up after maxRetries and reports the last error', async () => {
  const calls = stubFetch([{ status: 503, body: {} }]);
  const res = await instantlyFetch('/campaigns', 'k', FAST_RETRY);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.status, 503);
  assert.equal(calls.urls.length, 3);
});

test('instantlyFetch maps network failures and timeouts to status 0', async () => {
  const timeout = new Error('timed out');
  timeout.name = 'TimeoutError';
  stubFetch([timeout]);
  const res = await instantlyFetch('/campaigns', 'k', NO_RETRY);
  assert.equal(res.ok, false);
  if (!res.ok) assert.deepEqual(res.error, { status: 0, message: 'Instantly request timed out' });

  stubFetch([new Error('ECONNRESET')]);
  const res2 = await instantlyFetch('/campaigns', 'k', NO_RETRY);
  if (!res2.ok) assert.deepEqual(res2.error, { status: 0, message: 'ECONNRESET' });
});

test('instantlyFetch truncates oversized error bodies', async () => {
  stubFetch([{ status: 400, body: { message: 'x'.repeat(1000) } }]);
  const res = await instantlyFetch('/campaigns', 'k', NO_RETRY);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.message.length, 300);
});

test('campaign list follows next_starting_after cursors across pages', async () => {
  const calls = stubFetch([
    { body: { items: campaigns(0, 100), next_starting_after: 'cursor-1' } },
    { body: { items: campaigns(100, 30) } },
  ]);
  const res = await fetchInstantlyCampaignList('k', NO_RETRY);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.data.length, 130);
    assert.equal(res.data[0].campaign_id, 'c0');
    assert.equal(res.data[129].campaign_id, 'c129');
  }
  assert.equal(calls.urls.length, 2);
  assert.match(calls.urls[0], /limit=100/);
  assert.doesNotMatch(calls.urls[0], /starting_after/);
  assert.match(calls.urls[1], /starting_after=cursor-1/);
});

test('REGRESSION: a full final page with no cursor must not re-fetch page one', async () => {
  // Cursor API that ignores `offset`: after the last full page it would return
  // the first page again. Paging must stop and results must not be duplicated.
  const page1 = campaigns(0, CAMPAIGN_PAGE_SIZE);
  const calls = stubFetch([
    { body: { items: page1, next_starting_after: 'cur' } },
    { body: { items: campaigns(100, CAMPAIGN_PAGE_SIZE) } }, // full, no cursor
    { body: { items: page1 } }, // what an offset-ignoring API would hand back
  ]);
  const res = await fetchInstantlyCampaignList('k', NO_RETRY);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.data.length, 200);
    assert.equal(new Set(res.data.map((c) => c.campaign_id)).size, 200);
  }
  assert.ok(calls.urls.length <= 3);
});

test('legacy offset paging continues while pages are full and stops on a short page', async () => {
  const calls = stubFetch([
    { body: campaigns(0, 100) },
    { body: campaigns(100, 40) },
  ]);
  const res = await fetchInstantlyCampaignList('k', NO_RETRY);
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.data.length, 140);
  assert.equal(calls.urls.length, 2);
  assert.match(calls.urls[1], /offset=100/);
});

test('campaign list never exceeds the page ceiling', async () => {
  let n = 0;
  globalThis.fetch = (async () => {
    n++;
    return new Response(
      JSON.stringify({ items: campaigns(n * 1000, 100), next_starting_after: `c-${n}` }),
      { status: 200 }
    );
  }) as typeof fetch;
  const res = await fetchInstantlyCampaignList('k', NO_RETRY);
  assert.equal(res.ok, true);
  assert.equal(n, CAMPAIGN_MAX_PAGES);
});

test('campaign list surfaces an error from any page', async () => {
  stubFetch([
    { body: { items: campaigns(0, 100), next_starting_after: 'cur' } },
    { status: 429, body: {} },
  ]);
  const res = await fetchInstantlyCampaignList('k', NO_RETRY);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.status, 429);
});

test('analytics: single-campaign path is URL-encoded; rows without ids are dropped', async () => {
  const calls = stubFetch([{ body: [{ campaign_id: 'a b', contacted_count: 5 }, { leads_count: 1 }] }]);
  const res = await fetchInstantlyAnalytics('k', 'a b', NO_RETRY);
  assert.match(calls.urls[0], /\/campaigns\/analytics\?id=a%20b$/);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.data.length, 1);
    assert.equal(res.data[0].contacted_count, 5);
  }
});

test('analytics: no id requests every campaign', async () => {
  const calls = stubFetch([{ body: [] }]);
  await fetchInstantlyAnalytics('k', undefined, NO_RETRY);
  assert.match(calls.urls[0], /\/campaigns\/analytics$/);
});

test('validateInstantlyKey reports 401 for a revoked key', async () => {
  stubFetch([{ status: 401, body: {} }]);
  const res = await validateInstantlyKey('revoked', NO_RETRY);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(userSafeInstantlyError(res.error, 'fallback'), 'Your Instantly API key is invalid or revoked.');
});

test('userSafeInstantlyError never leaks upstream detail', () => {
  assert.equal(userSafeInstantlyError({ status: 403, message: 'secret' }, 'f'), 'Your Instantly API key lacks permission to access this account.');
  assert.equal(userSafeInstantlyError({ status: 429, message: 'secret' }, 'f'), 'Instantly rate limit reached. Please try again shortly.');
  assert.equal(userSafeInstantlyError({ status: 0, message: 'ECONNRESET' }, 'f'), 'Could not reach Instantly. Please try again.');
  assert.equal(userSafeInstantlyError({ status: 502, message: 'secret' }, 'f'), 'Instantly is temporarily unavailable.');
  assert.equal(userSafeInstantlyError({ status: 404, message: 'secret' }, 'fallback text'), 'fallback text');
});

// End-to-end: the real V2 onboarding / import / sync code against PostgreSQL
// through PostgREST, with workspace users' JWTs (RLS enforced) and the service
// role (credentials, cron). Only api.instantly.ai is faked. Run via
// supabase/tests/e2e/run.sh.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PostgrestClient } from '@supabase/postgrest-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { encryptApiKey } from '../../../src/lib/encryption.ts';
import {
  disconnectIntegration,
  getDecryptedIntegrationKey,
  getEnabledIntegration,
  getWorkspaceIntegration,
  upsertIntegrationKey,
} from '../../../src/lib/data/integration-secrets.ts';
import { getIntegrationSummaries } from '../../../src/lib/data/integration-summary.ts';
import { getWorkspaceSyncStatuses } from '../../../src/lib/data/integration-sync.ts';
import { loadSyncStatuses } from '../../../src/lib/sync/sync-status.ts';
import {
  discoverProviderCampaigns,
  importCampaignsForClient,
  MANUAL_SYNC_MIN_INTERVAL_MS,
  syncIntegrationById,
  syncWorkspace,
} from '../../../src/lib/sync/workspace-sync.ts';
import { getClientCampaigns } from '../../../src/lib/data/campaigns.ts';
import { portalCampaignFromRow } from '../../../src/lib/analytics/portal.ts';
import { loadCampaignData, loadCampaignDetail, loadInfrastructure, parseFilters } from '../../../src/lib/data/analytics.ts';
import { campaignsMetricSet, readMetric } from '../../../src/lib/analytics/metrics.ts';
import { stepViews } from '../../../src/lib/analytics/steps.ts';
import { infraSummary, mailboxViews, toDay, warmupTotals } from '../../../src/lib/analytics/infrastructure.ts';
import { syncRepliesById } from '../../../src/lib/sync/workspace-replies.ts';
import { loadInbox, loadReplySync, loadThread } from '../../../src/lib/data/inbox.ts';
import { filterThreads } from '../../../src/lib/analytics/replies.ts';

const URL_BASE = process.env.E2E_URL!;
const SECRET = process.env.E2E_JWT_SECRET!;

// Fixture ids (supabase/tests/v1_fixture.sql)
const OWNER1 = 'f1111111-0000-0000-0000-000000000001';
const OWNER2 = 'f2222222-0000-0000-0000-000000000002';
const WS1 = 'fa000000-0000-0000-0000-000000000001';
const ACME = 'fc000000-0000-0000-0000-000000000001';
const GLOBEX = 'fc000000-0000-0000-0000-000000000002';
const INITECH = 'fc000000-0000-0000-0000-000000000003'; // workspace 2
const WS2 = 'fa000000-0000-0000-0000-000000000002';
const INTEGRATION = 'f1000000-0000-0000-0000-000000000001';
const X_ID = 'fd000000-0000-0000-0000-00000000000a';
const API_KEY = 'instantly-e2e-key-000000000000';

function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims })}`;
  return `${body}.${crypto.createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}

function client(token?: string): SupabaseClient {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  return new PostgrestClient(URL_BASE, { headers }) as unknown as SupabaseClient;
}

const owner1 = client(jwt({ role: 'authenticated', sub: OWNER1 }));
const owner2 = client(jwt({ role: 'authenticated', sub: OWNER2 }));
const service = client(jwt({ role: 'service_role' }));
const anon = client();

/** The public portal as a visitor with the client's private link sees it (token → get_client_portal). */
async function portalCampaigns(clientId: string) {
  const { data: p } = await service.from('client_portals').select('access_token').eq('client_id', clientId).single();
  const { data, error } = await anon.rpc('get_client_portal', { p_token: p!.access_token });
  assert.equal(error, null);
  return ((data?.campaigns ?? []) as Record<string, unknown>[]).map(portalCampaignFromRow);
}

// ── fake Instantly API ────────────────────────────────────────────────────────
const instantly = {
  failStatus: 0,
  campaigns: [] as Record<string, unknown>[],
  analytics: [] as Record<string, unknown>[],
  requests: [] as string[],
  emails: [] as Record<string, unknown>[],
  leads: [] as Record<string, unknown>[],
  emailFailStatus: 0,
};

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!url.startsWith('https://api.instantly.ai/')) return realFetch(input, init);
  instantly.requests.push(url);
  const auth = new Headers(init?.headers).get('authorization');
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  if (auth !== `Bearer ${API_KEY}`) return json(401, { message: 'Invalid API key' });
  if (instantly.failStatus) return json(instantly.failStatus, { message: 'provider error' });
  const u = new URL(url);
  if (u.pathname.endsWith('/campaigns/analytics')) return json(200, instantly.analytics);
  if (u.pathname.endsWith('/campaigns/analytics/overview')) {
    return u.searchParams.get('id') === 'inst-x'
      ? json(200, { total_opportunities: 10, total_interested: 12, total_meeting_booked: 4, total_meeting_completed: 3, total_closed: 1 })
      : json(200, {});
  }
  if (u.pathname.endsWith('/campaigns/analytics/steps')) {
    return u.searchParams.get('campaign_id') === 'inst-x'
      ? json(200, [
          { step: '0', variant: '0', sent: 600, unique_replies: 30 },
          { step: '0', variant: '1', sent: 580, unique_replies: 12 },
          { step: '1', variant: '0', sent: 400, unique_replies: 8 },
        ])
      : json(200, []);
  }
  if (u.pathname.endsWith('/accounts/analytics/daily')) {
    return json(200, u.searchParams.getAll('emails').flatMap((e) => [
      { date: today, email_account: e, sent: 40, bounced: 1, replies: 2 },
      { date: yesterday, email_account: e, sent: 45, bounced: 0, replies: 1 },
    ]));
  }
  if (u.pathname.endsWith('/accounts/warmup-analytics')) {
    const emails = (JSON.parse(String(init?.body)) as { emails: string[] }).emails;
    return json(200, {
      email_date_data: Object.fromEntries(emails.map((e) => [e, { [today]: { sent: 30, landed_inbox: 29, landed_spam: 1, received: 28 } }])),
      aggregate_data: Object.fromEntries(emails.map((e) => [e, { health_score: 97 }])),
    });
  }
  if (u.pathname.endsWith('/accounts/test/vitals')) {
    return json(200, { success_list: [{ domain: 'send.example', spf: true, dkim: true, dmarc: true, mx: true }], failure_list: [] });
  }
  if (u.pathname.endsWith('/accounts')) {
    return json(200, {
      items: [
        { email: 'a@send.example', status: 1, warmup_status: 1, stat_warmup_score: 98, daily_limit: 50, smtp_password: 'never-store-me', imap_password: 'nor-me' },
        { email: 'b@send.example', status: 1, warmup_status: 1, stat_warmup_score: 95, daily_limit: 50 },
        { email: 'c@send.example', status: -3, warmup_status: 0, daily_limit: 50 },
        { email: 'unrelated@other.example', status: 1, warmup_status: 1 },
      ],
    });
  }
  if (u.pathname.endsWith('/emails')) {
    if (instantly.emailFailStatus) return json(instantly.emailFailStatus, { message: 'Too many requests' });
    const since = u.searchParams.get('min_timestamp_created') ?? '';
    const pool = instantly.emails
      .filter((e) => String(e.timestamp_created) >= since)
      .sort((a, b) => String(a.timestamp_created).localeCompare(String(b.timestamp_created)));
    const size = Number(u.searchParams.get('limit') ?? 100);
    const from = u.searchParams.get('starting_after') ? pool.findIndex((e) => e.id === u.searchParams.get('starting_after')) + 1 : 0;
    const items = pool.slice(from, from + size);
    return json(200, { items, next_starting_after: from + size < pool.length ? items[items.length - 1].id : null });
  }
  if (u.pathname.endsWith('/leads/list')) {
    const ids = (JSON.parse(String(init?.body)) as { ids: string[] }).ids;
    return json(200, { items: instantly.leads.filter((l) => ids.includes(l.id as string)) });
  }
  // cursor paging, 100 per page
  const limit = Number(u.searchParams.get('limit') ?? 100);
  const after = u.searchParams.get('starting_after');
  const start = after ? instantly.campaigns.findIndex((c) => c.id === after) + 1 : 0;
  const items = instantly.campaigns.slice(start, start + limit);
  const more = start + limit < instantly.campaigns.length;
  return json(200, { items, next_starting_after: more ? items[items.length - 1].id : null });
}) as typeof fetch;

function setInstantly(xSent: number, xName = 'Q3 Outbound X') {
  const bulk = Array.from({ length: 120 }, (_, i) => ({ id: `bulk-${String(i).padStart(3, '0')}`, name: `Bulk ${i}`, status: 1 }));
  instantly.campaigns = [
    { id: 'inst-x', name: xName, status: 1, email_list: ['a@send.example', 'b@send.example', 'C@send.example'], daily_limit: 150, sequences: [{ copy: 'secret' }] },
    { id: 'inst-y', name: 'Y campaign', status: 2 },
    { id: 'inst-w', name: 'Brand new W', status: -1 },
    ...bulk,
  ];
  instantly.analytics = [
    { campaign_id: 'inst-x', leads_count: 1300, contacted_count: 950, emails_sent_count: xSent, reply_count_unique: 50, total_opportunities: 10, new_field: 'kept' },
    { campaign_id: 'inst-y', leads_count: 100, emails_sent_count: 170 },
    { campaign_id: 'inst-w', leads_count: 5, emails_sent_count: 0 },
    { campaign_id: 'deleted-in-instantly', emails_sent_count: 999 },
  ];
}

const integration = { id: INTEGRATION, workspace_id: WS1, provider: 'instantly' };
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filter = (q: any) => PromiseLike<{ count: number | null; error: unknown }>;
async function count(table: string, filter: Filter = (q) => q) {
  const { count: n, error } = await filter(service.from(table).select('*', { count: 'exact', head: true }));
  assert.equal(error, null);
  return n ?? 0;
}
const storedExternalIds = async () =>
  ((await service.from('campaigns_v2').select('external_id').eq('workspace_id', WS1)).data ?? [])
    .map((r) => r.external_id as string)
    .sort();
const importFor = (clientId: string, externalIds: string[], db = owner1, workspaceId = WS1) =>
  importCampaignsForClient({ db, secrets: service, workspaceId, clientId, integration, externalIds });

before(async () => {
  const { error } = await service
    .from('integrations')
    .update({ api_key_encrypted: encryptApiKey(API_KEY) })
    .eq('id', INTEGRATION);
  assert.equal(error, null);
  setInstantly(2600);
});

test('existing clients: dashboard and portal read V2 numbers identical to the V1 archive', async () => {
  const { data: v1 } = await service
    .from('campaigns')
    .select('name, external_name, emails_sent_count, leads_count, contacted_count, reply_count_unique, open_count_unique, total_opportunities')
    .eq('client_id', ACME)
    .eq('tool', 'instantly')
    .order('external_name');
  const owner = (await getClientCampaigns(owner1, ACME)).sort((a, b) => a.name.localeCompare(b.name));
  const portal = (await portalCampaigns(ACME)).sort((a, b) => a.name.localeCompare(b.name));
  const pick = (c: { name: string; emails_sent: number | null; leads: number | null; contacted: number | null; replies_unique: number | null; opens_unique: number | null; opportunities: number | null }) =>
    [c.name, c.emails_sent, c.leads, c.contacted, c.replies_unique, c.opens_unique, c.opportunities];
  // V2 shows the provider's name (V1 kept it as external_name next to the agency's own name)
  const expected = v1!.map((r) => [r.external_name ?? r.name, r.emails_sent_count, r.leads_count, r.contacted_count, r.reply_count_unique, r.open_count_unique, r.total_opportunities]);
  assert.deepEqual(owner.map(pick), expected);
  // the portal carries only the counts the shared metric layer uses
  assert.deepEqual(
    portal.map((c) => [c.name, c.counts.emailsSent, c.counts.humanReplies, c.counts.positive]),
    v1!.map((r) => [r.external_name ?? r.name, r.emails_sent_count, r.reply_count_unique, r.total_opportunities])
  );
  const { error: slugPath } = await anon.rpc('get_public_client_campaigns', { p_client_id: ACME });
  assert.notEqual(slugPath, null, 'the old id-based portal read is closed to visitors');
  assert.equal(owner[0].status, 'active');
  assert.equal(owner[0].unavailable_since, null);
  assert.equal((await getClientCampaigns(owner2, ACME)).length, 0, 'other workspaces see nothing');
});

test('the existing integration is found by status only; the browser-facing client cannot read the key', async () => {
  const found = await getEnabledIntegration(owner1, WS1, 'instantly');
  assert.equal(found?.id, INTEGRATION);
  assert.equal(found?.has_credential, true);
  assert.ok(!('api_key_encrypted' in (found ?? {})));
  const { error } = await owner1.from('integrations').select('api_key_encrypted');
  assert.notEqual(error, null, 'api_key_encrypted is not readable with a user JWT');
  const { error: writeErr } = await owner1.from('integrations').update({ enabled: false }).eq('id', INTEGRATION);
  assert.notEqual(writeErr, null, 'users cannot write integrations directly');
  assert.equal(await getDecryptedIntegrationKey(owner1, integration), null, 'a user client cannot decrypt');
  assert.equal(await getDecryptedIntegrationKey(service, integration), API_KEY);
  assert.equal(
    await getDecryptedIntegrationKey(service, { id: INTEGRATION, workspace_id: WS2 }),
    null,
    'credential lookups are bound to the session workspace'
  );
});

test('discovery lists the whole provider account but stores nothing', async () => {
  const before = await storedExternalIds();
  const res = await discoverProviderCampaigns(service, integration);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.campaigns.length, 123, 'both pages fetched');
  const x = res.campaigns.find((c) => c.external_id === 'inst-x')!;
  assert.equal(x.emails_sent, 2600);
  assert.ok(!('sequences' in x), 'no raw provider payload is exposed');
  assert.deepEqual(await storedExternalIds(), before);
  assert.deepEqual(before, ['inst-x', 'inst-y'], 'only the migrated (client-linked) campaigns exist');
});

test('manual sync only touches campaigns linked to a client', async () => {
  const out = await syncIntegrationById(owner1, service, integration, 'manual');
  assert.equal(out.status, 'success', JSON.stringify(out));
  if (out.status !== 'success') return;
  assert.equal(out.campaignsSeen, 2);
  assert.equal(out.campaignsUpserted, 2);
  assert.equal(out.statsWritten, 2);
  assert.deepEqual(await storedExternalIds(), ['inst-x', 'inst-y'], 'the other 121 provider campaigns are not imported');

  const { data: x } = await service.from('campaigns_v2').select('id, name, display_name, sender_count, provider_raw').eq('external_id', 'inst-x').single();
  assert.equal(x!.id, X_ID, 'the migrated campaign is updated in place');
  assert.equal(x!.name, 'Q3 Outbound X', 'the provider name is the campaign name');
  assert.equal(x!.display_name, null, "the agency's old V1 name is no longer a display override");
  assert.equal(x!.sender_count, 3);
  assert.equal((x!.provider_raw as Record<string, unknown>).sequences, undefined, 'email copy is not stored');

  const { data: history } = await service.from('campaign_stats').select('stat_date, emails_sent, provider_raw').eq('campaign_id', X_ID).order('stat_date');
  assert.deepEqual(history!.map((h) => `${h.stat_date}=${h.emails_sent}`), ['2026-09-30=2400', `${today}=2600`], 'migrated snapshot kept, new day added');
  assert.equal((history![1].provider_raw as Record<string, unknown>).new_field, 'kept');

  const { data: run } = await service.from('sync_runs').select('*').eq('id', out.runId!).single();
  assert.deepEqual([run!.status, run!.triggered_by, run!.campaigns_upserted, run!.stats_written], ['success', 'manual', 2, 2]);
});

test('import: rejects an empty selection', async () => {
  const res = await importFor(GLOBEX, []);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 400);
});

test('import: only the selected campaigns become client data; the dashboard populates', async () => {
  const res = await importFor(GLOBEX, ['inst-w', 'bulk-005', 'does-not-exist']);
  assert.equal(res.ok, true, JSON.stringify(res));
  if (!res.ok) return;
  assert.equal(res.linked, 2);
  assert.deepEqual(res.notFound, ['does-not-exist']);
  assert.deepEqual(await storedExternalIds(), ['bulk-005', 'inst-w', 'inst-x', 'inst-y']);

  const globex = await getClientCampaigns(owner1, GLOBEX);
  assert.deepEqual(globex.map((c) => c.provider_name).sort(), ['Brand new W', 'Bulk 5', 'Q3 Outbound X'].sort());
  const w = globex.find((c) => c.provider_name === 'Brand new W')!;
  assert.equal(w.emails_sent, 0);
  assert.equal(w.leads, 5);
  assert.equal(w.status, 'error');
  assert.equal(w.captured_at?.slice(0, 10), today, "today's snapshot is written at import");
  assert.equal((await portalCampaigns(GLOBEX)).length, 3, 'the public portal shows them too');

  const { data: run } = await service.from('sync_runs').select('triggered_by, campaigns_upserted').eq('integration_id', INTEGRATION).order('started_at', { ascending: false }).limit(1).single();
  assert.deepEqual(run, { triggered_by: 'attach', campaigns_upserted: 2 });
});

test('import: a second client reuses the same integration and campaign rows (no duplicates)', async () => {
  const before = await count('campaigns_v2');
  const res = await importFor(ACME, ['inst-w', 'inst-y']);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.linked, 1, 'inst-w newly linked');
  assert.equal(res.alreadyLinked, 1, 'inst-y was already on Acme');
  assert.equal(await count('campaigns_v2'), before, 'no new campaign rows');
  const { data: w } = await service.from('campaigns_v2').select('id').eq('external_id', 'inst-w').single();
  assert.equal(await count('campaign_client_map', (q) => q.eq('campaign_id', w!.id)), 2, 'one campaign, two clients');
  const again = await importFor(ACME, ['inst-w']);
  assert.equal(again.ok && again.linked === 0 && again.alreadyLinked === 1, true, 'importing twice is a no-op');
});

test('later syncs keep to the selected scope; unselected campaigns never sync', async () => {
  setInstantly(2700, 'Q3 Outbound X (renamed in Instantly)');
  const statsBefore = await count('campaign_stats');
  const out = await syncIntegrationById(owner1, service, integration, 'manual');
  assert.equal(out.status, 'success');
  if (out.status !== 'success') return;
  assert.equal(out.campaignsSeen, 4);
  assert.deepEqual(await storedExternalIds(), ['bulk-005', 'inst-w', 'inst-x', 'inst-y']);
  assert.equal(await count('campaign_stats'), statsBefore, 'same day: snapshots refreshed, not duplicated');
  const { data: snap } = await service.from('campaign_stats').select('emails_sent').eq('campaign_id', X_ID).eq('stat_date', today).single();
  assert.equal(snap!.emails_sent, 2700);
  const { data: x } = await service.from('campaigns_v2').select('name, display_name').eq('id', X_ID).single();
  assert.deepEqual(x, { name: 'Q3 Outbound X (renamed in Instantly)', display_name: null });
  const shown = (await getClientCampaigns(owner1, ACME)).find((c) => c.id === X_ID)!;
  assert.equal(shown.name, 'Q3 Outbound X (renamed in Instantly)', 'the dashboard shows the provider rename');
  const { data: history } = await service.from('campaign_stats').select('stat_date').eq('campaign_id', X_ID).order('stat_date');
  assert.deepEqual(history!.map((h) => h.stat_date), ['2026-09-30', today], 'the rename keeps every snapshot');
});

test('a manual refresh right after a successful sync is skipped (no extra API calls)', async () => {
  const before = instantly.requests.length;
  const outs = await syncWorkspace(owner1, service, WS1, 'manual', MANUAL_SYNC_MIN_INTERVAL_MS);
  assert.deepEqual(outs.map((o) => o.status), ['skipped']);
  assert.equal(instantly.requests.length, before);
});

test('removing a campaign from its last client deletes it and its history; a re-import starts fresh', async () => {
  const { data: b } = await service.from('campaigns_v2').select('id').eq('external_id', 'bulk-005').single();
  await service.from('campaign_stats').insert({ campaign_id: b!.id, workspace_id: WS1, stat_date: '2026-09-01', emails_sent: 12 });
  assert.ok((await count('campaign_stats', (q) => q.eq('campaign_id', b!.id))) > 0, 'had history');
  const { error } = await owner1.from('campaign_client_map').delete().eq('campaign_id', b!.id).eq('client_id', GLOBEX);
  assert.equal(error, null);
  assert.equal(await count('campaigns_v2', (q) => q.eq('id', b!.id)), 0, 'the campaign row is deleted');
  assert.equal(await count('campaign_stats', (q) => q.eq('campaign_id', b!.id)), 0, 'its statistics are deleted');
  const out = await syncIntegrationById(owner1, service, integration, 'cron');
  assert.equal(out.status === 'success' && out.campaignsSeen, 3, 'out of the sync scope');
  assert.ok(!(await storedExternalIds()).includes('bulk-005'));

  const again = await importFor(GLOBEX, ['bulk-005']);
  assert.equal(again.ok, true, 'the provider campaign can be imported again');
  const { data: fresh } = await service.from('campaigns_v2').select('id').eq('external_id', 'bulk-005').single();
  assert.notEqual(fresh!.id, b!.id, 'as a new campaign');
  await owner1.from('campaign_client_map').delete().eq('campaign_id', fresh!.id);
});

test('deleting a client deletes the campaigns only it used, keeps shared ones', async () => {
  const { data: shared } = await service.from('campaigns_v2').select('id').eq('external_id', 'inst-x').single();
  const before = await count('campaign_client_map', (q) => q.eq('campaign_id', shared!.id));
  assert.ok(before >= 2, 'inst-x is shared by Acme and Globex');
  const { data: temp, error } = await owner1.from('clients').insert({ workspace_id: WS1, name: 'Temp client', slug: 'temp-client-e2e' }).select('id').single();
  assert.equal(error, null);
  assert.equal((await importFor(temp!.id, ['bulk-007', 'inst-x'])).ok, true);
  const { data: only } = await service.from('campaigns_v2').select('id').eq('external_id', 'bulk-007').single();
  const { data: gone } = await owner1.from('clients').delete().eq('id', temp!.id).select('id');
  assert.equal(gone!.length, 1);
  assert.equal(await count('campaigns_v2', (q) => q.eq('id', only!.id)), 0, 'its own campaign is deleted');
  assert.equal(await count('campaign_stats', (q) => q.eq('campaign_id', only!.id)), 0);
  assert.equal(await count('campaigns_v2', (q) => q.eq('id', shared!.id)), 1, 'the shared campaign stays');
  assert.equal(await count('campaign_client_map', (q) => q.eq('campaign_id', shared!.id)), before);
});

test('a selected campaign deleted at the provider is flagged, keeps its history, and stays on the dashboard', async () => {
  const saved = instantly.campaigns;
  instantly.campaigns = saved.filter((c) => c.id !== 'inst-y');
  const out = await syncIntegrationById(owner1, service, integration, 'cron');
  assert.equal(out.status, 'success');
  if (out.status !== 'success') return;
  assert.deepEqual(out.missing, ['inst-y']);
  const acme = await getClientCampaigns(owner1, ACME);
  const y = acme.find((c) => c.provider_name === 'Y campaign')!;
  assert.ok(y.unavailable_since, 'flagged as no longer at the provider');
  assert.ok(y.emails_sent !== null, 'last known numbers still shown');
  instantly.campaigns = saved;
  await syncIntegrationById(owner1, service, integration, 'cron');
  const back = (await getClientCampaigns(owner1, ACME)).find((c) => c.provider_name === 'Y campaign')!;
  assert.equal(back.unavailable_since, null, 'available again');
});

test('workspace isolation: another workspace cannot see, import into, or use this integration', async () => {
  assert.equal(await getWorkspaceIntegration(owner2, WS2, INTEGRATION), null);
  assert.equal(await getWorkspaceIntegration(owner2, WS1, INTEGRATION), null, 'RLS hides it even with the right workspace id');
  assert.deepEqual(await syncWorkspace(owner2, service, WS2, 'manual'), [], 'workspace 2 has nothing connected');
  const { data } = await owner2.from('campaigns_v2').select('id');
  assert.equal(data!.length, 0);
  // owner2 trying to import into workspace 1's client through workspace 1's integration
  const res = await importFor(ACME, ['inst-x'], owner2, WS1);
  assert.equal(res.ok, false, 'RLS/guards refuse the writes');
  // ...or into their own client from workspace 1's campaigns
  const linkErr = (await owner2.from('campaign_client_map').insert({ campaign_id: X_ID, client_id: INITECH, workspace_id: WS2 })).error;
  assert.notEqual(linkErr, null);
  assert.equal((await getIntegrationSummaries(owner2, WS2)).length, 0);
});

test('anonymous callers can read nothing', async () => {
  for (const table of ['campaigns_v2', 'campaign_stats', 'campaign_client_map', 'sync_runs', 'integrations', 'workspaces']) {
    const { data } = await anon.from(table).select('id');
    assert.equal((data ?? []).length, 0, table);
  }
  const { error } = await anon.rpc('get_client_campaigns', {});
  assert.notEqual(error, null);
});

test('an Instantly error fails the run with a safe message and changes no data', async () => {
  instantly.failStatus = 401;
  const before = await count('campaign_stats');
  const out = await syncIntegrationById(owner1, service, integration, 'manual');
  const discovery = await discoverProviderCampaigns(service, integration);
  const imported = await importFor(GLOBEX, ['bulk-010']);
  instantly.failStatus = 0;
  assert.equal(out.status, 'failed');
  if (out.status !== 'failed') return;
  assert.equal(out.error, 'Your Instantly API key is invalid or revoked.');
  assert.equal(out.errorKind, 'auth');
  assert.deepEqual(discovery, { ok: false, status: 401, error: 'Your Instantly API key is invalid or revoked.', kind: 'auth' });
  assert.equal(imported.ok, false);
  assert.equal(await count('campaign_stats'), before);
  assert.equal(await count('campaigns_v2', (q) => q.eq('external_id', 'bulk-010')), 0);
  const { data: run } = await service.from('sync_runs').select('status, error_message').eq('id', out.runId!).single();
  assert.deepEqual(run, { status: 'failed', error_message: 'Your Instantly API key is invalid or revoked.' });
});

test('cron sync with the service role works per workspace integration', async () => {
  const out = await syncIntegrationById(service, service, integration, 'cron');
  assert.equal(out.status, 'success');
  if (out.status !== 'success') return;
  const { data: run } = await service.from('sync_runs').select('triggered_by, workspace_id').eq('id', out.runId!).single();
  assert.deepEqual(run, { triggered_by: 'cron', workspace_id: WS1 });
});

test('integration summary reports which clients depend on it', async () => {
  const [summary] = await getIntegrationSummaries(owner1, WS1);
  assert.equal(summary.id, INTEGRATION);
  assert.equal(summary.connected, true);
  assert.equal(summary.client_count, 2);
  assert.equal(summary.campaign_count, 3);
  assert.ok(!JSON.stringify(summary).includes('ciphertext') && !JSON.stringify(summary).includes(API_KEY));
});

test('cron also collects meetings, steps and the sending infrastructure of client campaigns only', async () => {
  const out = await syncIntegrationById(service, service, integration, 'cron');
  assert.equal(out.status, 'success', JSON.stringify(out));
  if (!('details' in out)) return;
  assert.equal(out.details?.extras, 'done');
  assert.deepEqual(
    [out.details?.outcomes, out.details?.steps, out.details?.accounts, out.details?.accountDaily, out.details?.warmup, out.details?.domains],
    ['ok', 'ok', 'ok', 'ok', 'ok', 'ok']
  );

  const { data: snap } = await service.from('campaign_stats').select('opportunities, interested, meetings_booked, meetings_completed, closed').eq('campaign_id', X_ID).eq('stat_date', today).single();
  assert.deepEqual(snap, { opportunities: 10, interested: 12, meetings_booked: 4, meetings_completed: 3, closed: 1 });

  const { data: accounts } = await service.from('email_accounts').select('email, status, warmup_status, warmup_score, provider_raw').eq('workspace_id', WS1).order('email');
  assert.deepEqual(accounts!.map((a) => [a.email, a.status, a.warmup_status]), [
    ['a@send.example', 'active', 'active'],
    ['b@send.example', 'active', 'active'],
    ['c@send.example', 'error', 'paused'],
  ], 'only mailboxes the client campaigns send from; never the unrelated account');
  assert.ok(!JSON.stringify(accounts).includes('never-store-me'), 'credentials are never stored');
  const { data: stepRows } = await service.from('campaign_step_stats').select('step, variant, sent').eq('campaign_id', X_ID).eq('stat_date', today).order('step').order('variant');
  assert.deepEqual(stepRows!.map((r) => `${r.step}${r.variant}:${r.sent}`), ['1A:600', '1B:580', '2A:400']);
  assert.equal(await count('email_account_stats', (q) => q.eq('workspace_id', WS1)), 6, '3 mailboxes × 2 days');
  assert.equal(await count('email_domains', (q) => q.eq('workspace_id', WS1)), 1);
});

test('analytics loaders: the owner sees their workspace, numbers are consistent and never NaN', async () => {
  const filters = parseFilters({});
  const data = await loadCampaignData(owner1, filters);
  assert.ok(data.campaigns.some((c) => c.id === X_ID));
  const x = data.campaigns.find((c) => c.id === X_ID)!;
  assert.deepEqual(x.senderEmails, ['a@send.example', 'b@send.example', 'c@send.example']);
  // Latest snapshot, as stored: counts Instantly reported, null where it did not.
  assert.equal(x.counts.humanReplies, 50);
  assert.equal(x.counts.positive, 10);
  assert.equal(x.counts.prospectsContacted, null, 'new_leads_contacted_count not reported → null, never 0');
  const set = campaignsMetricSet(data.campaigns);
  assert.equal(JSON.stringify(set).includes('NaN'), false);
  assert.equal(readMetric(campaignsMetricSet([x]), 'replyRate').state, 'not_reported', 'no rate without prospects contacted');
  assert.equal(new Set(data.campaigns.map((c) => c.id)).size, data.campaigns.length, 'one record per campaign');
  assert.ok(!JSON.stringify(data).includes('provider_raw'), 'no provider payloads reach the analytics layer');

  const scoped = await loadCampaignData(owner1, parseFilters({ client: GLOBEX }));
  assert.ok(scoped.campaigns.every((c) => c.clientIds.includes(GLOBEX)));
  const one = await loadCampaignData(owner1, parseFilters({ campaign: X_ID }));
  assert.deepEqual(one.campaigns.map((c) => c.id), [X_ID]);

  const detail = await loadCampaignDetail(owner1, X_ID);
  assert.equal(detail!.campaign.name.startsWith('Q3 Outbound X'), true);
  assert.deepEqual(detail!.campaign.counts, x.counts, 'campaign page and overview read the same snapshot');
  assert.deepEqual(stepViews(detail!.steps).map((s) => [s.step, s.sent]), [[1, 1180], [2, 400]]);
  assert.equal(detail!.campaign.senderEmails.length, 3);
  assert.equal(detail!.mailboxes.length, 3);

  const infra = await loadInfrastructure(owner1, filters);
  const views = mailboxViews(infra.accounts, infra.days, infra.domains, infra.campaigns, toDay(new Date()));
  const summary = infraSummary(views);
  assert.deepEqual([summary.total, summary.active, summary.warming, summary.errors], [3, 2, 2, 1]);
  assert.equal(views.find((v) => v.email === 'a@send.example')!.sent, 85, 'campaign sends only');
  assert.equal(warmupTotals(views, infra.days, toDay(new Date())).sent, 90, 'warmup counted apart');
  assert.equal(infra.sync.parts.accounts, 'ok');
  assert.ok(!JSON.stringify(infra).match(/password|never-store-me/));
});

test('analytics loaders: another workspace and anonymous callers see nothing', async () => {
  const filters = parseFilters({});
  const other = await loadCampaignData(owner2, filters);
  assert.ok(!other.campaigns.some((c) => c.id === X_ID));
  assert.ok(!other.all.some((c) => c.id === X_ID));
  assert.equal(await loadCampaignDetail(owner2, X_ID), null);
  const infra = await loadInfrastructure(owner2, filters);
  assert.equal(infra.accounts.length, 0);
  assert.equal(infra.days.length, 0);
  const { error } = await anon.from('email_accounts').select('email');
  assert.notEqual(error, null, 'anon cannot read mailboxes');
  const { data: steps } = await owner2.from('campaign_step_stats').select('id');
  assert.deepEqual(steps, []);
});

test('disconnect stops syncing and purges the key but keeps every campaign and its history; reconnect resumes', async () => {
  const statsBefore = await count('campaign_stats');
  const mapsBefore = await count('campaign_client_map');
  assert.equal(await disconnectIntegration(service, WS2, INTEGRATION), false, 'cannot disconnect another workspace\'s integration');
  assert.equal(await disconnectIntegration(service, WS1, INTEGRATION), true);

  const { data: row } = await service.from('integrations').select('enabled, api_key_encrypted, has_credential').eq('id', INTEGRATION).single();
  assert.deepEqual(row, { enabled: false, api_key_encrypted: null, has_credential: false });
  assert.equal(await count('campaign_stats'), statsBefore);
  assert.equal(await count('campaign_client_map'), mapsBefore);
  assert.equal((await getClientCampaigns(owner1, ACME)).length, 3, 'dashboards keep their data');

  const requests = instantly.requests.length;
  assert.deepEqual(await syncWorkspace(owner1, service, WS1, 'manual'), []);
  assert.equal((await syncIntegrationById(service, service, integration, 'cron')).status, 'not_connected');
  assert.equal(instantly.requests.length, requests, 'no provider calls after disconnect');
  assert.equal((await importFor(GLOBEX, ['bulk-010'])).ok, false);

  // Reconnect: the same row is re-enabled, so the same campaigns resume.
  assert.equal(await upsertIntegrationKey(service, WS1, 'instantly', 'Instantly', API_KEY), INTEGRATION);
  const outs = await syncWorkspace(owner1, service, WS1, 'manual');
  assert.deepEqual(outs.map((o) => o.status), ['success']);
});

// ── sync status (Settings → Integrations, dashboards) ─────────────────────────

test('sync status comes from sync_runs (server timestamps), scoped to the caller\'s workspace', async () => {
  const [s] = await getWorkspaceSyncStatuses(owner1, WS1);
  assert.equal(s.integrationId, INTEGRATION);
  assert.equal(s.state, 'success');
  const { data: newest } = await service
    .from('sync_runs')
    .select('finished_at')
    .eq('integration_id', INTEGRATION)
    .eq('status', 'success')
    .order('started_at', { ascending: false })
    .limit(1)
    .single();
  assert.equal(Date.parse(s.lastSuccessAt!), Date.parse(newest!.finished_at as string), 'last synced = completion of the newest successful run');
  assert.equal(s.lastRun?.trigger, 'manual');

  assert.deepEqual(await getWorkspaceSyncStatuses(owner2, WS2), [], 'workspace 2 has no integration');
  const [peek] = await loadSyncStatuses(owner2, WS1, [{ id: INTEGRATION, provider: 'instantly', label: 'Instantly' }]);
  assert.equal(peek.state, 'never', "RLS hides another workspace's runs");
  assert.equal(peek.lastSuccessAt, null);
});

test('duplicate sync: while a run is in progress, manual and scheduled syncs do nothing and the status says syncing', async () => {
  const startedAt = new Date().toISOString();
  const { data: busy, error } = await service
    .from('sync_runs')
    .insert({ workspace_id: WS1, integration_id: INTEGRATION, provider: 'instantly', triggered_by: 'cron', status: 'running', started_at: startedAt })
    .select('id')
    .single();
  assert.equal(error, null);
  const requests = instantly.requests.length;
  const runs = await count('sync_runs');

  const manual = await syncIntegrationById(owner1, service, integration, 'manual');
  const cron = await syncIntegrationById(service, service, integration, 'cron');
  assert.equal(manual.status, 'in_progress');
  assert.equal(cron.status, 'in_progress');
  assert.equal(Date.parse((manual as { runningSince?: string }).runningSince!), Date.parse(startedAt));
  assert.equal(instantly.requests.length, requests, 'no provider calls');
  assert.equal(await count('sync_runs'), runs, 'no second run');

  const [s] = await getWorkspaceSyncStatuses(owner1, WS1);
  assert.equal(s.state, 'syncing');
  assert.equal(Date.parse(s.current!.startedAt), Date.parse(startedAt));

  await service.from('sync_runs').update({ status: 'success', finished_at: new Date().toISOString() }).eq('id', busy!.id);
  assert.equal((await getWorkspaceSyncStatuses(owner1, WS1))[0].state, 'success');
});

test('a rejected key: the run records errorKind auth, the status asks to reconnect, the last success is kept', async () => {
  const [before] = await getWorkspaceSyncStatuses(owner1, WS1);
  instantly.failStatus = 401;
  const out = await syncIntegrationById(owner1, service, integration, 'manual');
  instantly.failStatus = 0;
  assert.equal(out.status, 'failed');
  const { data: run } = await service
    .from('sync_runs')
    .select('details, error_message, finished_at')
    .eq('id', (out as { runId: string }).runId)
    .single();
  assert.deepEqual(run!.details, { errorKind: 'auth' });
  assert.equal(run!.error_message, 'Your Instantly API key is invalid or revoked.');

  const [s] = await getWorkspaceSyncStatuses(owner1, WS1);
  assert.equal(s.state, 'needs_reauth');
  assert.equal(s.lastSuccessAt, before.lastSuccessAt, 'a failure never overwrites the last successful sync');
  assert.equal(Date.parse(s.lastFailureAt!), Date.parse(run!.finished_at as string));

  const ok = await syncIntegrationById(owner1, service, integration, 'manual');
  assert.equal(ok.status, 'success');
  const [after] = await getWorkspaceSyncStatuses(owner1, WS1);
  assert.equal(after.state, 'success');
  assert.ok(Date.parse(after.lastSuccessAt!) > Date.parse(before.lastSuccessAt!), 'a new success moves the timestamp');
});

// ── replies (Inbox) ─────────────────────────────────────────────────────────

const email = (id: string, extra: Record<string, unknown>) => ({
  id,
  thread_id: 'th-1',
  campaign_id: 'inst-x',
  lead: 'john@acme.example',
  lead_id: 'lead-1',
  eaccount: 'a@send.example',
  ue_type: 2,
  is_auto_reply: 0,
  i_status: null,
  subject: 'Re: Quick question',
  from_address_email: 'john@acme.example',
  from_address_json: [{ address: 'john@acme.example', name: 'John' }],
  to_address_email_list: 'a@send.example',
  ...extra,
});

test('replies: received human replies of client campaigns are stored once, grouped by thread; positive from the lead status', async () => {
  const day = (h: number) => new Date(Date.now() - (48 - h) * 3_600_000).toISOString();
  instantly.emails = [
    email('em-1', { timestamp_created: day(1), body: { text: 'Yes, this looks interesting.\n\nOn Mon, Sales <a@send.example> wrote:\n> pitch' } }),
    email('em-2', { timestamp_created: day(2), body: { text: 'Can we schedule a call on Thursday?' } }),
    // the agency's own emails are never stored
    email('em-sent', { timestamp_created: day(3), ue_type: 1, from_address_email: 'a@send.example', body: { text: 'our follow-up' } }),
    // an out-of-office is an auto-reply, never a human reply
    email('em-ooo', { thread_id: 'th-2', lead: 'away@acme.example', lead_id: 'lead-2', is_auto_reply: 1, subject: 'Automatic reply', timestamp_created: day(4), body: { text: 'I am away' } }),
    // a campaign no client uses
    email('em-other', { thread_id: 'th-9', campaign_id: 'bulk-099', lead_id: 'lead-9', timestamp_created: day(5), body: { text: 'SECRET UNSCOPED' } }),
  ];
  instantly.leads = [
    { id: 'lead-1', email: 'john@acme.example', first_name: 'John', last_name: 'Smith', company_name: 'Acme Corp', lt_interest_status: 1 },
    { id: 'lead-2', email: 'away@acme.example', first_name: 'Ann', last_name: 'Away', lt_interest_status: 0 },
  ];
  const [before] = (await loadCampaignData(owner1, parseFilters({}))).campaigns.filter((c) => c.id === X_ID);
  instantly.requests.length = 0;

  const out = await syncRepliesById(owner1, service, integration, 'manual');
  assert.equal(out.status, 'success');
  assert.ok('messagesStored' in out && out.messagesStored === 3, 'two human replies + one auto-reply');
  const emailCalls = instantly.requests.filter((u) => u.includes('/emails'));
  assert.equal(emailCalls.length, 2, 'one page for the window, one for the status refresh');
  assert.equal(new URL(emailCalls[0]).searchParams.get('email_type'), 'received');
  assert.ok(Date.parse(new URL(emailCalls[1]).searchParams.get('min_timestamp_created')!) > Date.now() - 31 * 86_400_000, 'the refresh re-reads 30 days');

  const inbox = await loadInbox(owner1, WS1, null);
  const john = inbox.threads.find((t) => t.leadEmail === 'john@acme.example')!;
  assert.equal(john.leadName, 'John Smith');
  assert.equal(john.leadCompany, 'Acme Corp');
  assert.equal(john.interest, 'interested');
  assert.equal(john.humanReplies, 2);
  const away = inbox.threads.find((t) => t.leadEmail === 'away@acme.example')!;
  assert.equal(away.humanReplies, 0);
  assert.equal(away.autoReplies, 1);
  assert.deepEqual(filterThreads(inbox.threads, 'positive').map((t) => t.leadEmail), ['john@acme.example']);
  assert.ok(!JSON.stringify(inbox.threads).includes('SECRET UNSCOPED'), 'unscoped campaigns are not stored');

  const detail = await loadThread(owner1, WS1, john.id);
  assert.deepEqual(detail!.messages.map((m) => m.body), ['Yes, this looks interesting.', 'Can we schedule a call on Thursday?']);

  // headline metrics are untouched by the Inbox
  const [after] = (await loadCampaignData(owner1, parseFilters({}))).campaigns.filter((c) => c.id === X_ID);
  assert.deepEqual(after.counts, before.counts);
  const sync = await loadReplySync(owner1, WS1);
  assert.equal(sync.everSynced, true);
  assert.equal(sync.lastFailed, false);
  assert.ok(sync.lastSuccessAt);
});

test('replies: another workspace and anonymous callers cannot read conversations; a client sees only its own positive ones', async () => {
  assert.equal((await loadInbox(owner2, WS2, null)).threads.length, 0);
  const { data: direct } = await owner2.from('reply_messages').select('body');
  assert.equal((direct ?? []).length, 0);
  const { error } = await anon.from('reply_threads').select('id');
  assert.notEqual(error, null);
  const john = (await loadInbox(owner1, WS1, null)).threads.find((t) => t.leadEmail === 'john@acme.example')!;
  assert.equal(await loadThread(owner2, WS2, john.id), null, 'a thread id from another workspace opens nothing');

  const { data: portal } = await service.from('client_portals').select('access_token').eq('client_id', ACME).single();
  const { data: conv, error: convError } = await anon.rpc('get_client_portal_conversations', { p_token: portal!.access_token });
  assert.equal(convError, null);
  const list = (conv as { conversations: { lead_name: string; messages: { body: string }[] }[] }).conversations;
  assert.deepEqual(list.map((c) => c.lead_name), ['John Smith']);
  assert.equal(list[0].messages.length, 2);
  assert.ok(!JSON.stringify(conv).includes('Ann Away'), 'auto-replies are never shown to the client');
  const { data: initech } = await service.from('client_portals').select('access_token').eq('client_id', INITECH).single();
  const { data: other } = await anon.rpc('get_client_portal_conversations', { p_token: initech!.access_token });
  assert.equal(JSON.stringify(other).includes('John'), false, "another agency's client never sees them");
});

test('replies: a re-sync stores nothing twice and fetches only since the last window', async () => {
  instantly.requests.length = 0;
  const out = await syncRepliesById(owner1, service, integration, 'cron');
  assert.equal(out.status, 'success');
  assert.equal('messagesStored' in out && out.messagesStored, 0);
  const since = new URL(instantly.requests.find((u) => u.includes('/emails'))!).searchParams.get('min_timestamp_created')!;
  assert.ok(Date.now() - Date.parse(since) < 60 * 60_000, `incremental window (since ${since})`);
  const { count } = await service.from('reply_messages').select('id', { count: 'exact', head: true });
  assert.equal(count, 3);
});

test('replies: a manual sync right after another is skipped; a 429 keeps every conversation and the last success', async () => {
  const skipped = await syncRepliesById(owner1, service, integration, 'manual');
  assert.equal(skipped.status, 'skipped');
  const before = await loadReplySync(owner1, WS1);
  instantly.emailFailStatus = 429;
  instantly.requests.length = 0;
  const failed = await syncRepliesById(owner1, service, integration, 'cron');
  instantly.emailFailStatus = 0;
  assert.equal(failed.status, 'failed');
  assert.equal(instantly.requests.filter((u) => u.includes('/emails')).length, 1, 'a 429 is not retried');
  const sync = await loadReplySync(owner1, WS1);
  assert.equal(sync.lastFailed, true);
  assert.equal(sync.lastSuccessAt, before.lastSuccessAt, 'the last successful sync is still shown');
  assert.equal((await loadInbox(owner1, WS1, null)).threads.length, 2, 'nothing deleted');
});

test('replies: a lead marked positive after replying (no lead id on the email) becomes positive on the next sync', async () => {
  const now = new Date(Date.now() - 3_600_000).toISOString();
  instantly.emails.push(email('em-late', { thread_id: 'th-3', lead: 'late@acme.example', lead_id: null, i_status: null, timestamp_created: now, from_address_email: 'late@acme.example', from_address_json: [{ address: 'late@acme.example', name: 'Late Larry' }], body: { text: 'Maybe later.' } }));
  await service.from('reply_sync_runs').update({ started_at: new Date(Date.now() - 3_600_000).toISOString() }).eq('integration_id', INTEGRATION);
  await syncRepliesById(owner1, service, integration, 'cron');
  let larry = (await loadInbox(owner1, WS1, null)).threads.find((t) => t.leadEmail === 'late@acme.example')!;
  assert.equal(larry.interest, null);
  // the team marks the lead interested in the sending platform; no new email arrives
  instantly.emails = instantly.emails.map((e) => (e.id === 'em-late' ? { ...e, i_status: 1 } : e));
  const out = await syncRepliesById(owner1, service, integration, 'cron');
  assert.equal(out.status, 'success');
  larry = (await loadInbox(owner1, WS1, null)).threads.find((t) => t.leadEmail === 'late@acme.example')!;
  assert.equal(larry.interest, 'interested');
  const { count } = await service.from('reply_messages').select('id', { count: 'exact', head: true }).eq('provider_message_id', 'em-late');
  assert.equal(count, 1, 'stored once');
});

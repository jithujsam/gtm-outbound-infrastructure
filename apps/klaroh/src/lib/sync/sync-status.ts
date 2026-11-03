// Sync status of an integration, derived ONLY from its sync_runs rows (server
// timestamps, UTC). Never from page load time. Pure functions + one RLS-scoped
// loader; safe to import from client components (no secrets, no admin client).
//
//   never         no sync has ever finished or started
//   syncing       a run is `running` and started less than STALE_RUN_MS ago
//   success       the newest finished run succeeded
//   failed        the newest finished run failed or was partial (or never finished)
//   needs_reauth  the newest finished run failed because the provider rejected the key

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A `running` run older than this never finished (its function was stopped
 * mid-sync): it no longer counts as in progress, and no longer blocks a new sync.
 */
export const STALE_RUN_MS = 10 * 60_000;

/**
 * Data is out of date when the last successful sync is older than this: the
 * scheduled sync runs once a day (04:00 UTC), so 26 hours means at least one
 * scheduled sync did not succeed.
 */
export const STALE_DATA_HOURS = 26;
const STALE_DATA_MS = STALE_DATA_HOURS * 3_600_000;

/** Whether figures from a sync that succeeded at `lastSuccessAt` are out of date at `now`. */
export function isDataStale(lastSuccessAt: string | null, now: Date = new Date()): boolean {
  if (!lastSuccessAt) return false;
  const t = Date.parse(lastSuccessAt);
  return Number.isFinite(t) && now.getTime() - t > STALE_DATA_MS;
}

export type SyncState = 'never' | 'syncing' | 'success' | 'failed' | 'needs_reauth';
export type SyncRunTrigger = 'manual' | 'cron' | 'attach' | 'backfill';

/** A sync_runs row as read for the status (no provider payloads). */
export interface SyncRunRow {
  id: string;
  integration_id: string | null;
  triggered_by: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  campaigns_upserted: number | null;
  error_message: string | null;
  details: Record<string, unknown> | null;
}

export interface SyncRunSummary {
  id: string;
  trigger: SyncRunTrigger;
  /** success | partial | failed | running | interrupted (running but stale) */
  status: 'success' | 'partial' | 'failed' | 'running' | 'interrupted';
  startedAt: string;
  finishedAt: string | null;
  campaignsSynced: number | null;
  /** User-safe failure reason. */
  error: string | null;
}

export interface IntegrationSyncStatus {
  integrationId: string;
  provider: string;
  label: string;
  state: SyncState;
  /** The run in progress (state = syncing). */
  current: SyncRunSummary | null;
  /** The newest run that is no longer in progress. */
  lastRun: SyncRunSummary | null;
  /** Completion time of the newest successful run. */
  lastSuccessAt: string | null;
  /** Completion (or start, if it never finished) time of the newest failed run. */
  lastFailureAt: string | null;
}

const TRIGGERS: SyncRunTrigger[] = ['manual', 'cron', 'attach', 'backfill'];

function summarize(r: SyncRunRow, now: number): SyncRunSummary {
  const stale = r.status === 'running' && now - Date.parse(r.started_at) >= STALE_RUN_MS;
  const status: SyncRunSummary['status'] = stale
    ? 'interrupted'
    : r.status === 'success' || r.status === 'partial' || r.status === 'failed' || r.status === 'running'
      ? r.status
      : 'failed';
  return {
    id: r.id,
    trigger: TRIGGERS.includes(r.triggered_by as SyncRunTrigger) ? (r.triggered_by as SyncRunTrigger) : 'manual',
    status,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    campaignsSynced: r.campaigns_upserted,
    error: stale ? 'The sync did not finish.' : r.error_message,
  };
}

/**
 * The status of one integration from its runs (any order). `lastSuccess` is the
 * newest successful run when `runs` (a recent window) may not contain it.
 */
export function deriveSyncStatus(
  integration: { id: string; provider: string; label: string },
  runs: SyncRunRow[],
  lastSuccess: SyncRunRow | null,
  now: Date = new Date()
): IntegrationSyncStatus {
  const t = now.getTime();
  const own = runs
    .filter((r) => r.integration_id === integration.id)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  const summaries = own.map((r) => ({ row: r, s: summarize(r, t) }));

  const current = summaries.find((x) => x.s.status === 'running')?.s ?? null;
  const last = summaries.find((x) => x.s.status !== 'running') ?? null;

  const successes = [...own.filter((r) => r.status === 'success'), ...(lastSuccess ? [lastSuccess] : [])]
    .filter((r) => r.integration_id === integration.id)
    .map((r) => r.finished_at ?? r.started_at)
    .sort();
  const lastSuccessAt = successes.at(-1) ?? null;

  const failures = summaries
    .filter((x) => x.s.status === 'failed' || x.s.status === 'partial' || x.s.status === 'interrupted')
    .map((x) => x.s.finishedAt ?? x.s.startedAt)
    .sort();
  const lastFailureAt = failures.at(-1) ?? null;

  let state: SyncState;
  if (current) state = 'syncing';
  else if (!last) state = lastSuccessAt ? 'success' : 'never';
  else if (last.s.status === 'success') state = 'success';
  else if (last.row.details?.errorKind === 'auth') state = 'needs_reauth';
  else state = 'failed';

  return {
    integrationId: integration.id,
    provider: integration.provider,
    label: integration.label,
    state,
    current,
    lastRun: last?.s ?? null,
    lastSuccessAt,
    lastFailureAt,
  };
}

const RUN_COLUMNS = 'id, integration_id, triggered_by, status, started_at, finished_at, campaigns_upserted, error_message, details';
/** Recent runs read per integration (enough to find the current and the last finished run). */
const RECENT_RUNS = 10;

/**
 * Sync status of the given integrations of `workspaceId`, through the caller's
 * RLS-scoped client (a workspace only ever reads its own runs).
 */
export async function loadSyncStatuses(
  db: SupabaseClient,
  workspaceId: string,
  integrations: { id: string; provider: string; label: string }[],
  now: Date = new Date()
): Promise<IntegrationSyncStatus[]> {
  return Promise.all(
    integrations.map(async (integration) => {
      const [recent, success] = await Promise.all([
        db
          .from('sync_runs')
          .select(RUN_COLUMNS)
          .eq('workspace_id', workspaceId)
          .eq('integration_id', integration.id)
          .order('started_at', { ascending: false })
          .limit(RECENT_RUNS),
        db
          .from('sync_runs')
          .select(RUN_COLUMNS)
          .eq('workspace_id', workspaceId)
          .eq('integration_id', integration.id)
          .eq('status', 'success')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (recent.error) console.warn('loadSyncStatuses error:', recent.error.message);
      return deriveSyncStatus(
        integration,
        (recent.data ?? []) as SyncRunRow[],
        (success.data as SyncRunRow | null) ?? null,
        now
      );
    })
  );
}

// ── display (browser-local time) ────────────────────────────────────────────

function parts(iso: string, timeZone?: string) {
  const d = new Date(iso);
  const get = (opts: Intl.DateTimeFormatOptions) =>
    Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { ...opts, timeZone }).formatToParts(d).map((p) => [p.type, p.value])
    );
  const date = get({ day: 'numeric', month: 'short', year: 'numeric' });
  const time = get({ hour: 'numeric', minute: '2-digit', hour12: true });
  return {
    date: `${date.day} ${date.month} ${date.year}`,
    time: `${time.hour}:${time.minute} ${String(time.dayPeriod).toUpperCase()}`,
  };
}

/** "8 Oct 2026, 8:42 PM" in the viewer's time zone (or `timeZone`). */
export function formatSyncTime(iso: string, timeZone?: string): string {
  if (Number.isNaN(Date.parse(iso))) return '';
  const p = parts(iso, timeZone);
  return `${p.date}, ${p.time}`;
}

/** "8:45 PM" when `iso` falls on the same local day as `now`, else the full form. */
export function formatSyncClock(iso: string, now: Date = new Date(), timeZone?: string): string {
  if (Number.isNaN(Date.parse(iso))) return '';
  const p = parts(iso, timeZone);
  return p.date === parts(now.toISOString(), timeZone).date ? p.time : `${p.date}, ${p.time}`;
}

/**
 * "8 Oct, 8:42 PM": the full form without the year when `iso` falls in the same
 * local year as `now` (compact indicators); otherwise the full form.
 */
export function formatSyncShort(iso: string, now: Date = new Date(), timeZone?: string): string {
  if (Number.isNaN(Date.parse(iso))) return '';
  const p = parts(iso, timeZone);
  const year = (d: string) => d.split(' ').at(-1);
  return year(p.date) === year(parts(now.toISOString(), timeZone).date)
    ? `${p.date.split(' ').slice(0, 2).join(' ')}, ${p.time}`
    : `${p.date}, ${p.time}`;
}

export const TRIGGER_LABEL: Record<SyncRunTrigger, string> = {
  manual: 'Manual sync',
  cron: 'Scheduled sync',
  attach: 'Campaign import',
  backfill: 'Data migration',
};

export interface SyncStatusText {
  tone: 'good' | 'info' | 'neutral' | 'critical' | 'warning';
  /** Short state label for a chip. */
  badge: string;
  /** The one line that answers "is my data fresh?". */
  headline: string;
  /** Supporting lines (reason, last success). */
  lines: string[];
  /** The newest finished run: trigger · started · finished · campaigns. */
  lastRun: string | null;
}

/**
 * What to say about a status, in the viewer's time zone (or `timeZone`).
 * `dates: 'short'` drops the current year from dates (compact indicators).
 */
export function describeSyncStatus(
  s: IntegrationSyncStatus,
  now: Date = new Date(),
  timeZone?: string,
  dates: 'full' | 'short' = 'full'
): SyncStatusText {
  const full = (iso: string) => (dates === 'short' ? formatSyncShort(iso, now, timeZone) : formatSyncTime(iso, timeZone));
  const clock = (iso: string) => formatSyncClock(iso, now, timeZone);
  const lastSuccess = s.lastSuccessAt ? `Last successful sync ${full(s.lastSuccessAt)}` : 'No successful sync yet';
  const run = s.lastRun;
  const lastRun = run
    ? [
        TRIGGER_LABEL[run.trigger],
        `started ${clock(run.startedAt)}`,
        run.finishedAt ? `finished ${clock(run.finishedAt)}` : 'did not finish',
        ...(run.status === 'success' && run.campaignsSynced !== null
          ? [`${run.campaignsSynced} campaign${run.campaignsSynced === 1 ? '' : 's'}`]
          : []),
      ].join(' · ')
    : null;

  switch (s.state) {
    case 'syncing':
      return {
        tone: 'info',
        badge: 'Syncing',
        headline: `Syncing… Started ${clock(s.current!.startedAt)}`,
        lines: [s.lastSuccessAt ? `Last synced ${full(s.lastSuccessAt)}` : 'Not synced yet'],
        lastRun,
      };
    case 'success':
      if (isDataStale(s.lastSuccessAt, now)) {
        return {
          tone: 'warning',
          badge: 'Out of date',
          headline: `Last synced ${full(s.lastSuccessAt!)}`,
          lines: [`No successful sync in the last ${STALE_DATA_HOURS} hours, so figures may be out of date.`],
          lastRun,
        };
      }
      return { tone: 'good', badge: 'Synced', headline: `Last synced ${full(s.lastSuccessAt!)}`, lines: [], lastRun };
    case 'needs_reauth':
      return {
        tone: 'critical',
        badge: 'Reconnect needed',
        headline: `Sync stopped ${full(s.lastFailureAt!)}: ${s.label} rejected the API key`,
        lines: [run?.error ?? 'The API key was rejected.', lastSuccess],
        lastRun,
      };
    case 'failed':
      return {
        tone: 'critical',
        badge: run?.status === 'partial' ? 'Sync incomplete' : 'Sync failed',
        headline: `Last sync ${run?.status === 'partial' ? 'incomplete' : 'failed'} ${full(s.lastFailureAt!)}`,
        lines: [...(run?.error ? [run.error] : []), lastSuccess],
        lastRun,
      };
    default:
      return { tone: 'neutral', badge: 'Not synced', headline: 'Not synced yet', lines: [], lastRun: null };
  }
}

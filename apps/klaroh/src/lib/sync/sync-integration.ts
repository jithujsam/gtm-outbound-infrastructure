// Sync orchestration: provider adapter → Klaroh database writer.
//
// Provider-neutral: works for any ProviderAdapter and any CampaignStore.
//
// Scope: only campaigns a client uses (linked in campaign_client_map) are
// stored and synced — never the whole provider account. The import flow passes
// an explicit scope (the campaigns the user just selected). In-scope campaigns
// the provider no longer returns are flagged unavailable and keep their
// history. Each sync writes one stat snapshot per in-scope campaign for the day
// and records a sync_runs row with the outcome.

import {
  classifyProviderError,
  mergeOutcomes,
  type CampaignStatSnapshot,
  type NormalizedCampaign,
  type ProviderAdapter,
  type ProviderErrorKind,
} from '../providers/types.ts';
import {
  toAccountRow,
  toAccountSendingRow,
  toAccountWarmupRow,
  toCampaignRow,
  toDomainRow,
  toStatRow,
  toStepStatRow,
  type CampaignStore,
  type PartOutcome,
  type SyncContext,
  type SyncDetails,
  type SyncRunStatus,
  type SyncTrigger,
} from './campaign-store.ts';
import { STALE_RUN_MS } from './sync-status.ts';

/** Mailbox sending history requested per sync (days back from today, inclusive). */
export const ACCOUNT_HISTORY_DAYS = 90;
/** Parallel per-campaign provider calls (outcomes, steps). */
const PER_CAMPAIGN_CONCURRENCY = 4;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export interface SyncOutcome {
  /** in_progress: another sync of this integration is running; nothing was done. */
  status: SyncRunStatus | 'skipped' | 'in_progress';
  runId: string | null;
  /** In-scope campaigns. */
  campaignsSeen: number;
  campaignsUpserted: number;
  statsWritten: number;
  /** external id → Klaroh campaign id, for the campaigns written. */
  campaignIds: Map<string, string>;
  /** In-scope external ids the provider did not return. */
  missing: string[];
  /** User-safe message when status is failed/partial. */
  error?: string;
  /** Provider failure kind when status is failed/partial because of the provider. */
  errorKind?: ProviderErrorKind;
  /** What the optional parts (outcomes, steps, mailboxes, warmup, DNS) did. */
  details?: SyncDetails;
  /** in_progress only: when the running sync started (server time, UTC). */
  runningSince?: string;
}

export interface SyncIntegrationParams {
  store: CampaignStore;
  adapter: ProviderAdapter;
  ctx: SyncContext;
  apiKey: string;
  trigger: SyncTrigger;
  /** Explicit scope (import); defaults to the campaigns linked to a client. */
  scope?: string[];
  /** Skip when the last successful sync of this integration is more recent. */
  minIntervalMs?: number;
  /**
   * Also sync step analytics and the sending infrastructure (mailboxes,
   * mailbox sending, warmup, DNS). These never fail the campaign sync.
   */
  extras?: boolean;
  /** Do nothing (status in_progress) while another run of this integration is running. */
  skipIfRunning?: boolean;
  now?: () => Date;
}

export async function syncIntegration(params: SyncIntegrationParams): Promise<SyncOutcome> {
  const { store, adapter, ctx, apiKey, trigger } = params;
  const now = params.now ?? (() => new Date());
  const empty = {
    runId: null,
    campaignsSeen: 0,
    campaignsUpserted: 0,
    statsWritten: 0,
    campaignIds: new Map<string, string>(),
    missing: [] as string[],
  };

  if (params.minIntervalMs && params.minIntervalMs > 0) {
    const last = await store.lastSuccessfulSyncAt(ctx.integrationId);
    if (last && now().getTime() - Date.parse(last) < params.minIntervalMs) {
      return { status: 'skipped', ...empty };
    }
  }

  let scope: Set<string>;
  if (params.scope) {
    scope = new Set(params.scope);
  } else {
    const scoped = await store.scopedExternalIds(ctx.integrationId);
    if (!scoped.ok) {
      console.error(`sync ${ctx.provider} ${ctx.integrationId}: scope read failed:`, scoped.error);
      return { status: 'failed', ...empty, error: 'Could not read the campaigns to sync' };
    }
    scope = new Set(scoped.data);
  }
  // Nothing selected for any client: no provider call, no run.
  if (scope.size === 0) return { status: 'skipped', ...empty };

  if (params.skipIfRunning) {
    const since = new Date(now().getTime() - STALE_RUN_MS).toISOString();
    const runningSince = await store.activeRunStartedAt(ctx.integrationId, since);
    if (runningSince) return { status: 'in_progress', ...empty, runningSince };
  }

  const startedAt = now().toISOString();
  const runId = await store.startRun(ctx, trigger, startedAt);

  const finish = async (outcome: SyncOutcome): Promise<SyncOutcome> => {
    if (runId && outcome.status !== 'skipped' && outcome.status !== 'in_progress') {
      await store.finishRun(
        runId,
        {
          status: outcome.status,
          campaignsSeen: outcome.campaignsSeen,
          campaignsUpserted: outcome.campaignsUpserted,
          statsWritten: outcome.statsWritten,
          errorMessage: outcome.error ?? null,
          details: outcome.details,
          errorKind: outcome.status === 'success' ? undefined : outcome.errorKind,
        },
        now().toISOString()
      );
    }
    return { ...outcome, runId };
  };

  const [list, stats] = await Promise.all([adapter.listCampaigns(apiKey), adapter.fetchStats(apiKey)]);

  if (!list.ok) {
    return finish({
      status: 'failed',
      ...empty,
      campaignsSeen: scope.size,
      error: adapter.userSafeError(list.error, `${adapter.label} sync failed`),
      errorKind: classifyProviderError(list.error),
    });
  }

  // Only in-scope campaigns; a provider returning one twice must not write it twice.
  const unique = new Map(list.data.filter((c) => scope.has(c.externalId)).map((c) => [c.externalId, c]));
  const missing = [...scope].filter((id) => !unique.has(id));
  const syncedAt = now().toISOString();
  if (missing.length) await store.markUnavailable(ctx.integrationId, missing, syncedAt);

  const campaignRows = [...unique.values()].map((c) => toCampaignRow(ctx, c, syncedAt));
  const upserted = campaignRows.length
    ? await store.upsertCampaigns(campaignRows)
    : ({ ok: true, data: new Map<string, string>() } as const);

  if (!upserted.ok) {
    console.error(`sync ${ctx.provider} ${ctx.integrationId}: campaign write failed:`, upserted.error);
    return finish({
      status: 'failed',
      ...empty,
      campaignsSeen: scope.size,
      missing,
      error: 'Could not save campaigns',
    });
  }
  const ids = upserted.data;
  const base = { ...empty, campaignsSeen: scope.size, campaignsUpserted: ids.size, campaignIds: ids, missing };

  if (!stats.ok) {
    return finish({
      status: 'partial',
      ...base,
      error: adapter.userSafeError(stats.error, `${adapter.label} statistics unavailable`),
      errorKind: classifyProviderError(stats.error),
    });
  }

  // One snapshot per written campaign; analytics for anything else (campaigns
  // no client uses, or deleted at the provider) are ignored.
  const seen = new Set<string>();
  const scoped = stats.data.filter((s) => ids.has(s.externalId) && !seen.has(s.externalId) && seen.add(s.externalId));

  const details: SyncDetails = { outcomes: 'unsupported', extras: params.extras ? 'done' : 'skipped' };
  const errors: Record<string, string> = {};
  const failed = (part: string, error: { status: number; message: string }, label: string): PartOutcome => {
    errors[part] = adapter.userSafeError(error, `${adapter.label} ${label} unavailable`);
    console.warn(`sync ${ctx.provider} ${ctx.integrationId}: ${part} failed:`, error.status, error.message);
    return 'failed';
  };

  // Business outcomes (interested, meetings, closed) are written into the same
  // daily snapshot, so they are fetched on every sync: a later sync of the day
  // must not replace them with nulls.
  let snapshots: CampaignStatSnapshot[] = scoped;
  if (adapter.fetchCampaignOutcomes && scoped.length) {
    const fetchOutcomes = adapter.fetchCampaignOutcomes.bind(adapter);
    const results = await mapLimit(scoped, PER_CAMPAIGN_CONCURRENCY, (s) => fetchOutcomes(apiKey, s.externalId));
    const firstError = results.find((r) => !r.ok);
    details.outcomes = firstError && !firstError.ok ? failed('outcomes', firstError.error, 'outcomes') : 'ok';
    snapshots = scoped.map((s, i) => {
      const r = results[i];
      return r.ok ? { ...s, metrics: mergeOutcomes(s.metrics, r.data) } : s;
    });
  }

  const statRows = snapshots.map((s) => toStatRow(ctx, ids.get(s.externalId)!, s, runId, syncedAt));
  const written = statRows.length ? await store.upsertStats(statRows) : ({ ok: true, data: 0 } as const);
  if (!written.ok) {
    console.error(`sync ${ctx.provider} ${ctx.integrationId}: stats write failed:`, written.error);
    return finish({ status: 'partial', ...base, error: 'Could not save campaign statistics', details });
  }

  if (params.extras) {
    await syncExtras({ store, adapter, ctx, apiKey, runId, syncedAt, ids, campaigns: [...unique.values()], details, failed, now });
  }
  if (Object.keys(errors).length) details.errors = errors;

  return finish({ status: 'success', ...base, statsWritten: written.data, details });
}

/**
 * Step analytics and the sending infrastructure of the in-scope campaigns.
 * Each part is independent: one failing (e.g. an API key without account
 * access) is recorded in the run details and never blocks the others.
 */
async function syncExtras(p: {
  store: CampaignStore;
  adapter: ProviderAdapter;
  ctx: SyncContext;
  apiKey: string;
  runId: string | null;
  syncedAt: string;
  ids: Map<string, string>;
  campaigns: NormalizedCampaign[];
  details: SyncDetails;
  failed: (part: string, error: { status: number; message: string }, label: string) => PartOutcome;
  now: () => Date;
}): Promise<void> {
  const { store, adapter, ctx, apiKey, runId, syncedAt, ids, campaigns, details, failed } = p;
  const saveFailed = (part: string, error: string): PartOutcome => {
    console.error(`sync ${ctx.provider} ${ctx.integrationId}: ${part} write failed:`, error);
    return 'failed';
  };

  // ── steps ──
  if (adapter.fetchStepStats) {
    const fetchSteps = adapter.fetchStepStats.bind(adapter);
    const results = await mapLimit(campaigns, PER_CAMPAIGN_CONCURRENCY, (c) => fetchSteps(apiKey, c.externalId));
    const rows = results.flatMap((r, i) =>
      r.ok ? r.data.map((s) => toStepStatRow(ids.get(campaigns[i].externalId)!, s, runId, syncedAt)) : []
    );
    const firstError = results.find((r) => !r.ok);
    details.steps = firstError && !firstError.ok ? failed('steps', firstError.error, 'step analytics') : 'ok';
    if (rows.length) {
      const w = await store.upsertStepStats(rows);
      if (!w.ok) details.steps = saveFailed('steps', w.error);
    }
  } else details.steps = 'unsupported';

  // ── mailboxes: only those the in-scope campaigns send from ──
  const scopeEmails = [...new Set(campaigns.flatMap((c) => c.senderEmails ?? []))];
  if (!adapter.listAccounts) {
    details.accounts = details.accountDaily = details.warmup = details.domains = 'unsupported';
    return;
  }
  const listed = await adapter.listAccounts(apiKey);
  if (!listed.ok) {
    details.accounts = failed('accounts', listed.error, 'email accounts');
    details.accountDaily = details.warmup = details.domains = 'skipped';
    return;
  }
  const inScope = listed.data.filter((a) => scopeEmails.includes(a.email));
  const saved = inScope.length
    ? await store.upsertAccounts(inScope.map((a) => toAccountRow(ctx, a, syncedAt)))
    : ({ ok: true, data: new Map<string, string>() } as const);
  if (!saved.ok) {
    details.accounts = saveFailed('accounts', saved.error);
    details.accountDaily = details.warmup = details.domains = 'skipped';
    return;
  }
  details.accounts = 'ok';
  await store.markAccountsUnavailable(ctx.integrationId, inScope.map((a) => a.email), syncedAt);
  const accountIds = saved.data;
  const emails = [...accountIds.keys()];
  if (emails.length === 0) {
    details.accountDaily = details.warmup = details.domains = 'skipped';
    return;
  }

  // ── campaign sending per mailbox per day ──
  if (adapter.fetchAccountDaily) {
    const end = p.now();
    const start = new Date(end.getTime() - (ACCOUNT_HISTORY_DAYS - 1) * 86_400_000);
    const daily = await adapter.fetchAccountDaily(apiKey, emails, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
    if (daily.ok) {
      const rows = daily.data.filter((d) => accountIds.has(d.email)).map((d) => toAccountSendingRow(accountIds.get(d.email)!, d, syncedAt));
      const w = rows.length ? await store.upsertAccountSending(rows) : ({ ok: true, data: 0 } as const);
      details.accountDaily = w.ok ? 'ok' : saveFailed('accountDaily', w.error);
    } else details.accountDaily = failed('accountDaily', daily.error, 'mailbox analytics');
  } else details.accountDaily = 'unsupported';

  // ── warmup (kept apart from campaign sending) ──
  if (adapter.fetchWarmup) {
    const warmup = await adapter.fetchWarmup(apiKey, emails);
    if (warmup.ok) {
      const rows = warmup.data.days.filter((d) => accountIds.has(d.email)).map((d) => toAccountWarmupRow(accountIds.get(d.email)!, d, syncedAt));
      const w = rows.length ? await store.upsertAccountWarmup(rows) : ({ ok: true, data: 0 } as const);
      details.warmup = w.ok ? 'ok' : saveFailed('warmup', w.error);
      // the warmup report's health score fills accounts the list left without one
      const scored = inScope
        .filter((a) => a.warmupScore === null && warmup.data.healthScores.has(a.email))
        .map((a) => toAccountRow(ctx, { ...a, warmupScore: warmup.data.healthScores.get(a.email)! }, syncedAt));
      if (scored.length) await store.upsertAccounts(scored);
    } else details.warmup = failed('warmup', warmup.error, 'warmup analytics');
  } else details.warmup = 'unsupported';

  // ── DNS of the sending domains ──
  if (adapter.checkDomains) {
    const checks = await adapter.checkDomains(apiKey, emails);
    if (checks.ok) {
      const domains = new Set(emails.map((e) => e.split('@')[1]));
      const rows = checks.data.filter((d) => domains.has(d.domain)).map((d) => toDomainRow(ctx, d, syncedAt));
      const w = rows.length ? await store.upsertDomains(rows) : ({ ok: true, data: 0 } as const);
      details.domains = w.ok ? 'ok' : saveFailed('domains', w.error);
    } else details.domains = failed('domains', checks.error, 'domain checks');
  } else details.domains = 'unsupported';
}

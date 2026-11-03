// Provider-neutral campaign display helpers. Pure and client-safe: used by
// server data loaders, client components and the public portal alike.

import type { CampaignStatus, CampaignView } from './types.ts';

const STATUSES: readonly CampaignStatus[] = ['draft', 'active', 'paused', 'completed', 'error', 'suspended', 'unknown'];

const METRIC_KEYS = [
  'leads', 'contacted', 'new_leads_contacted', 'emails_sent', 'opens', 'opens_unique', 'replies',
  'replies_unique', 'clicks', 'clicks_unique', 'bounces', 'unsubscribes', 'completed', 'opportunities',
  'opportunity_value', 'interested', 'meetings_booked', 'meetings_completed', 'closed',
] as const;

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Maps a get_client_campaigns / get_public_client_campaigns row. */
export function toCampaignView(row: Record<string, unknown>): CampaignView {
  const status = STATUSES.includes(row.status as CampaignStatus) ? (row.status as CampaignStatus) : 'unknown';
  const view = {
    id: String(row.campaign_id ?? row.id),
    client_id: strOrNull(row.client_id),
    name: strOrNull(row.name) ?? strOrNull(row.provider_name) ?? 'Campaign',
    provider_name: strOrNull(row.provider_name),
    provider: strOrNull(row.provider),
    status,
    is_evergreen: typeof row.is_evergreen === 'boolean' ? row.is_evergreen : null,
    sender_count: numOrNull(row.sender_count),
    daily_limit: numOrNull(row.daily_limit),
    start_date: strOrNull(row.start_date),
    end_date: strOrNull(row.end_date),
    external_created_at: strOrNull(row.external_created_at),
    external_updated_at: strOrNull(row.external_updated_at),
    last_synced_at: strOrNull(row.last_synced_at),
    captured_at: strOrNull(row.captured_at),
    unavailable_since: strOrNull(row.unavailable_since),
  } as CampaignView;
  for (const key of METRIC_KEYS) view[key] = numOrNull(row[key]);
  return view;
}

// Campaign performance metrics (counts, rates, labels and definitions) live in
// src/lib/analytics/metrics.ts — the one place every view reads them from.

/** Latest sync/activity timestamp across campaigns. */
export function latestTimestamp(campaigns: CampaignView[]): string | null {
  let latest: string | null = null;
  for (const c of campaigns) {
    const stamp = c.captured_at ?? c.last_synced_at;
    if (stamp && (!latest || stamp > latest)) latest = stamp;
  }
  return latest;
}

export const STATUS_INFO: Record<CampaignStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'text-on-surface-variant bg-surface-container' },
  active: { label: 'Active', color: 'text-primary bg-primary-fixed/30' },
  paused: { label: 'Paused', color: 'text-on-surface-variant bg-surface-container' },
  completed: { label: 'Completed', color: 'text-on-surface-variant bg-surface-container' },
  error: { label: 'Needs attention', color: 'text-error bg-error-container' },
  suspended: { label: 'Account suspended', color: 'text-error bg-error-container' },
  unknown: { label: 'Unknown', color: 'text-on-surface-variant bg-surface-container' },
};

export function campaignStatusInfo(status: CampaignStatus): { label: string; color: string } {
  return STATUS_INFO[status] ?? STATUS_INFO.unknown;
}

export const isLiveStatus = (status: CampaignStatus): boolean => status === 'active';
export const needsAttention = (status: CampaignStatus): boolean => status === 'error' || status === 'suspended';

/**
 * What the provider reported about a campaign that needs attention. Klaroh
 * repeats the provider's state; it does not diagnose a cause (a campaign error
 * is not evidence of a mailbox problem).
 */
export function attentionDetail(status: CampaignStatus): string | null {
  if (status === 'suspended') return 'Suspended by the provider';
  if (status === 'error') return 'The provider reports an error';
  return null;
}

/** "3 campaigns, 2 live": a count of campaigns, never a health claim. */
export function trackingSummary(total: number, live: number): string {
  return `${total} campaign${total === 1 ? '' : 's'}, ${live} live`;
}

export interface CampaignActivity {
  id: string;
  /** YYYY-MM-DD */
  day: string;
  text: string;
}

/** Recent activity covers this many days, including today. */
export const ACTIVITY_WINDOW_DAYS = 14;

/**
 * Recent campaign activity, built only from fields whose meaning matches the
 * label: a campaign's start date. Klaroh stores the current status only, so it
 * cannot say when a campaign was paused; sync history is shown by the sync
 * status, not reconstructed from snapshot times.
 */
export function recentActivity(campaigns: CampaignView[], today: string, limit = 7): CampaignActivity[] {
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - (ACTIVITY_WINDOW_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  return campaigns
    .flatMap((c) => {
      const day = c.start_date?.slice(0, 10);
      if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < from || day > today) return [];
      return [{ id: `start-${c.id}`, day, text: `Campaign started: ${c.name}` }];
    })
    .sort((a, b) => b.day.localeCompare(a.day) || a.text.localeCompare(b.text))
    .slice(0, limit);
}

const PROVIDER_LABELS: Record<string, string> = { instantly: 'Instantly' };

export function providerLabel(provider: string | null | undefined): string {
  if (!provider) return 'No source';
  return PROVIDER_LABELS[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

/** One label for the set of providers behind these campaigns. */
export function sourcesLabel(campaigns: CampaignView[]): string {
  const providers = new Set(campaigns.map((c) => c.provider).filter(Boolean));
  if (providers.size === 0) return 'No source';
  if (providers.size > 1) return 'Mixed sources';
  return providerLabel([...providers][0]);
}

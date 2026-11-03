'use client';

import { useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { CampaignView } from '@/lib/types';
import Link from 'next/link';
import {
  AlertTriangle,
  Activity,
  ArrowUpRight,
  Target,
  ChevronRight,
} from 'lucide-react';
import {
  ACTIVITY_WINDOW_DAYS,
  attentionDetail,
  campaignStatusInfo,
  isLiveStatus,
  latestTimestamp,
  needsAttention,
  recentActivity,
  sourcesLabel,
  trackingSummary,
} from '@/lib/campaign-view';
import { fmtDay } from '@/lib/analytics/format';
import { MANUAL_HELP } from '@/lib/infra-signals';
import { countsFromRow, formatMetric, metricHelp, metricSet, type MetricSet } from '@/lib/analytics/metrics';
import { FunnelPanel, KpiPanel, PeriodNote } from '@/components/analytics/MetricPanels';
import RankingChart from '@/components/analytics/RankingChart';
import { rankRow } from '@/lib/analytics/ranking';
import { getClientCampaigns } from '@/lib/data/campaigns';
import EmailInfrastructureSignals, { type InfraSignals } from '@/components/EmailInfrastructureSignals';
import { relativeTime } from '@/lib/utils/relative-time';
import { DataTable, Td, Th, Tr } from '@/components/ui/DataTable';
import SyncStatus from '@/components/sync/SyncStatus';
import { Panel } from '@/components/ui/Panel';
import { StatusChip } from '@/components/ui/StatusChip';

// ─── Small presentational helpers ─────────────────────────────────────────────

function ToolBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/10 bg-primary-fixed/20 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-primary">
      {label}
    </span>
  );
}

function StatusPill({ status }: { status: string | null }) {
  return status === 'active' ? (
    <StatusChip tone="good">Active</StatusChip>
  ) : (
    <StatusChip tone="neutral">{status === 'paused' ? 'Paused' : 'Ended'}</StatusChip>
  );
}

// ─── Data plumbing ────────────────────────────────────────────────────────────

interface CampaignRow {
  id: string;
  name: string;
}

interface Aggregate {
  rows: number;
  live: number;
  set: MetricSet;
  latestSynced: string | null;
}

/** All-time metrics of the client's campaigns, from the shared metric layer. */
function aggregateCampaigns(rows: CampaignView[]): Aggregate {
  return {
    rows: rows.length,
    live: rows.filter((c) => isLiveStatus(c.status)).length,
    set: metricSet(rows.map(countsFromRow)),
    latestSynced: latestTimestamp(rows),
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ClientDashboardProps {
  userId: string;
  clientId: string | null;
  clientName?: string | null;
  clientStatus?: string | null;
  campaigns: CampaignRow[];
  initialCampaigns?: CampaignView[];
  initialInfraSignals?: InfraSignals;
  onSelectCampaign: (name: string) => void;
}


export default function ClientDashboard({
  userId,
  clientId,
  clientName,
  clientStatus,
  campaigns,
  initialCampaigns,
  initialInfraSignals,
  onSelectCampaign,
}: ClientDashboardProps) {
  const [rows, setRows] = useState<CampaignView[]>(initialCampaigns ?? []);
  const [infraSignals, setInfraSignals] = useState<InfraSignals>(
    initialInfraSignals ?? {
      sending_capacity: null,
      active_inboxes: null,
      domain_health_score: null,
      domain_health_status: null,
    }
  );

  const agg = useMemo(() => aggregateCampaigns(rows), [rows]);

  const loadData = useCallback(async () => {
    if (!clientId) return;
    try {
      const supabase = createClient();
      setRows(await getClientCampaigns(supabase, clientId));
    } catch (err) {
      console.warn('ClientDashboard loadData failed:', err);
    }
  }, [clientId]);

  const saveInfraSignals = useCallback(
    async (updated: InfraSignals) => {
      if (!clientId) return;
      const supabase = createClient();
      await supabase
        .from('clients')
        .update({
          sending_capacity: updated.sending_capacity,
          active_inboxes: updated.active_inboxes,
          domain_health_score: updated.domain_health_score,
          domain_health_status: updated.domain_health_status,
        })
        .eq('id', clientId);
      setInfraSignals(updated);
    },
    [clientId]
  );

  // Attention: campaigns the provider reports as unhealthy or suspended.
  const attentionCampaigns = rows.filter((c) => needsAttention(c.status));

  // Recent activity: campaign start dates only (see recentActivity). Pause times
  // and sync completions are not reconstructed from unrelated timestamps.
  const activity = useMemo(() => recentActivity(rows, new Date().toISOString().slice(0, 10)), [rows]);

  if (campaigns.length === 0 && rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-12 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-fixed/20">
          <Target size={24} className="text-primary" />
        </div>
        <h3 className="font-sans text-base font-semibold text-on-surface mb-2">No campaigns yet</h3>
        <p className="font-sans text-sm font-normal text-on-surface-variant">
          Create your first campaign to start tracking performance metrics.
        </p>
      </div>
    );
  }

  const tool = sourcesLabel(rows);
  const initialLoad = campaigns.length > 0 && !rows.length;

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      {attentionCampaigns.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-error/50 bg-error-container/40 px-3.5 py-2.5">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-error" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-error">
              {attentionCampaigns.length === 1 ? '1 campaign needs attention' : `${attentionCampaigns.length} campaigns need attention`}
            </p>
            <ul className="mt-0.5 text-on-surface-variant">
              {attentionCampaigns.map((c) => (
                <li key={c.id} className="break-words">
                  <span className="font-medium text-on-surface">{c.name}</span>: {attentionDetail(c.status)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── 1. Client overview strip ─────────────────────────────────────── */}
      <section className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <span className="min-w-0 truncate text-sm font-semibold text-on-surface">{clientName || 'Client'}</span>
          <StatusPill status={clientStatus ?? 'active'} />
          {agg.rows > 0 && (
            <span className="text-xs text-on-surface-variant">{trackingSummary(agg.rows, agg.live)}</span>
          )}
        </div>
        <SyncStatus autoSync onSynced={loadData} />
      </section>

      {initialLoad && (
        <div className="h-32 animate-pulse rounded-lg bg-outline-variant/20" />
      )}

      {/* ── 2. Performance (shared metric layer) ──────────────────────────── */}
      <PeriodNote asOf={agg.latestSynced} campaigns={agg.rows} />
      <KpiPanel
        set={agg.set}
        title="Performance"
        subtitle={agg.rows > 1 ? 'Prospects are counted per campaign, not as unique people' : undefined}
      />

      {/* ── 3. Outcomes by campaign + funnel ───────────────────────────────── */}
      {rows.length > 1 ? (
        <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
          <Panel title="Outcomes by campaign" subtitle="All time. Click a bar to open the campaign." className="lg:col-span-7">
            <RankingChart
              rows={rows.map((c) => rankRow(c.id, c.name, `/campaigns/${c.id}`, metricSet([countsFromRow(c)])))}
              label="Campaign"
              emptyText="No campaign has reported results yet."
            />
          </Panel>
          <FunnelPanel set={agg.set} className="lg:col-span-5" />
        </div>
      ) : (
        <FunnelPanel set={agg.set} />
      )}

      {/* ── 4. Campaign overview table ───────────────────────────────────── */}
      <Panel
        title="Campaign overview"
        subtitle="Click any campaign to open its detail view"
        action={
          <span className="text-xs text-on-surface-variant">
            {rows.length} campaign{rows.length === 1 ? '' : 's'}
          </span>
        }
      >
        <div className="overflow-hidden">
          <DataTable label="Campaign overview" minWidth={980}>
            <thead>
              <tr>
                <Th sticky>Campaign</Th>
                <Th>Status</Th>
                <Th align="right" title={metricHelp('emailsSent')}>Emails sent</Th>
                <Th align="right" title={metricHelp('prospectsContacted')}>Prospects</Th>
                <Th align="right" title={metricHelp('humanReplies')}>Human replies</Th>
                <Th align="right" title={metricHelp('replyRate')}>Reply rate</Th>
                <Th align="right" title={metricHelp('positive')}>Positive</Th>
                <Th align="right" title={metricHelp('positiveRate')}>Positive rate</Th>
                <Th align="right" title={metricHelp('bounces')}>Bounces</Th>
                <Th title="When the campaign was last changed at the provider, as of the last sync">Updated at provider</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const status = campaignStatusInfo(c.status);
                const m = metricSet([countsFromRow(c)]);
                const updatedAtProvider = c.external_updated_at;
                const paused = c.status === 'paused';
                return (
                  <Tr key={c.id} onClick={() => onSelectCampaign(c.name)}>
                    <Td sticky className="max-w-[260px]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCampaign(c.name);
                        }}
                        className="group flex min-w-0 items-center gap-2 text-left"
                        title={`Open ${c.name}`}
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${paused ? 'bg-secondary' : 'bg-primary'}`} aria-hidden="true" />
                        <span className="truncate font-semibold text-on-surface group-hover:text-primary">{c.name}</span>
                        <ChevronRight size={14} className="shrink-0 text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                      </button>
                    </Td>
                    <Td>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status.color}`}>{status.label}</span>
                    </Td>
                    <Td align="right">{formatMetric('emailsSent', m.counts.emailsSent)}</Td>
                    <Td align="right">{formatMetric('prospectsContacted', m.counts.prospectsContacted)}</Td>
                    <Td align="right">{formatMetric('humanReplies', m.counts.humanReplies)}</Td>
                    <Td align="right" className="font-semibold text-primary">{formatMetric('replyRate', m.rates.replyRate)}</Td>
                    <Td align="right">{formatMetric('positive', m.counts.positive)}</Td>
                    <Td align="right">{formatMetric('positiveRate', m.rates.positiveRate)}</Td>
                    <Td align="right" muted>{formatMetric('bounces', m.counts.bounces)}</Td>
                    <Td muted className="text-xs">{updatedAtProvider ? relativeTime(updatedAtProvider) : '—'}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </DataTable>
        </div>
      </Panel>

      {/* ── 5. Email infrastructure + Recent activity ───────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:gap-6 xl:grid-cols-3">
        {/* Email Infrastructure */}
        <section className="flex flex-col rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-4 xl:col-span-2 md:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="type-section text-on-surface">
                Email Infrastructure
              </h2>
              <p className="mt-0.5 text-xs text-on-surface-variant" title={MANUAL_HELP}>
                Synced mailboxes are in Infrastructure. The figures below are entered by your team.
              </p>
            </div>
            <ToolBadge label={tool} />
          </div>

          <Link
            href={clientId ? `/infrastructure?client=${clientId}` : '/infrastructure'}
            className="group flex items-center justify-between gap-3 rounded-md border border-outline-variant/50 px-3 py-3 transition-colors hover:bg-surface-container-low"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-on-surface group-hover:text-primary">Mailboxes, warmup and domains</span>
              <span className="block text-xs text-on-surface-variant">
                Synced from Instantly: the mailboxes this client&apos;s campaigns send from, their warmup health and DNS checks.
              </span>
            </span>
            <ArrowUpRight size={16} className="shrink-0 text-on-surface-variant group-hover:text-primary" aria-hidden="true" />
          </Link>

          <div className="mt-3">
            <EmailInfrastructureSignals signals={infraSignals} onSave={saveInfraSignals} hideHeading stacked />
          </div>
        </section>

        {/* Recent Activity */}
        <section className="flex flex-col rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-4 md:p-6">
          <div className="mb-3">
            <h2 className="type-section text-on-surface">
              Recent Activity
            </h2>
            <p className="mt-0.5 text-xs text-on-surface-variant">
              Campaign start dates, last {ACTIVITY_WINDOW_DAYS} days. Sync status is shown at the top.
            </p>
          </div>

          {activity.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg bg-surface-container-low py-10 text-center">
              <ActivityIcon />
              <p className="mt-3 text-sm font-semibold text-on-surface">No campaigns started recently</p>
              <p className="mt-1 text-xs text-on-surface-variant">
                Campaigns with a start date in the last {ACTIVITY_WINDOW_DAYS} days appear here.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {activity.map((item) => (
                <li key={item.id} className="flex items-start gap-3">
                  <span className="mt-0.5 w-14 shrink-0 text-right text-xs tabular-nums text-on-surface-variant">{fmtDay(item.day)}</span>
                  <p className="min-w-0 break-words text-sm text-on-surface">{item.text}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function ActivityIcon() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-fixed/20">
      <Activity size={18} className="text-primary" />
    </div>
  );
}

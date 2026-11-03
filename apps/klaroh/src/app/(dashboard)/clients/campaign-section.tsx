'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { CampaignView } from '@/lib/types';
import { Target, Filter } from 'lucide-react';
import { campaignStatusInfo, latestTimestamp, providerLabel } from '@/lib/campaign-view';
import { countsFromRow, metricSet, type MetricSet } from '@/lib/analytics/metrics';
import { FunnelPanel, KpiPanel, PeriodNote } from '@/components/analytics/MetricPanels';
import { getClientCampaigns } from '@/lib/data/campaigns';
import EmailInfrastructureSignals, { type InfraSignals } from '@/components/EmailInfrastructureSignals';
import SyncStatus from '@/components/sync/SyncStatus';

// What the view shows: one campaign (identity + latest snapshot) or all of the
// client's campaigns. Metrics come from the shared metric layer.
interface CampaignSnapshot {
  name: string;
  campaign: CampaignView | null;
  set: MetricSet;
  asOf: string | null;
}

function aggregateCampaigns(rows: CampaignView[]): CampaignSnapshot {
  return { name: 'All Campaigns', campaign: null, set: metricSet(rows.map(countsFromRow)), asOf: latestTimestamp(rows) };
}

function campaignToSnapshot(c: CampaignView): CampaignSnapshot {
  return { name: c.name, campaign: c, set: metricSet([countsFromRow(c)]), asOf: c.captured_at ?? c.last_synced_at };
}

interface Campaign {
  id: string;
  name: string;
}

interface CampaignSectionProps {
  userId: string;
  clientId: string | null;
  clientName: string | null;
  clientSlug?: string | null;
  campaigns?: Campaign[];
  selectedCampaign?: string;
  initialCampaigns?: CampaignView[];
  initialInfraSignals?: InfraSignals;
}

export default function CampaignSection({
  userId,
  clientId,
  campaigns = [],
  selectedCampaign: selectedCampaignProp = 'All',
  initialCampaigns,
  initialInfraSignals,
}: CampaignSectionProps) {
  const selectedCampaign = selectedCampaignProp;
  const selectedCampaignId =
    selectedCampaign === 'All'
      ? null
      : (campaigns.find((c) => c.name === selectedCampaign)?.id ?? null);

  const pick = useCallback(
    (rows: CampaignView[]): CampaignSnapshot | null => {
      if (rows.length === 0) return null;
      if (!selectedCampaignId) return aggregateCampaigns(rows);
      const row = rows.find((r) => r.id === selectedCampaignId);
      return row ? campaignToSnapshot(row) : null;
    },
    [selectedCampaignId]
  );

  const [campaign, setCampaign] = useState<CampaignSnapshot | null>(() => pick(initialCampaigns ?? []));
  const [infraSignals, setInfraSignals] = useState<InfraSignals>(
    initialInfraSignals ?? {
      sending_capacity: null,
      active_inboxes: null,
      domain_health_score: null,
      domain_health_status: null,
    }
  );

  const loadCampaign = useCallback(async () => {
    if (!userId || !clientId) {
      setCampaign(null);
      return;
    }
    try {
      const rows = await getClientCampaigns(createClient(), clientId);
      setCampaign(pick(rows));
    } catch (err) {
      console.warn('loadCampaign failed:', err);
      setCampaign(null);
    }
  }, [userId, clientId, pick]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCampaign();
  }, [loadCampaign]);

  const saveInfraSignals = useCallback(async (updated: InfraSignals) => {
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
  }, [clientId]);

  if (campaigns.length === 0) {
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

  const single = campaign?.campaign ?? null;
  const statusBadge = single ? campaignStatusInfo(single.status) : null;
  const dash = (v: number | string | null | undefined) => (v === null || v === undefined ? '—' : String(v));

  return (
    <>
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PeriodNote asOf={campaign?.asOf ?? null} />
          <SyncStatus autoSync={!!clientId} onSynced={loadCampaign} />
        </div>
        {campaign ? (
          <KpiPanel set={campaign.set} title={single ? 'Campaign performance' : 'Performance'} />
        ) : (
          <div className="flex h-32 items-center justify-center rounded-lg border border-outline-variant/50 bg-surface-container-lowest text-sm text-on-surface-variant">
            No data yet — connect a tool to see performance.
          </div>
        )}
        <EmailInfrastructureSignals signals={infraSignals} onSave={saveInfraSignals} hideHeading />
      </div>

      {campaign ? (
        <FunnelPanel set={campaign.set} />
      ) : (
        <div className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-6 text-sm text-on-surface-variant">No data yet.</div>
      )}

      {/* Source-level detail for Instantly campaigns */}
      {campaign && (
        <div className="mt-6">
          {/* Campaign details */}
          <div className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 md:p-6">
            <div className="mb-4 flex items-center gap-2">
              <Filter size={15} className="text-primary" />
              <h4 className="font-sans text-sm font-semibold text-on-surface uppercase tracking-wider">Campaign Details</h4>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3">
              {[
                // Read-only: provider-backed campaigns are named by their provider and synced.
                { label: `Name (from ${providerLabel(single?.provider)})`, value: single?.provider_name ?? '—' },
                {
                  label: 'Status',
                  value: single?.unavailable_since ? (
                    <span
                      className="rounded-full bg-surface-container px-2 py-0.5 text-xs font-semibold text-on-surface-variant"
                      title={`Not returned by the provider since ${new Date(single.unavailable_since).toLocaleDateString()}. History is kept; it is no longer updated.`}
                    >
                      No longer at provider
                    </span>
                  ) : statusBadge ? (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadge.color}`}>{statusBadge.label}</span>
                  ) : '—',
                },
                { label: 'Evergreen', value: single?.is_evergreen == null ? '—' : single.is_evergreen ? 'Yes' : 'No' },
                { label: 'Senders', value: dash(single?.sender_count) },
                { label: 'Daily limit', value: dash(single?.daily_limit) },
                { label: 'Start date', value: dash(single?.start_date) },
                { label: 'End date', value: dash(single?.end_date) },
                { label: 'Created', value: single?.external_created_at ? new Date(single.external_created_at).toLocaleDateString() : '—' },
                { label: 'Updated', value: single?.external_updated_at ? new Date(single.external_updated_at).toLocaleDateString() : '—' },
              ].map((row) => (
                <div key={row.label}>
                  <dt className="font-sans text-xs uppercase tracking-wider text-on-surface-variant">{row.label}</dt>
                  <dd className="mt-0.5 font-sans text-sm font-medium text-on-surface">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </>
  );
}